import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { builtinModules } from 'node:module';

const result = await build({
  entryPoints: ['src/index.ts'], bundle: true, platform: 'node', target: 'node24', format: 'esm',
  outfile: 'dist/index.js', metafile: true, legalComments: 'linked',
  banner: { js: "import { createRequire as pixelbankRequire } from 'node:module'; const require = pixelbankRequire(import.meta.url);" },
});
const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports) {
    if (dependency.external && !builtins.has(dependency.path)) throw new Error(`Bundle still requires an installed package: ${dependency.path}`);
  }
}
const packages = new Set(Object.keys(result.metafile.inputs).filter(path => path.startsWith('node_modules/')).map(path => {
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
