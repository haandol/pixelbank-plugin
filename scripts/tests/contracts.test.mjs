import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncContracts, validateContracts } from '../sync-contracts.mjs';

const documents = [
  JSON.stringify({ schema_version: 1, tools: [{ name: 'pixelbank_example', inputSchema: { type: 'object', additionalProperties: false } }] }),
  JSON.stringify({ openapi: '3.1.0', paths: { '/example': { get: { 'x-mcp': { name: 'pixelbank_example' } } } } }),
];

test('public contract checking validates schemas and reviewed exposure without a private checkout', () => {
  assert.match(validateContracts(documents), /^[a-f0-9]{64}$/);
  const missing = JSON.parse(documents[1]); missing.paths['/example'].get['x-mcp'].name = 'pixelbank_missing';
  assert.throws(() => validateContracts([documents[0], JSON.stringify(missing)]), /missing from the tool catalog/);
  const invalid = JSON.parse(documents[0]); invalid.tools[0].inputSchema.$ref = 'https://invalid.example/schema';
  assert.throws(() => validateContracts([JSON.stringify(invalid), documents[1]]));
});

test('public synchronization reads both artifacts before writing and detects stale snapshots', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pixelbank-public-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), destination = join(root, 'plugins/pixelbank/contracts');
  await mkdir(source); await mkdir(destination, { recursive: true });
  await writeFile(join(source, 'mcp-tools.json'), documents[0]);
  await writeFile(join(source, 'workflows.openapi.json'), '{bad json');
  await writeFile(join(destination, 'tools.json'), 'manual');
  await assert.rejects(syncContracts(root, source, false));
  assert.equal(await readFile(join(destination, 'tools.json'), 'utf8'), 'manual');
  await writeFile(join(source, 'workflows.openapi.json'), documents[1]);
  await syncContracts(root, source, false);
  await syncContracts(root, source, true);
  await syncContracts(root, undefined, true);
  await writeFile(join(source, 'mcp-tools.json'), documents[0] + '\n');
  await assert.rejects(syncContracts(root, source, true), /Public contract is stale/);
  assert.equal(await readFile(join(destination, 'tools.json'), 'utf8'), documents[0]);
});
