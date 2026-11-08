import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, rm, access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mock, tempDirectory } from './helpers.js';
import { uncertainOutcome } from '../src/errors.js';

for (const protocol of ['2026-07-28', '2025-11-25'] as const) test(`portable bundle runs ${protocol} stdio, authentication and remote calls without node_modules`, async t => {
  const isolated = await tempDirectory(); t.after(() => rm(isolated, { recursive: true, force: true }));
  await cp('dist', join(isolated, 'bundle'), { recursive: true });
  await assert.rejects(access(join(isolated, 'node_modules')));
  const licenses = await readFile(join(isolated, 'bundle', 'THIRD_PARTY_LICENSES.txt'), 'utf8');
  assert.match(licenses, /EncBird/i); assert.match(licenses, /@modelcontextprotocol\/client 2\.4\.0/); assert.match(licenses, /jose 6\./); assert.match(licenses, /image-size 2\./);
  const originalLicense = await readFile('LICENSE.encbird', 'utf8'); assert.ok(licenses.includes(originalLicense));
  const m = await mock(); t.after(() => m.close()); m.flags.signedAccess = true; await m.login();
  m.rpc.tools = [{ name: 'pixelbank_get_account', inputSchema: { type: 'object', additionalProperties: false }, outputSchema: { type: 'object', required: ['data'], properties: { data: { type: 'object' } } } }];
  m.flags.apiBody = { data: { display_name: 'Fixture', credits: 7 } };
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(isolated, 'bundle', 'index.js')], cwd: isolated, stderr: 'pipe', env: {
    PATH: process.env.PATH!, PIXELBANK_API_BASE_URL: m.base, PIXELBANK_AUTH_SCOPE: 'mock-host', PIXELBANK_CREDENTIALS_DIR: m.directory,
  } });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({ name: 'fixture-host', version: '1' }, { supportedProtocolVersions: [protocol], versionNegotiation: { mode: protocol === '2026-07-28' ? { pin: protocol } : 'legacy' } });
  t.after(() => client.close()); await client.connect(transport, { timeout: 10_000 });
  const catalog = await client.listTools(); assert.ok(catalog.tools.some(t => t.name === 'pixelbank_get_account'));
  const account = await client.callTool({ name: 'pixelbank_get_account', arguments: {} });
  assert.deepEqual(account.structuredContent, m.flags.apiBody);
  let progressSeen = false;
  m.hooks.rpc = async (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: body.params._meta.progressToken, progress: 1, total: 2, message: 'Bearer private-progress' } })}\n\n`);
    await delay(40);
    res.end(`data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', content: [], structuredContent: m.flags.apiBody } })}\n\n`); return true;
  };
  const streamed = await client.callTool({ name: 'pixelbank_get_account', arguments: {} }, { onprogress: progress => { progressSeen = true; assert.equal(progress.message, undefined); assert.equal(progress.progress, 1); } });
  assert.equal(progressSeen, true); assert.deepEqual(streamed.structuredContent, m.flags.apiBody);
  delete m.hooks.rpc;
  const connection = await client.callTool({ name: 'pixelbank_connect', arguments: {} });
  assert.equal((connection.structuredContent as any).data.status, 'connected');
  const disconnected = await client.callTool({ name: 'pixelbank_disconnect', arguments: {} });
  assert.equal((disconnected.structuredContent as any).data.status, 'disconnected'); assert.equal(await m.read(), undefined);
  assert.equal((await client.listTools()).tools.length, 5);
  await client.close(); assert.equal(stderr, '');
});

for (const protocol of ['2026-07-28', '2025-11-25'] as const) test(`built ${protocol} stdio preserves only typed consent and retry details`, async t => {
  const isolated = await tempDirectory(); t.after(() => rm(isolated, { recursive: true, force: true }));
  await cp('dist', join(isolated, 'bundle'), { recursive: true });
  await assert.rejects(access(join(isolated, 'node_modules')));
  const m = await mock(); t.after(() => m.close()); m.flags.signedAccess = true; await m.login();
  const name = 'pixelbank_generate_image';
  m.rpc.tools = [{ name, inputSchema: { type: 'object' } }];
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(isolated, 'bundle', 'index.js')], cwd: isolated, stderr: 'pipe', env: {
    PATH: process.env.PATH!, PIXELBANK_API_BASE_URL: m.base, PIXELBANK_AUTH_SCOPE: 'mock-host', PIXELBANK_CREDENTIALS_DIR: m.directory,
  } });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({ name: 'consent-regression', version: '1' }, { supportedProtocolVersions: [protocol], versionNegotiation: { mode: protocol === '2026-07-28' ? { pin: protocol } : 'legacy' } });
  t.after(() => client.close()); await client.connect(transport, { timeout: 10_000 });
  const cases: { label: string; details: Record<string, unknown>; expected: Record<string, unknown>; rawCost?: string; code?: string; retryHeader?: string }[] = [
    { label: 'positive and true', details: { credit_cost: 5, retry_same_command: true }, expected: { credit_cost: 5, retry_same_command: true } },
    { label: 'zero and false', details: { credit_cost: 0, retry_same_command: false }, expected: { credit_cost: 0, retry_same_command: false } },
    { label: 'finite fraction', details: { credit_cost: 2.5 }, expected: { credit_cost: 2.5 } },
    { label: 'strings', details: { credit_cost: '5', retry_same_command: 'true' }, expected: {} },
    { label: 'nulls', details: { credit_cost: null, retry_same_command: null }, expected: {} },
    { label: 'booleans and numbers', details: { credit_cost: false, retry_same_command: 1 }, expected: {} },
    { label: 'containers', details: { credit_cost: { value: 5 }, retry_same_command: [] }, expected: {} },
    { label: 'negative cost', details: { credit_cost: -1, retry_same_command: false }, expected: { retry_same_command: false } },
    { label: 'positive overflow', details: { credit_cost: 'overflow', retry_same_command: true }, expected: { retry_same_command: true }, rawCost: '1e999' },
    { label: 'negative overflow', details: { credit_cost: 'overflow', retry_same_command: false }, expected: { retry_same_command: false }, rawCost: '-1e999' },
    { label: 'absent fields', details: {}, expected: {} },
    { label: 'already processed', code: 'ALREADY_PROCESSED', details: { retry_same_command: false }, expected: { retry_same_command: false } },
    { label: 'snake seconds', code: 'RATE_LIMITED', details: { retry_after_seconds: 47 }, expected: { retryAfterSeconds: 47 } },
    { label: 'short snake seconds', code: 'RATE_LIMITED', details: { retry_after: 53 }, expected: { retryAfterSeconds: 53 } },
    { label: 'camel delay wins', code: 'RATE_LIMITED', details: { retryAfterSeconds: 59, retry_after_seconds: 47, retry_after: 53 }, expected: { retryAfterSeconds: 59 } },
    { label: 'snake delay wins', code: 'RATE_LIMITED', details: { retryAfterSeconds: 31, retry_after_seconds: 47, retry_after: 53 }, expected: { retryAfterSeconds: 53 } },
    { label: 'header delay wins', code: 'RATE_LIMITED', retryHeader: '61', details: { retryAfterSeconds: 59, retry_after_seconds: 47, retry_after: 53 }, expected: { retryAfterSeconds: 61 } },
    { label: 'snake exceeds header', code: 'RATE_LIMITED', retryHeader: '40', details: { retryAfterSeconds: 45, retry_after_seconds: 47 }, expected: { retryAfterSeconds: 47 } },
    { label: 'wrong delay types', code: 'RATE_LIMITED', details: { retryAfterSeconds: '59', retry_after_seconds: '47', retry_after: true }, expected: { retryAfterSeconds: 30 } },
    { label: 'invalid delay bounds', code: 'RATE_LIMITED', details: { retryAfterSeconds: 0, retry_after_seconds: 86401, retry_after: 2.5 }, expected: { retryAfterSeconds: 30 } },
    { label: 'minimum delay', code: 'RATE_LIMITED', details: { retry_after_seconds: 1, retry_after: -1 }, expected: { retryAfterSeconds: 1 } },
    { label: 'maximum delay', code: 'RATE_LIMITED', details: { retry_after: 86400 }, expected: { retryAfterSeconds: 86400 } },
  ];
  for (const testCase of cases) {
    await m.clearTraffic();
    const input = { operation_key: `original-${testCase.label}`, maximum_credits: 5 };
    const code = testCase.code ?? 'FREE_TRIAL_UNAVAILABLE';
    let envelope = JSON.stringify({ error: { code, ...testCase.details,
      message: 'provider-secret', unknown: 'provider-secret', upload_url: 'https://fixture/?X-Amz-Signature=provider-secret' } });
    if (testCase.rawCost) envelope = envelope.replace('"credit_cost":"overflow"', `"credit_cost":${testCase.rawCost}`);
    m.hooks.rpc = (body, _req, res) => {
      if (body.method !== 'tools/call') return false;
      if (testCase.retryHeader) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': testCase.retryHeader }).end(envelope);
        return true;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(`{"jsonrpc":"2.0","id":${JSON.stringify(body.id)},"result":{"resultType":"complete","isError":true,"structuredContent":${envelope},"content":[{"type":"text","text":${JSON.stringify(envelope)}}]}}`);
      return true;
    };
    const result = await client.callTool({ name, arguments: input });
    const expected = { error: { code, message: code === 'ALREADY_PROCESSED'
      ? 'This operation is already recorded and was not run again. Check available results or the workflow in PixelbankStudio. Do not automatically resubmit with a new operation key; a new operation requires explicit user intent.'
      : code === 'RATE_LIMITED' ? `PixelbankStudio could not complete the operation (RATE_LIMITED). ${uncertainOutcome}`
        : 'Free-use availability could not be confirmed. Paid fallback requires separate consent for this operation.', ...testCase.expected } };
    assert.equal(result.isError, true, testCase.label);
    assert.deepEqual(result.structuredContent, expected, testCase.label);
    assert.deepEqual(result.content, [{ type: 'text', text: JSON.stringify(expected) }], testCase.label);
    assert.deepEqual((m.rpcCalls().at(-1)!.body as any).params.arguments, input);
  }
  assert.equal(m.rpcCalls().length, cases.length);
  assert.equal(m.counts.refresh, 0); assert.equal(m.counts.disconnect, 0);
  await client.close(); assert.equal(stderr, '');
});

for (const protocol of ['2026-07-28', '2025-11-25'] as const) test(`built ${protocol} stdio distinguishes a missing image from service failure without replay`, async t => {
  const isolated = await tempDirectory(); t.after(() => rm(isolated, { recursive: true, force: true }));
  await cp('dist', join(isolated, 'bundle'), { recursive: true });
  const m = await mock(); t.after(() => m.close()); m.flags.signedAccess = true; await m.login();
  m.rpc.tools = [{ name: 'pixelbank_get_asset', inputSchema: { type: 'object' } }];
  m.flags.apiBody = { error: { code: 'ASSET_NOT_FOUND', message: 'private storage detail' } };
  m.hooks.rpc = (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', isError: true,
        structuredContent: m.flags.apiBody, content: [] },
    }));
    return true;
  };
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(isolated, 'bundle', 'index.js')], cwd: isolated, stderr: 'pipe', env: {
    PATH: process.env.PATH!, PIXELBANK_API_BASE_URL: m.base, PIXELBANK_AUTH_SCOPE: 'mock-host', PIXELBANK_CREDENTIALS_DIR: m.directory,
  } });
  const client = new Client({ name: 'missing-asset-regression', version: '1' }, { supportedProtocolVersions: [protocol], versionNegotiation: { mode: protocol === '2026-07-28' ? { pin: protocol } : 'legacy' } });
  t.after(() => client.close()); await client.connect(transport, { timeout: 10_000 });
  const input = { namespace: 'generation', filename: 'deleted.png' };
  const result = await client.callTool({ name: 'pixelbank_get_asset', arguments: input });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, { error: {
    code: 'ASSET_NOT_FOUND', message: 'The requested image is unavailable. Refresh the library or choose another image.',
  } });
  assert.equal(m.rpcCalls().length, 1);
  assert.deepEqual((m.rpcCalls()[0]!.body as any).params.arguments, input);
  assert.equal(m.counts.refresh, 0); assert.equal(m.counts.disconnect, 0);
});

for (const protocol of ['2026-07-28', '2025-11-25'] as const) test(`built ${protocol} stdio opens the fixed credit page once and retains its link without resubmission`, async t => {
  const isolated = await tempDirectory(); t.after(() => rm(isolated, { recursive: true, force: true }));
  await cp('dist', join(isolated, 'bundle'), { recursive: true });
  const m = await mock(); t.after(() => m.close()); m.flags.signedAccess = true; await m.login();
  m.rpc.tools = [{ name: 'pixelbank_generate_image', inputSchema: { type: 'object' } }];
  m.hooks.rpc = (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', isError: true, content: [],
        structuredContent: { error: { code: 'NOT_ENOUGH_CREDIT', credit_cost: 5, retry_same_command: false } } },
    })); return true;
  };
  const bin = join(isolated, 'bin'), opened = join(isolated, 'opened-page.txt');
  await mkdir(bin);
  const script = '#!/bin/sh\nprintf "%s\\n" "$1" >> "$PIXELBANK_TEST_OPEN_LOG"\n';
  for (const name of ['open', 'xdg-open']) await writeFile(join(bin, name), script, { mode: 0o700 });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(isolated, 'bundle', 'index.js')], cwd: isolated, stderr: 'pipe', env: {
    PATH: `${bin}:${process.env.PATH!}`, PIXELBANK_API_BASE_URL: m.base, PIXELBANK_AUTH_SCOPE: 'mock-host',
    PIXELBANK_CREDENTIALS_DIR: m.directory, PIXELBANK_TEST_OPEN_LOG: opened,
  } });
  const client = new Client({ name: 'credit-recovery-regression', version: '1' }, { supportedProtocolVersions: [protocol], versionNegotiation: { mode: protocol === '2026-07-28' ? { pin: protocol } : 'legacy' } });
  t.after(() => client.close()); await client.connect(transport, { timeout: 10_000 });
  const input = { request: { options: { prompt: 'Robot' } }, operation_key: 'original-shortfall', maximum_credits: 5 };
  const result = await client.callTool({ name: 'pixelbank_generate_image', arguments: input });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, { error: {
    code: 'NOT_ENOUGH_CREDIT', message: 'There are not enough credits. Add credits at https://www.pixelbankstudio.com/pricing, then ask to continue the original request.',
    credit_cost: 5, retry_same_command: false, credits_url: 'https://www.pixelbankstudio.com/pricing', credits_page_opened: true,
  } });
  assert.equal(await readFile(opened, 'utf8'), 'https://www.pixelbankstudio.com/pricing\n');
  assert.equal(m.rpcCalls().length, 1);
  assert.deepEqual((m.rpcCalls()[0]!.body as any).params.arguments, input);
  assert.equal(m.counts.refresh, 0); assert.equal(m.counts.disconnect, 0);
});
