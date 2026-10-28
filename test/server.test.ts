import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServer, validateWorkspaceURL } from '../src/server.js';
import { DEFAULT_BASE } from '../src/config.js';
import { mock } from './helpers.js';
import { setTimeout as delay } from 'node:timers/promises';

const id = 'a'.repeat(64), url = `https://www.pixelbankstudio.com/generation?workspace=${id}&workflow=workflow_1&step=composition`;
async function fixture(t: TestContext, connected = true) {
  const m = await mock(); t.after(() => m.close()); m.flags.signedAccess = true;
  if (connected) await m.login();
  const opens: string[] = [];
  const settings = { unavailable: false };
  const runtime = createServer('fixture', { auth: m.auth, browser: async value => { opens.push(value); if (settings.unavailable) throw new Error('fixture opener unavailable'); } });
  t.after(() => runtime.stop());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await runtime.server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1' }); t.after(() => client.close()); await client.connect(clientTransport);
  return { m, client, opens, settings };
}

test('disconnected catalog includes connection/local controls and never leaks the remote catalog', async t => {
  const { m, client } = await fixture(t, false);
  const result = await client.listTools();
  assert.deepEqual(result.tools.map(t => t.name).sort(), ['pixelbank_connect', 'pixelbank_disconnect', 'pixelbank_open_workspace', 'pixelbank_upload_image']);
  assert.equal(m.requests.length, 0);
  const denied = await client.callTool({ name: 'pixelbank_connect', arguments: { access_token: 'supplied-secret' } });
  assert.equal(denied.isError, true); assert.ok(!JSON.stringify(denied).includes('supplied-secret'));
});

test('authenticated catalog preserves remote schemas/annotations but keeps upload tickets private', async t => {
  const { m, client } = await fixture(t);
  const remote = { name: 'pixelbank_prepare_workspace', description: 'Prepare', inputSchema: { type: 'object', required: ['operation_key'], properties: { operation_key: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } };
  m.rpc.tools = [remote, ...['pixelbank_issue_upload', 'pixelbank_save_source'].map(name => ({ name, inputSchema: { type: 'object' } }))];
  const catalog = await client.listTools();
  assert.deepEqual(catalog.tools.find(t => t.name === remote.name), remote);
  for (const name of ['pixelbank_issue_upload', 'pixelbank_save_source']) {
    assert.ok(!catalog.tools.some(t => t.name === name));
    const result = await client.callTool({ name, arguments: {} }); assert.equal(result.isError, true);
  }
  assert.equal(m.rpcCalls().length, 0);
});

test('remote catalog cannot replace local controls, including calls made before tools/list', async t => {
  const { m, client } = await fixture(t);
  m.rpc.tools = [{ name: 'pixelbank_connect', inputSchema: { type: 'object' } }, { name: 'pixelbank_test', inputSchema: { type: 'object' } }];
  const result = await client.callTool({ name: 'pixelbank_test', arguments: {} });
  assert.equal(result.isError, true); assert.equal((result.structuredContent as any).error.code, 'INVALID_CATALOG');
  assert.equal(m.rpcCalls().length, 0);
});

test('workspace open resolves the exact owned ID, invokes only the injected opener, and keeps URL on failure', async t => {
  const { m, client, opens, settings } = await fixture(t);
  m.flags.apiBody = { data: { workspace_id: id, url } };
  let result = await client.callTool({ name: 'pixelbank_open_workspace', arguments: { workspace_id: id } });
  assert.deepEqual(result.structuredContent, { data: { workspace_id: id, url, opened: true } });
  assert.deepEqual(opens, [url]);
  assert.deepEqual((m.rpcCalls()[0]!.body as any).params, { name: 'pixelbank_get_workspace', arguments: { workspace_id: id }, _meta: (m.rpcCalls()[0]!.body as any).params._meta });
  settings.unavailable = true;
  result = await client.callTool({ name: 'pixelbank_open_workspace', arguments: { workspace_id: id } });
  assert.equal((result.structuredContent as any).data.opened, false); assert.equal((result.structuredContent as any).data.url, url);
  assert.ok(m.rpcCalls().every(r => (r.body as any).params.name === 'pixelbank_get_workspace'));
});

test('workspace URLs cannot substitute identity, editor, navigation credentials or arbitrary hosts', async t => {
  const { m, client, opens } = await fixture(t);
  const invalid = [
    url.replace(id, 'b'.repeat(64)), url.replace('www.pixelbankstudio.com', 'attacker.invalid'),
    url.replace('https:', 'http:'), url.replace('/generation', '/profile'), `${url}&token=secret`,
    `${url}&workspace=${id}`, `${url}#secret`, url.replace('https://', 'https://user:pass@'),
    `${url}&step=other`, url.replace('workflow_1', 'Bearer%20token'), `http://127.0.0.1:4000/generation?workspace=${id}`, 'not a URL',
  ];
  for (const value of invalid) {
    m.flags.apiBody = { data: { url: value } };
    const result = await client.callTool({ name: 'pixelbank_open_workspace', arguments: { workspace_id: id } });
    assert.equal(result.isError, true); assert.equal((result.structuredContent as any).error.code, 'INVALID_WORKSPACE');
  }
  assert.equal(opens.length, 0);
  assert.equal(validateWorkspaceURL(url.replace('/generation', '/segment'), DEFAULT_BASE, id).includes('/segment?'), true);
});

test('remote secrets are removed from both structured and text tool results', async t => {
  const { m, client } = await fixture(t);
  m.rpc.tools = [{ name: 'pixelbank_test', inputSchema: { type: 'object' } }];
  const token = (await m.read())!.refreshToken!;
  m.flags.apiBody = { data: { access_token: 'never', nested: [`echo ${token}`, 'Bearer other-secret'], upload_url: 'https://fixture/?X-Amz-Signature=private' } };
  const result = await client.callTool({ name: 'pixelbank_test', arguments: {} });
  const text = JSON.stringify(result);
  for (const secret of [token, 'other-secret', 'never', 'X-Amz-Signature']) assert.ok(!text.includes(secret));
});

test('host cancellation closes the remote request stream without replaying the accepted operation', async t => {
  const { m, client } = await fixture(t);
  m.rpc.tools = [{ name: 'pixelbank_test', inputSchema: { type: 'object' } }];
  let accepted!: () => void, closed!: () => void;
  const acceptance = new Promise<void>(resolve => { accepted = resolve; });
  const closure = new Promise<void>(resolve => { closed = resolve; });
  m.hooks.rpc = (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    res.on('close', closed); res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': accepted\n\n'); accepted(); return true;
  };
  const abort = new AbortController();
  const pending = client.callTool({ name: 'pixelbank_test', arguments: { operation_key: 'retain-me' } }, { signal: abort.signal, timeout: 3000 });
  const rejection = assert.rejects(pending);
  await acceptance; abort.abort(); await rejection;
  await Promise.race([closure, delay(1000).then(() => assert.fail('remote stream remained open after host cancellation'))]);
  assert.equal(m.rpcCalls().length, 1); assert.equal((m.rpcCalls()[0]!.body as any).params.arguments.operation_key, 'retain-me');
});
