import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const validator = fileURLToPath(new URL('../verify-package-zip.sh', import.meta.url));
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'pixelbank-package-zip-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Release verification fixture');
  git('config', 'user.email', 'release-fixture@example.invalid');
  mkdirSync(join(directory, 'plugins/pixelbank/.codex-plugin'), { recursive: true });
  writeFileSync(join(directory, 'plugins/pixelbank/.codex-plugin/plugin.json'), '{"version":"0.2.3"}\n');
  writeFileSync(join(directory, 'plugins/pixelbank/file with spaces.txt'), 'Original public package bytes.\n');
  git('add', '.'); git('commit', '-qm', 'test: record package fixture');
  const commit = git('rev-parse', 'HEAD');
  const archive = (name, ref = commit, time = '2020-01-01T00:00:00Z') => {
    const zip = join(directory, name);
    git('archive', '--format=zip', '--prefix=pixelbank/', `--mtime=${time}`, '-o', zip, `${ref}:plugins/pixelbank`);
    return zip;
  };
  const verify = zip => execFileSync('bash', [validator, commit, zip], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { directory, git, commit, archive, verify, close: () => rmSync(directory, { recursive: true, force: true }) };
}

test('published package verification accepts identical source bytes with different ZIP timestamps', () => {
  const f = fixture();
  try {
    const first = f.archive('first.zip');
    const later = f.archive('later.zip', f.commit, '2021-02-03T04:05:06Z');
    assert.notDeepEqual(readFileSync(first), readFileSync(later));
    assert.match(f.verify(first), /Verified tagged package contents/);
    assert.match(f.verify(later), /Verified tagged package contents/);
  } finally { f.close(); }
});

test('published package verification rejects modified bytes even when paths are unchanged', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.directory, 'plugins/pixelbank/file with spaces.txt'), 'Modified bytes.\n');
    f.git('add', '.'); f.git('commit', '-qm', 'test: change package contents');
    const zip = f.archive('modified.zip', f.git('rev-parse', 'HEAD'));
    assert.throws(() => f.verify(zip), /Package bytes differ/);
  } finally { f.close(); }
});

test('published package verification rejects missing entries', () => {
  const f = fixture();
  try {
    rmSync(join(f.directory, 'plugins/pixelbank/.codex-plugin/plugin.json'));
    f.git('add', '-A'); f.git('commit', '-qm', 'test: remove a package path');
    const zip = f.archive('wrong-paths.zip', f.git('rev-parse', 'HEAD'));
    assert.throws(() => f.verify(zip), /Package paths differ/);
  } finally { f.close(); }
});

test('published package verification rejects unexpected entries', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.directory, 'plugins/pixelbank/unexpected.txt'), 'Unexpected entry.\n');
    f.git('add', '.'); f.git('commit', '-qm', 'test: add a package path');
    const zip = f.archive('extra-path.zip', f.git('rev-parse', 'HEAD'));
    assert.throws(() => f.verify(zip), /Package paths differ/);
  } finally { f.close(); }
});
