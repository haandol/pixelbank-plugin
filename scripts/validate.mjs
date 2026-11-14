import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const plugin = resolve(root, 'plugins/pixelbank');
const read = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const workspace = await read('package.json');
const pkg = await read('plugins/pixelbank/package.json');
const portable = await read('plugins/pixelbank/plugin.json');
const claude = await read('plugins/pixelbank/.claude-plugin/plugin.json');
const codex = await read('plugins/pixelbank/.codex-plugin/plugin.json');
const agentMarket = await read('.agents/plugins/marketplace.json');
const claudeMarket = await read('.claude-plugin/marketplace.json');
const mcp = await read('plugins/pixelbank/mcp.json');
const claudeMcp = await read('plugins/pixelbank/.mcp.json');
const lock = Bun.JSON5.parse(await readFile(resolve(root, 'bun.lock'), 'utf8'));
const bunVersion = (await readFile(resolve(root, '.bun-version'), 'utf8')).trim();
assert.equal(Bun.version, bunVersion, `Verification requires Bun ${bunVersion}.`);
assert.equal(workspace.packageManager, `bun@${bunVersion}`);
assert.equal(workspace.engines.bun, `>=${bunVersion}`);
assert.equal((await readFile(resolve(root, '.devcontainer/Dockerfile'), 'utf8')).split('\n')[0], `FROM oven/bun:${bunVersion}-slim`);
assert.equal(workspace.name, 'pixelbank-plugin-workspace');
assert.deepEqual(workspace.workspaces, ['plugins/pixelbank']);
assert.equal(pkg.name, 'pixelbank-creative-plugin');
assert.deepEqual(workspace.repository, { type: 'git', url: 'git+https://github.com/haandol/pixelbank-plugin.git' });
assert.deepEqual(pkg.repository, { ...workspace.repository, directory: 'plugins/pixelbank' });
assert.equal(workspace.version, pkg.version);
assert.equal(lock.workspaces[''].name, workspace.name);
assert.equal(lock.workspaces['plugins/pixelbank'].version, pkg.version);
assert.deepEqual(lock.workspaces['plugins/pixelbank'].dependencies, pkg.dependencies);
assert.deepEqual(lock.workspaces['plugins/pixelbank'].devDependencies, pkg.devDependencies);
assert.deepEqual(workspace.engines, pkg.engines);
for (const manifest of [portable, claude, codex]) {
  assert.equal(manifest.name, 'pixelbank');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.repository, 'https://github.com/haandol/pixelbank-plugin');
}
assert.equal(agentMarket.plugins.length, 1);
assert.equal(claudeMarket.plugins.length, 1);
assert.equal(agentMarket.plugins[0].name, 'pixelbank');
assert.deepEqual(agentMarket.plugins[0].source, { source: 'local', path: './plugins/pixelbank' });
assert.deepEqual(agentMarket.plugins[0].policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
assert.equal(claudeMarket.plugins[0].name, 'pixelbank');
assert.equal(claudeMarket.plugins[0].source, './plugins/pixelbank');
assert.equal(claudeMarket.plugins[0].version, pkg.version);
assert.deepEqual(codex.mcpServers, mcp.mcpServers);
assert.equal(mcp.mcpServers.pixelbank.command, 'bun');
assert.equal(claudeMcp.mcpServers.pixelbank.command, 'bun');
assert.equal(claude.mcpServers, './.mcp.json');
assert.equal(claude.skills, './skills/');
assert.equal(codex.skills, './skills/');
assert.deepEqual(mcp.mcpServers.pixelbank.args, ['${PLUGIN_ROOT}/dist/index.js']);
assert.deepEqual(claudeMcp.mcpServers.pixelbank.args, ['${CLAUDE_PLUGIN_ROOT}/dist/index.js']);
assert.equal(mcp.mcpServers.pixelbank.env.PIXELBANK_AUTH_SCOPE, 'codex');
assert.equal(claudeMcp.mcpServers.pixelbank.env.PIXELBANK_AUTH_SCOPE, 'claude');
for (const file of ['dist/index.js', 'contracts/tools.json', 'skills/setup/SKILL.md', 'skills/creative-workflows/SKILL.md']) {
  assert((await stat(resolve(plugin, file))).isFile(), `Missing installed file: ${file}`);
}
assert.equal(portable.extensions['com.openai'].onboardingSkill, './skills/setup/SKILL.md');
for (const metadata of [codex.interface, portable.extensions['com.openai'].interface]) {
  assert.equal(metadata.displayName, 'PixelbankStudio');
  assert.equal(metadata.developerName, 'PixelbankStudio');
}
for (const directory of [root, plugin]) {
  const english = await readFile(resolve(directory, 'README.md'), 'utf8');
  const korean = await readFile(resolve(directory, 'README.ko.md'), 'utf8');
  assert(english.includes('href="README.ko.md"'), 'English README must link to Korean');
  assert(korean.includes('href="README.md"'), 'Korean README must link to English');
  for (const document of [english, korean]) {
    assert(document.includes(`Bun ${bunVersion}`), 'Setup must declare the verified Bun version');
    assert(document.includes('https://bun.sh/install'), 'Setup must explain how to install Bun');
    assert(document.includes('bun --version'), 'Setup must include runtime verification');
  }
}
for (const file of ['LICENSE.encbird', 'THIRD_PARTY_NOTICES.md']) {
  assert.deepEqual(await readFile(resolve(root, file)), await readFile(resolve(plugin, file)));
}
const info = await read('plugins/pixelbank/dist/build-info.json');
const hash = async file => createHash('sha256').update(await readFile(resolve(plugin, file))).digest('hex');
assert.equal(info.version, pkg.version);
assert.equal(info.bun, pkg.engines.bun);
assert.equal(info.builtWithBun, bunVersion);
assert.deepEqual(info.dependencies, pkg.dependencies);
assert.equal(info.bundleSha256, await hash('dist/index.js'));
assert.equal(info.contractsSha256, await hash('contracts/tools.json'));
const tools = await read('plugins/pixelbank/contracts/tools.json');
assert(tools.tools.length > 0, 'The public tool catalog must not be empty');
assert.equal(new Set(tools.tools.map(tool => tool.name)).size, tools.tools.length);
// The packaged contract must be exactly the five-tool catalog the skill teaches, so a stale snapshot cannot ship.
const skill = await readFile(resolve(plugin, 'skills/creative-workflows/SKILL.md'), 'utf8');
const table = new Map([...skill.matchAll(/^\| `(pixelbank_[a-z_]+)` \| (.+) \|$/gm)]
  .map(([, name, cell]) => [name, [...cell.matchAll(/`([a-z_]+)`/g)].map(match => match[1]).sort()]));
const catalog = await import('../plugins/pixelbank/src/catalog.ts');
assert.equal(table.size, 5, 'The creative-workflows skill must list exactly five tools and their actions');
assert.deepEqual(table.get(catalog.CONNECTION_TOOL), [...catalog.CONNECTION_ACTIONS].sort(), 'The connection tool actions must match the skill');
const contractNames = tools.tools.map(tool => tool.name).sort();
const expectedNames = [...table.keys()].filter(name => name !== catalog.CONNECTION_TOOL).concat(catalog.internalToolNames).sort();
const retired = [...table.values()].flat().map(action => `pixelbank_${action}`).filter(name => contractNames.includes(name));
assert.deepEqual(retired, [], `The packaged contract still names retired per-operation tools: ${retired.join(', ')}`);
assert.deepEqual(contractNames, expectedNames, 'The packaged contract must contain exactly the remote tools from the skill and the internal compatibility tools');
for (const tool of tools.tools) if (catalog.internalToolNames.includes(tool.name))
  assert.equal(tool.inputSchema?.properties?.action, undefined, `${tool.name} is a compatibility tool and must not take an action`);
const visible = catalog.advertisedTools(tools.tools);
assert.deepEqual(visible.map(tool => tool.name).sort(), [...table.keys()].sort(), 'The bridge must advertise exactly the five tools from the skill');
const budget = tools.tool_budget_bytes;
assert(Number.isInteger(budget) && budget > 0, 'The packaged contract must record its tool budget');
const sizes = {};
for (const tool of visible) {
  assert.deepEqual(catalog.actionNames(tool).sort(), table.get(tool.name), `${tool.name} actions, including local actions, must match the skill`);
  sizes[tool.name] = Buffer.byteLength(JSON.stringify(tool));
  assert(sizes[tool.name] <= budget, `${tool.name} is ${sizes[tool.name]} bytes, over the ${budget}-byte tool budget`);
}
// Local actions must fit the room the service keeps for them, so a service change fails its own budget first.
const reserve = tools.local_action_reserve_bytes ?? {};
for (const tool of visible) {
  const remote = tools.tools.find(entry => entry.name === tool.name);
  if (!remote) continue;
  const added = sizes[tool.name] - Buffer.byteLength(JSON.stringify(remote));
  assert(added <= (reserve[tool.name] ?? 0), `${tool.name} local actions add ${added} bytes, over the service's ${reserve[tool.name] ?? 0}-byte reserve`);
}
const described = new Set(tools.actions?.map(entry => `${entry.tool}/${entry.action}`));
for (const tool of visible) for (const action of catalog.actionNames(tool))
  if (!catalog.localActions.some(local => local.tool === tool.name && local.action === action) && tool.name !== catalog.CONNECTION_TOOL)
    assert(described.has(`${tool.name}/${action}`), `The packaged contract must hold the exact schema of ${tool.name} action ${action}`);
console.log(`PixelbankStudio Plugin ${pkg.version}: marketplace, package, host manifests and ${tools.tools.length} tool contracts agree; advertised tool bytes ${JSON.stringify(sizes)} within ${budget}.`);
