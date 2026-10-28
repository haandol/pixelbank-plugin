import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mock, tempDirectory } from './helpers.js';

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
    PATH: process.env.PATH!, HOME: isolated, PIXELBANK_API_BASE_URL: m.base, PIXELBANK_AUTH_SCOPE: 'mock-host', PIXELBANK_CREDENTIALS_DIR: m.directory,
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
  assert.equal((await client.listTools()).tools.length, 4);
  await client.close(); assert.equal(stderr, '');
});
