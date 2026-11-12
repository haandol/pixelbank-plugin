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
  assert.deepEqual(result.tools.map(t => t.name).sort(), ['pixelbank_connect', 'pixelbank_disconnect', 'pixelbank_open_credits_page', 'pixelbank_open_workspace', 'pixelbank_upload_image']);
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

for (const control of ['pixelbank_connect', 'pixelbank_open_credits_page', 'pixelbank_wait_for_workflow']) test(`remote catalog cannot replace ${control}, including calls made before tools/list`, async t => {
  const { m, client } = await fixture(t);
  m.rpc.tools = [{ name: control, inputSchema: { type: 'object' } }, { name: 'pixelbank_test', inputSchema: { type: 'object' } }];
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

test('remote calls validate a refreshed contract even after an earlier discovery', async t => {
  const { m, client } = await fixture(t);
  m.rpc.tools = [{ name: 'pixelbank_test', inputSchema: { type: 'object', properties: { run_id: { type: 'string' } },
    required: ['run_id'], additionalProperties: false } }];
  await client.listTools();
  m.rpc.tools[0]!.inputSchema = { type: 'object', properties: { run_id: { type: 'string' }, revision: { type: 'integer', minimum: 1 } },
    required: ['run_id', 'revision'], additionalProperties: false };
  const denied = await client.callTool({ name: 'pixelbank_test', arguments: { run_id: 'run' } });
  assert.equal((denied.structuredContent as any).error.code, 'INVALID_INPUT');
  assert.equal(m.rpcCalls().length, 0);
  m.flags.apiBody = { data: { accepted: true } };
  const accepted = await client.callTool({ name: 'pixelbank_test', arguments: { run_id: 'run', revision: 1 } });
  assert.notEqual(accepted.isError, true);
  assert.equal(m.rpcCalls().length, 1);
});

test('workflow wait is discovered conditionally and dispatches only the status read', async t => {
  const { m, client } = await fixture(t);
  m.rpc.tools = [{ name: 'pixelbank_get_workflow_status', inputSchema: { type: 'object',
    properties: { run_id: { type: 'string', minLength: 1 } }, required: ['run_id'], additionalProperties: false } }];
  const catalog = await client.listTools();
  assert.ok(catalog.tools.some(tool => tool.name === 'pixelbank_wait_for_workflow'));
  m.flags.apiBody = { data: { run_id: 'run', status: 'completed', revision: 3, pollable: false, terminal: true,
    poll_after_seconds: 0, completed_steps: 2, total_steps: 2 } };
  const result = await client.callTool({ name: 'pixelbank_wait_for_workflow', arguments: { run_id: 'run', max_wait_seconds: 1 } });
  assert.equal((result.structuredContent as any).wait.reason, 'terminal');
  assert.deepEqual(m.rpcCalls().map(call => (call.body as any).params.name), ['pixelbank_get_workflow_status']);
  m.rpc.tools = [];
  const refreshed = await client.listTools();
  assert.ok(!refreshed.tools.some(tool => tool.name === 'pixelbank_wait_for_workflow'));
  const missing = await client.callTool({ name: 'pixelbank_wait_for_workflow', arguments: { run_id: 'run' } });
  assert.equal((missing.structuredContent as any).error.code, 'UNKNOWN_TOOL');
  assert.equal(m.rpcCalls().length, 1);
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

test('credit page opens the fixed public destination without sign-in, payment input or remote calls', async t => {
  const { m, client, opens, settings } = await fixture(t, false);
  const creditsUrl = 'https://www.pixelbankstudio.com/pricing';
  const opened = await client.callTool({ name: 'pixelbank_open_credits_page', arguments: {} });
  assert.deepEqual(opened.structuredContent, { data: { url: creditsUrl, opened: true } });
  assert.deepEqual(opens, [creditsUrl]); assert.equal(m.requests.length, 0);
  for (const input of [{ url: 'https://attacker.invalid' }, { plan_id: 'plan' }, { access_token: 'supplied-secret' }]) {
    const denied = await client.callTool({ name: 'pixelbank_open_credits_page', arguments: input });
    assert.equal(denied.isError, true);
  }
  assert.equal(opens.length, 1); assert.equal(m.requests.length, 0);
  settings.unavailable = true;
  const fallback = await client.callTool({ name: 'pixelbank_open_credits_page', arguments: {} });
  assert.equal((fallback.structuredContent as any).data.opened, false);
  assert.equal((fallback.structuredContent as any).data.url, creditsUrl);
  assert.equal(fallback.isError, false);
});

for (const browserUnavailable of [false, true]) test(`insufficient credits opens its fixed recovery page and preserves the refusal when browser unavailable=${browserUnavailable}`, async t => {
  const { m, client, opens, settings } = await fixture(t); settings.unavailable = browserUnavailable;
  const creditsUrl = 'https://www.pixelbankstudio.com/pricing';
  m.rpc.tools = [{ name: 'pixelbank_generate_image', inputSchema: { type: 'object' } }];
  m.hooks.rpc = (body, _req, res) => {
    if (body.method !== 'tools/call') return false;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', isError: true, content: [],
        structuredContent: { error: { code: 'NOT_ENOUGH_CREDIT', credit_cost: 5, retry_same_command: false,
          recovery_url: 'https://attacker.invalid', message: 'private-provider-detail' } } },
    })); return true;
  };
  const input = { request: { options: { prompt: 'Robot' } }, operation_key: 'original-credit-operation', maximum_credits: 5 };
  const result = await client.callTool({ name: 'pixelbank_generate_image', arguments: input });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, { error: {
    code: 'NOT_ENOUGH_CREDIT', message: `There are not enough credits. Add credits at ${creditsUrl}, then ask to continue the original request.`,
    credit_cost: 5, retry_same_command: false, credits_url: creditsUrl, credits_page_opened: !browserUnavailable,
  } });
  assert.deepEqual(opens, [creditsUrl]); assert.equal(m.rpcCalls().length, 1);
  assert.deepEqual((m.rpcCalls()[0]!.body as any).params.arguments, input);
  assert.equal(m.counts.refresh, 0); assert.equal(m.counts.disconnect, 0);
  assert.ok(!JSON.stringify(result).includes('attacker.invalid'));
  assert.ok(!JSON.stringify(result).includes('private-provider-detail'));
});

test('free-use lookup, price and consent refusals keep their recovery without credit-page navigation', async t => {
  const { m, client, opens } = await fixture(t);
  m.rpc.tools = [{ name: 'pixelbank_generate_image', inputSchema: { type: 'object' } }];
  for (const code of ['FREE_TRIAL_UNAVAILABLE', 'CREDIT_PRICE_CHANGED', 'MCP_APPROVAL_INVALID']) {
    m.hooks.rpc = (body, _req, res) => {
      if (body.method !== 'tools/call') return false;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', isError: true, content: [],
          structuredContent: { error: { code, credit_cost: 5 } } },
      })); return true;
    };
    const result = await client.callTool({ name: 'pixelbank_generate_image', arguments: { operation_key: code, maximum_credits: 5 } });
    assert.equal(result.isError, true); assert.equal((result.structuredContent as any).error.code, code);
    assert.equal((result.structuredContent as any).error.credits_url, undefined);
  }
  assert.equal(opens.length, 0); assert.equal(m.rpcCalls().length, 3);
});

test('zero balance with a valid free-use result does not open credit recovery', async t => {
  const { m, client, opens } = await fixture(t);
  m.rpc.tools = [{ name: 'pixelbank_get_account', inputSchema: { type: 'object' } }, { name: 'pixelbank_generate_image', inputSchema: { type: 'object' } }];
  m.flags.apiBody = { data: { credits: 0, free_uses: { generation: 1 } } };
  const account = await client.callTool({ name: 'pixelbank_get_account', arguments: {} });
  assert.equal(account.isError, false);
  m.flags.apiBody = { data: { generation_id: 'free-job', status: 'PENDING', used_free_trial: true } };
  const result = await client.callTool({ name: 'pixelbank_generate_image', arguments: { operation_key: 'free-original', maximum_credits: 0 } });
  assert.equal(result.isError, false); assert.equal(opens.length, 0);
});
