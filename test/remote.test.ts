import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { mock } from './helpers.js';
import { callRemoteTool, listRemoteTools, OPERATION_TIMEOUT_MS } from '../src/remote.js';
import { MAX_RESPONSE_BYTES, boundedEventStream, readBoundedBody } from '../src/body.js';
import { SafeError, safeError } from '../src/errors.js';

const tool = { name: 'pixelbank_test_operation', inputSchema: { type: 'object', properties: {} } };
const original = { operation_key: 'original-operation', approval: { max_credits: 7, paid_fallback: false }, workflow: { run_id: 'run', step: 'compose', revision: 3 }, prompt: 'synthetic input' };
async function fixture(t: TestContext) {
  const m = await mock(); t.after(() => m.close()); m.flags.signedAccess = true;
  assert.equal(((await m.login()).result.data as any).status, 'connected');
  m.rpc.tools = [tool]; m.flags.apiBody = { data: { job_id: 'job', status: 'accepted' } };
  const token = async () => (await m.read())!.accessToken!;
  return { m, token };
}

test('current protocol uses authenticated stateless discovery and preserves operation/consent/provenance', async t => {
  const { m, token } = await fixture(t);
  assert.deepEqual(await listRemoteTools(m.base, token), [tool]);
  assert.deepEqual(await m.auth.callCreativeTool(tool.name, original), m.flags.apiBody);
  const requests = m.requests.filter(r => r.path === '/mcp');
  assert.ok(requests.some(r => (r.body as any).method === 'server/discover'));
  assert.ok(requests.every(r => !['initialize', 'notifications/initialized'].includes((r.body as any).method)));
  for (const r of requests) {
    assert.equal(r.headers['mcp-protocol-version'], '2026-07-28');
    assert.equal(r.headers['mcp-session-id'], undefined);
    assert.equal(r.token, `Bearer ${await token()}`);
  }
  assert.deepEqual((m.rpcCalls()[0]!.body as any).params.arguments, original);
});

test('explicit 2025-11-25 compatibility uses its initialize handshake without version fallback', async t => {
  const { m, token } = await fixture(t); m.rpc.protocolVersion = '2025-11-25';
  assert.deepEqual(await callRemoteTool(m.base, token, tool.name, original, { protocolVersion: '2025-11-25' }), m.flags.apiBody);
  const methods = m.requests.filter(r => r.path === '/mcp').map(r => (r.body as any).method);
  assert.deepEqual(methods, ['initialize', 'notifications/initialized', 'tools/call']);
  assert.equal(m.rpcCalls()[0]!.headers['mcp-protocol-version'], '2025-11-25');
});

test('unsupported current negotiation never tries legacy initialize or a creative write', async t => {
  const { m, token } = await fixture(t); m.rpc.protocolVersion = '2025-11-25';
  await assert.rejects(callRemoteTool(m.base, token, tool.name, original), { code: 'MCP_REQUEST_FAILED' });
  assert.equal(m.rpcCalls().length, 0);
  assert.ok(!m.requests.some(r => (r.body as any).method === 'initialize'));
});

test('revoked connection HTTP 403 retains its code and completes backend/provider/local cleanup', async t => {
  const { m } = await fixture(t); const grant = (await m.read())!;
  m.revokedFamilies.add(grant.connectionId!);
  await assert.rejects(m.auth.callCreativeTool(tool.name, original), { code: 'CONNECTION_INACTIVE' });
  assert.equal(await m.read(), undefined); assert.equal(m.refreshTokens.size, 0);
  assert.equal(m.counts.disconnect, 1); assert.equal(m.counts.revoke, 1);
  assert.equal(m.rpcCalls().length, 0);
});

test('insufficient scope stays denied without scope escalation, refresh, cleanup or write replay', async t => {
  const { m } = await fixture(t); const before = (await m.read())!;
  m.flags.apiStatus = 403; m.flags.apiBody = { error: { code: 'CONNECTION_FORBIDDEN', message: 'untrusted provider secret' } };
  await assert.rejects(m.auth.callCreativeTool(tool.name, original), { code: 'CONNECTION_FORBIDDEN' });
  const after = (await m.read())!;
  assert.deepEqual(after.oauth.scopes, before.oauth.scopes); assert.equal(after.status, 'active');
  assert.equal(m.counts.refresh, 0); assert.equal(m.counts.disconnect, 0); assert.equal(m.rpcCalls().length, 1);
});

test('401 does not replay; only explicit original retry refreshes the grant', async t => {
  const { m } = await fixture(t); m.flags.apiStatus = 401;
  await assert.rejects(m.auth.callCreativeTool(tool.name, original), { code: 'AUTH_REQUIRED' });
  assert.equal(m.counts.refresh, 0); assert.equal(m.rpcCalls().length, 1);
  m.flags.apiStatus = 200;
  await m.auth.callCreativeTool(tool.name, original);
  assert.equal(m.counts.refresh, 1); assert.equal(m.rpcCalls().length, 2);
  assert.deepEqual((m.rpcCalls()[1]!.body as any).params.arguments, original);
});

for (const status of [429, 503]) test(`HTTP ${status} preserves Retry-After and suppresses subsequent requests`, async t => {
  const { m } = await fixture(t); m.flags.apiStatus = status; m.flags.apiRetryAfter = '47'; m.flags.apiRawBody = 'invalid secret body';
  await assert.rejects(m.auth.callCreativeTool(tool.name, original), (e: SafeError) => { assert.equal(e.retryAfterSeconds, 47); assert.ok(!e.message.includes('secret body')); return true; });
  const count = m.requests.length;
  await assert.rejects(m.auth.callCreativeTool(tool.name, original), { code: 'REQUEST_THROTTLED' });
  assert.equal(m.requests.length, count);
});

for (const protocolVersion of ['2026-07-28', '2025-11-25'] as const) test(`${protocolVersion} retry aliases preserve the largest bounded delay`, async t => {
  const { m, token } = await fixture(t); m.rpc.protocolVersion = protocolVersion;
  for (const form of ['structured', 'text', 'http']) {
    m.flags.apiStatus = form === 'http' ? 429 : 200;
    m.flags.apiRetryAfter = form === 'http' ? '41' : undefined;
    const envelope = { error: { code: 'RATE_LIMITED', retryAfterSeconds: 43, retry_after_seconds: 47, retry_after: 53,
      message: 'provider-secret', unknown: 'provider-secret' } };
    m.flags.apiBody = envelope;
    m.rpc.result = form === 'text' ? { ...(protocolVersion === '2026-07-28' ? { resultType: 'complete' } : {}),
      isError: true, content: [{ type: 'text', text: JSON.stringify(envelope) }] } : undefined;
    await assert.rejects(callRemoteTool(m.base, token, tool.name, original, { protocolVersion }), error => {
      const output = safeError(error).error;
      assert.equal(output.code, 'RATE_LIMITED'); assert.equal(output.retryAfterSeconds, 53, form);
      assert.deepEqual(Object.keys(output).sort(), ['code', 'message', 'retryAfterSeconds']);
      assert.ok(!JSON.stringify(output).includes('provider-secret'));
      return true;
    });
  }
  assert.equal(m.rpcCalls().length, 3);
});

test('bounded HTTP errors preserve fixed status semantics without reflecting provider text', async t => {
  const { m, token } = await fixture(t);
  for (const [status, code] of [[403, 'CONNECTION_FORBIDDEN'], [502, 'API_ERROR']] as const) {
    m.flags.apiStatus = status; m.flags.apiRawBody = 'secret'.repeat(MAX_RESPONSE_BYTES);
    await assert.rejects(callRemoteTool(m.base, token, tool.name, original), (e: SafeError) => { assert.equal(e.code, code); assert.ok(!e.message.includes('secret')); return true; });
  }
  assert.equal(m.rpcCalls().length, 2);
});

test('oversized or malformed success bodies and disconnected writes fail without replay', async t => {
  const { m, token } = await fixture(t);
  for (const raw of ['{bad-secret', JSON.stringify({ padding: 'x'.repeat(MAX_RESPONSE_BYTES) })]) {
    m.flags.apiRawBody = raw;
    await assert.rejects(callRemoteTool(m.base, token, tool.name, original));
  }
  m.flags.apiRawBody = undefined; m.flags.apiDisconnect = true;
  await assert.rejects(callRemoteTool(m.base, token, tool.name, original), (error: unknown) => { assert.match(safeError(error).error.message, /original|automatically/); return true; });
  assert.equal(m.rpcCalls().length, 3);
});

test('redirect responses never forward bearer credentials or replay an operation', async t => {
  const { m, token } = await fixture(t);
  m.hooks.rpc = (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    res.writeHead(307, { location: `${m.origin}/capture` }).end(); return true;
  };
  await assert.rejects(callRemoteTool(m.base, token, tool.name, original));
  assert.equal(m.rpcCalls().length, 1); assert.ok(!m.requests.some(r => r.path === '/capture'));
});

test('structured errors cannot smuggle messages or signed tickets into model-visible diagnostics', async t => {
  const { m, token } = await fixture(t);
  m.flags.apiBody = { error: { code: 'bad secret https://s3.amazonaws.com/?X-Amz-Signature=secret', message: 'copy tokens' } };
  await assert.rejects(callRemoteTool(m.base, token, tool.name, original), (error: SafeError) => { assert.equal(error.code, 'API_ERROR'); assert.ok(!JSON.stringify(safeError(error)).includes('secret')); return true; });
});

for (const protocolVersion of ['2026-07-28', '2025-11-25'] as const) test(`${protocolVersion} remote errors retain typed consent and retry details across response forms`, async t => {
  const { m, token } = await fixture(t); m.rpc.protocolVersion = protocolVersion;
  const envelope = { error: { code: 'FREE_TRIAL_UNAVAILABLE', credit_cost: 5, retry_same_command: false,
    message: 'provider-secret', unknown: 'provider-secret', upload_url: 'https://fixture/?X-Amz-Signature=provider-secret' } };
  for (const form of ['structured', 'text', 'http']) {
    m.flags.apiStatus = form === 'http' ? 428 : 200; m.flags.apiBody = envelope;
    m.rpc.result = form === 'text' ? { ...(protocolVersion === '2026-07-28' ? { resultType: 'complete' } : {}),
      isError: true, content: [{ type: 'text', text: JSON.stringify(envelope) }] } : undefined;
    await assert.rejects(callRemoteTool(m.base, token, tool.name, original, { protocolVersion }), error => {
      assert.deepEqual(safeError(error), { error: { code: 'FREE_TRIAL_UNAVAILABLE',
        message: 'Free-use availability could not be confirmed. Paid fallback requires separate consent for this operation.',
        credit_cost: 5, retry_same_command: false } }, form);
      return true;
    });
  }
  assert.equal(m.rpcCalls().length, 3);
  for (const request of m.rpcCalls()) assert.deepEqual((request.body as any).params.arguments, original);
});

test('SSE delivers progress and a final result before the HTTP stream closes', async t => {
  const { m, token } = await fixture(t); let finished = false, progress = false;
  m.hooks.rpc = async (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: body.params._meta.progressToken, progress: 1, total: 2 } })}\r\n\r\n`);
    await delay(50); finished = true;
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', content: [], structuredContent: m.flags.apiBody } })}\n\n`);
    return true;
  };
  const result = await callRemoteTool(m.base, token, tool.name, original, { timeoutMs: 2000, onProgress: () => { assert.equal(finished, false); progress = true; } });
  assert.equal(progress, true); assert.deepEqual(result, m.flags.apiBody);
});

test('stream interruption and oversized SSE events do not reconnect or replay', async t => {
  const { m, token } = await fixture(t);
  for (const oversized of [false, true]) {
    m.hooks.rpc = (body, _req, res) => {
      if (body.method !== 'tools/call') return false;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(oversized ? `data: ${'x'.repeat(MAX_RESPONSE_BYTES + 1)}\n\n` : 'id: accepted\ndata: {}\n\n'); return true;
    };
    await assert.rejects(callRemoteTool(m.base, token, tool.name, original, { timeoutMs: 1000 }));
  }
  assert.equal(m.rpcCalls().length, 2);
  assert.ok(m.requests.filter(r => r.path === '/mcp').every(r => r.method === 'POST'));
});

test('bounded readers cancel oversized bodies; SSE permits many individually bounded events', async () => {
  let cancelled = false;
  const huge = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1)); }, cancel() { cancelled = true; } });
  assert.deepEqual(await readBoundedBody(huge), { kind: 'too-large' }); assert.equal(cancelled, true);
  const event = Buffer.from(`: ${'x'.repeat(MAX_RESPONSE_BYTES / 2)}\r\n\r\n`);
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(event); c.enqueue(event); c.close(); } });
  const reader = boundedEventStream(stream, () => new Error('large')).getReader();
  assert.equal((await reader.read()).value!.length, event.length); assert.equal((await reader.read()).value!.length, event.length);
  assert.equal((await reader.read()).done, true);
});

test('operation budget supports synchronous work beyond both old 30s and SDK 60s defaults', async t => {
  const { m, token } = await fixture(t); assert.ok(OPERATION_TIMEOUT_MS > 65_000);
  m.hooks.rpc = async (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    await delay(61_000);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', content: [], structuredContent: m.flags.apiBody } })); return true;
  };
  assert.deepEqual(await callRemoteTool(m.base, token, tool.name, original), m.flags.apiBody);
  assert.equal(m.rpcCalls().length, 1);
});
