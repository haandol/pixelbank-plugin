import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { mock } from './helpers.js';
import { uploadImage, readSelectedImage, validateTicket } from '../src/upload.js';
import { DEFAULT_BASE } from '../src/config.js';
import { Secrets } from '../src/errors.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
const request = { purpose: 'workflow-input', content_type: 'image/png', size_bytes: png.length, width: 1, height: 1, checksum_sha256: createHash('sha256').update(png).digest('base64') };
function ticket(input = request, origin = 'https://fixtures.s3.us-east-1.amazonaws.com') {
  const key = `local/tmp/image-uploads/test-user/${input.purpose}/${'a'.repeat(32)}.png`;
  return { upload_url: `${origin}/${key}?${new URLSearchParams({ 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': 'fixture/20261028/us-east-1/s3/aws4_request', 'X-Amz-Date': '20261028T000000Z', 'X-Amz-Expires': '900', 'X-Amz-SignedHeaders': 'host', 'X-Amz-Signature': 'b'.repeat(64) })}`, reference: { key, ...input }, headers: {
    'content-type': input.content_type, 'x-amz-checksum-sha256': input.checksum_sha256,
    'x-amz-meta-owner': 'test-user', 'x-amz-meta-purpose': input.purpose, 'x-amz-meta-checksum-sha256': input.checksum_sha256,
    'x-amz-meta-width': String(input.width), 'x-amz-meta-height': String(input.height), 'x-amz-tagging': 'retention=pending-upload', 'x-amz-storage-class': 'INTELLIGENT_TIERING',
  } };
}
async function fixture(t: TestContext) {
  const m = await mock(); t.after(() => m.close()); m.flags.signedAccess = true; await m.login();
  const path = join(m.directory, 'selected.data'); await fs.writeFile(path, png);
  const uploads: { bytes: Buffer; headers: Record<string, unknown>; path: string }[] = [];
  let issued: ReturnType<typeof ticket> | undefined;
  const settings = { mutate: (value: any) => value, status: 200 };
  m.hooks.rpc = (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    let data: unknown;
    if (body.params.name === 'pixelbank_issue_upload') data = issued = settings.mutate(ticket(body.params.arguments, m.origin));
    else if (body.params.name === 'pixelbank_save_source') data = { asset: { namespace: 'workflow', filename: 'persistent.png' } };
    else return false;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', structuredContent: { data }, content: [] } })); return true;
  };
  m.hooks.upload = async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    uploads.push({ bytes: Buffer.concat(chunks), headers: req.headers, path: req.url! });
    res.writeHead(settings.status, settings.status === 307 ? { location: `${m.origin}/capture` } : {}).end(); return true;
  };
  return { m, path, uploads, settings, issued: () => issued! };
}

test('explicit image uploads exact bytes and headers, returns only its reference, and never sends account credentials to storage', async t => {
  const f = await fixture(t);
  const result = await uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose: 'workflow-input' });
  assert.equal(f.uploads.length, 1); assert.deepEqual(f.uploads[0]!.bytes, png);
  for (const [name, value] of Object.entries(f.issued().headers)) assert.equal(f.uploads[0]!.headers[name], value);
  assert.equal(f.uploads[0]!.headers.authorization, undefined); assert.equal(f.uploads[0]!.headers.cookie, undefined);
  assert.deepEqual(result, { data: { reference: f.issued().reference } });
  assert.ok(!JSON.stringify(result).includes('X-Amz-'));
  assert.ok(!JSON.stringify(f.m.rpcCalls().map(r => r.body)).includes(f.path));
  assert.deepEqual((f.m.rpcCalls()[0]!.body as any).params.arguments, request);
  assert.equal(f.m.secrets.clean(f.issued().upload_url), '[redacted]');
});

test('persistent upload calls save_source only after successful PUT and retains data.asset contract', async t => {
  const f = await fixture(t);
  const result = await uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose: 'workflow-input', save_source: true });
  assert.deepEqual(result, { data: { asset: { namespace: 'workflow', filename: 'persistent.png' } } });
  assert.deepEqual(f.m.rpcCalls().map(r => (r.body as any).params.name), ['pixelbank_issue_upload', 'pixelbank_save_source']);
  assert.deepEqual((f.m.rpcCalls()[1]!.body as any).params.arguments, f.issued().reference);
});

test('unexpected ticket fields, image data, owner, headers and destination fail before PUT or persistence', async t => {
  const f = await fixture(t);
  const changes = [
    (v: any) => { v.reference.width = 2; }, (v: any) => { v.reference.purpose = 'generation-base'; },
    (v: any) => { v.reference.checksum_sha256 = 'wrong'; }, (v: any) => { v.reference.credentials = 'hidden'; },
    (v: any) => { v.headers.authorization = 'Bearer injected'; }, (v: any) => { v.headers.cookie = 'injected'; },
    (v: any) => { v.headers['Content-Type'] = 'image/png'; }, (v: any) => { delete v.headers['x-amz-checksum-sha256']; },
    (v: any) => { v.headers['x-amz-meta-owner'] = 'someone-else'; },
    (v: any) => { v.upload_url = v.upload_url.replace(f.m.origin, 'https://attacker.invalid'); },
    (v: any) => { v.upload_url = v.upload_url.replace(f.m.origin, 'http://127.0.0.1:1'); },
    (v: any) => { v.upload_url = v.upload_url.replace('a'.repeat(32), 'c'.repeat(32)); },
  ];
  for (const change of changes) {
    f.settings.mutate = value => { change(value); return value; };
    await assert.rejects(uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose: 'workflow-input', save_source: true }), { code: 'INVALID_UPLOAD' });
  }
  assert.equal(f.uploads.length, 0);
  assert.ok(f.m.rpcCalls().every(r => (r.body as any).params.name === 'pixelbank_issue_upload'));
});

test('S3 tickets require signed URL shape, exact object key and approved headers', () => {
  assert.ok(validateTicket(ticket(), DEFAULT_BASE, request, 'test-user'));
  const variants = [
    (v: any) => { v.upload_url = v.upload_url.replace('https:', 'http:'); },
    (v: any) => { v.upload_url = v.upload_url.replace('.amazonaws.com', '.amazonaws.com.attacker.invalid'); },
    (v: any) => { v.upload_url += '#fragment'; }, (v: any) => { v.upload_url = v.upload_url.replace('900', '901'); },
    (v: any) => { v.upload_url += '&X-Amz-Expires=900'; }, (v: any) => { v.upload_url = v.upload_url.split('?')[0]; },
    (v: any) => { v.headers['x-amz-storage-class'] = 'STANDARD'; }, (v: any) => { v.reference.key += '/other'; },
  ];
  for (const change of variants) { const value = ticket(); change(value); assert.throws(() => validateTicket(value, DEFAULT_BASE, request, 'test-user'), { code: 'INVALID_UPLOAD' }); }
});

test('failed and redirected uploads never save a source, follow redirects or automatically retry', async t => {
  const f = await fixture(t);
  for (const status of [403, 307]) {
    f.settings.status = status;
    await assert.rejects(uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose: 'workflow-input', save_source: true }), { code: 'UPLOAD_FAILED' });
  }
  assert.equal(f.uploads.length, 2); assert.equal(f.m.rpcCalls().length, 2);
  assert.ok(!f.m.requests.some(r => r.path === '/capture'));
});

test('formats, bytes, dimensions and purpose are checked before requesting any ticket', async t => {
  const f = await fixture(t);
  for (const bytes of [Buffer.from('not an image'), Buffer.alloc(0), Buffer.alloc(5 * 1024 * 1024 + 1), Buffer.from('<svg/>')]) {
    await fs.writeFile(f.path, bytes);
    await assert.rejects(uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose: 'workflow-input' }), { code: 'IMAGE_PREPARATION_REQUIRED' });
  }
  for (const purpose of ['previsualization-reference', 'previsualization-camera-clean', 'previsualization-camera-guide', 'previsualization-thumbnail']) {
    await assert.rejects(uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose }), { code: 'INVALID_INPUT' });
  }
  const large = Buffer.from(png);
  large.writeUInt32BE(2049, 16); await fs.writeFile(f.path, large);
  await assert.rejects(uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose: 'generation-base' }), { code: 'IMAGE_PREPARATION_REQUIRED' });
  await assert.rejects(uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose: 'arbitrary-purpose' }), { code: 'INVALID_INPUT' });
  await assert.rejects(uploadImage(f.m.auth, f.m.base, { file_path: f.path, purpose: 'generation-base', save_source: true }), { code: 'INVALID_INPUT' });
  assert.equal(f.m.rpcCalls().length, 0);
});

test('symlinks, directories and a deterministic lstat/open path swap never read an unselected file', async t => {
  const f = await fixture(t); const other = join(f.m.directory, 'unselected'); await fs.writeFile(other, 'unselected private content');
  const link = join(f.m.directory, 'link'); await fs.symlink(other, link);
  await assert.rejects(readSelectedImage(link, 1024), { code: 'IMAGE_PREPARATION_REQUIRED' });
  await assert.rejects(readSelectedImage(f.m.directory, 1024), { code: 'IMAGE_PREPARATION_REQUIRED' });
  const originalOpen = fs.open;
  let swaps = 0;
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    if (args[0] === f.path) { swaps++; await fs.rename(f.path, `${f.path}.original`); await fs.symlink(other, f.path); }
    return originalOpen(...args);
  });
  try { await assert.rejects(readSelectedImage(f.path, 1024), { code: 'IMAGE_PREPARATION_REQUIRED' }); }
  finally { t.mock.restoreAll(); }
  assert.equal(swaps, 1);
  assert.equal(f.m.rpcCalls().length, 0); assert.equal(await fs.readFile(other, 'utf8'), 'unselected private content');
});

test('credential and signed upload URL redaction covers nested values and keys', () => {
  const secrets = new Secrets(); secrets.add('opaque-test-refresh');
  const clean = JSON.stringify(secrets.clean({ upload_url: ticket().upload_url, nested: ['opaque-test-refresh', `Storage ${ticket().upload_url}`, { refreshToken: 'new', Authorization: 'Bearer abc' }] }));
  assert.ok(!clean.includes('X-Amz-')); assert.ok(!clean.includes('opaque-test-refresh')); assert.ok(!clean.includes('Bearer abc'));
});
