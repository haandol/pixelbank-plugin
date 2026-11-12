import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { builtinModules } from 'node:module';

const bunVersion = (await readFile(new URL('../../../.bun-version', import.meta.url), 'utf8')).trim();
assert.equal(Bun.version, bunVersion, `Reproducible builds require Bun ${bunVersion}. See docs/development.md.`);
const result = await Bun.build({
  entrypoints: ['src/index.ts'], target: 'bun', format: 'esm',
  outdir: 'dist', naming: 'index.js', metafile: true,
});
if (!result.success) throw new AggregateError(result.logs, 'The MCP bundle could not be built.');
const metafile = result.metafile;
assert(metafile, 'The bundle must include dependency metadata for notices and external-import checks.');
const builtins = new Set(['bun', ...builtinModules.flatMap(name => [name, `node:${name}`])]);
for (const output of Object.values(metafile.outputs)) {
  for (const dependency of output.imports) {
    if (dependency.external && !builtins.has(dependency.path)) throw new Error(`Bundle still requires an installed package: ${dependency.path}`);
  }
}
const inputs = Object.keys(metafile.inputs).sort();
const packages = new Set(inputs.filter(path => path.includes('node_modules/')).map(path => {
  const parts = path.split('/');
  const start = parts.lastIndexOf('node_modules') + 1;
  return parts.slice(0, start + (parts[start].startsWith('@') ? 2 : 1)).join('/');
}));
const licenses = [await readFile('THIRD_PARTY_NOTICES.md', 'utf8'), await readFile('LICENSE.encbird', 'utf8')];
for (const directory of [...packages].sort()) {
  const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const names = (await readdir(directory)).filter(name => /^(licen[cs]e|copying|notice)([.-].*)?$/i.test(name)).sort();
  if (!names.some(name => /^(licen[cs]e|copying)/i.test(name))) throw new Error(`Bundled package has no license file: ${metadata.name}`);
  for (const name of names) licenses.push(`${metadata.name} ${metadata.version} — ${name}\n${await readFile(join(directory, name), 'utf8')}`);
}
await writeFile('dist/THIRD_PARTY_LICENSES.txt', `${licenses.join('\n\n').replace(/[\t ]+$/gm, '').trimEnd()}\n`);
await unlink('dist/index.js.LEGAL.txt').catch(error => { if (error.code !== 'ENOENT') throw error; });
const metadata = JSON.parse(await readFile('package.json', 'utf8'));
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile('dist/build-info.json', JSON.stringify({
  version: metadata.version, bun: metadata.engines.bun, builtWithBun: Bun.version, dependencies: metadata.dependencies,
  bundleSha256: await hash('dist/index.js'), contractsSha256: await hash('contracts/tools.json'),
  inputs, externals: [...new Set(Object.values(metafile.outputs).flatMap(output => output.imports.filter(item => item.external).map(item => item.path)))].sort(),
}, null, 2) + '\n');
