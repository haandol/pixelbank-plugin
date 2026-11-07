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
const lock = await read('package-lock.json');
assert.equal(workspace.name, 'pixelbank-plugin-workspace');
assert.deepEqual(workspace.workspaces, ['plugins/pixelbank']);
assert.equal(pkg.name, 'pixelbank-creative-plugin');
assert.deepEqual(workspace.repository, { type: 'git', url: 'git+https://github.com/haandol/pixelbank-plugin.git' });
assert.deepEqual(pkg.repository, { ...workspace.repository, directory: 'plugins/pixelbank' });
assert.equal(workspace.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.equal(lock.packages['plugins/pixelbank'].version, pkg.version);
assert.equal(workspace.engines.node, pkg.engines.node);
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
}
for (const file of ['LICENSE.encbird', 'THIRD_PARTY_NOTICES.md']) {
  assert.deepEqual(await readFile(resolve(root, file)), await readFile(resolve(plugin, file)));
}
const info = await read('plugins/pixelbank/dist/build-info.json');
const hash = async file => createHash('sha256').update(await readFile(resolve(plugin, file))).digest('hex');
assert.equal(info.version, pkg.version);
assert.equal(info.node, pkg.engines.node);
assert.deepEqual(info.dependencies, pkg.dependencies);
assert.equal(info.bundleSha256, await hash('dist/index.js'));
assert.equal(info.contractsSha256, await hash('contracts/tools.json'));
const tools = await read('plugins/pixelbank/contracts/tools.json');
assert.equal(tools.tools.length, 29);
assert.equal(new Set(tools.tools.map(tool => tool.name)).size, 29);
console.log(`PixelbankStudio Plugin ${pkg.version}: marketplace, package, host manifests and 29 tool contracts agree.`);
