import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';

const files = [['mcp-tools.json', 'tools.json'], ['workflows.openapi.json', 'workflows.openapi.json']];

export function validateContracts(documents) {
  const tools = JSON.parse(documents[0]), api = JSON.parse(documents[1]);
  if (tools.schema_version !== 1 || !Array.isArray(tools.tools) || !tools.tools.length || api.openapi !== '3.1.0' ||
    !api.paths || typeof api.paths !== 'object' || Array.isArray(api.paths)) throw new Error('Invalid generated contract format');
  const names = new Set(tools.tools.map(tool => tool.name));
  if (names.size !== tools.tools.length) throw new Error('Duplicate tool contract');
  const validator = new AjvJsonSchemaValidator();
  for (const tool of tools.tools) {
    if (!/^pixelbank_[a-z][a-z0-9_]+$/.test(tool.name) || tool.inputSchema?.type !== 'object')
      throw new Error('Invalid generated tool');
    validator.getValidator(tool.inputSchema);
  }
  for (const path of Object.values(api.paths)) for (const operation of Object.values(path)) {
    if (operation['x-mcp'] && !names.has(operation['x-mcp'].name))
      throw new Error('An exported MCP operation is missing from the tool catalog');
  }
  return createHash('sha256').update(JSON.stringify(tools)).digest('hex');
}

export async function syncContracts(root, source, check) {
  const destinations = files.map(([, output]) => resolve(root, 'plugins/pixelbank/contracts', output));
  const expected = await Promise.all(files.map(([input], index) =>
    readFile(source ? resolve(root, source, input) : destinations[index], 'utf8')));
  const digest = validateContracts(expected);
  if (check && source) {
    const actual = await Promise.all(destinations.map(file => readFile(file, 'utf8')));
    for (let index = 0; index < actual.length; index++) if (actual[index] !== expected[index])
      throw new Error(`Public contract is stale: ${files[index][1]}; run bun run contracts:sync`);
  } else if (source) {
    for (let index = 0; index < destinations.length; index++) await writeFile(destinations[index], expected[index]);
  }
  return { contracts: 'in-sync', live_catalog_authoritative: true, linked_source: Boolean(source), schema_sha256: digest };
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { check: { type: 'boolean' }, source: { type: 'string' } } });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let source = values.source;
  if (!source) {
    const env = { ...process.env };
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[key];
    try { source = execFileSync('git', ['config', '--get', 'pixelbank.apiContractSource'], { cwd: root, env, encoding: 'utf8' }).trim(); }
    catch { /* Public builds do not require a private checkout. */ }
  }
  console.log(JSON.stringify(await syncContracts(root, source, Boolean(values.check))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
