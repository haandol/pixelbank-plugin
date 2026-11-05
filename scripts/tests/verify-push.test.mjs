import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const verifier = fileURLToPath(new URL('../verify-push.sh', import.meta.url));
const hook = fileURLToPath(new URL('../hooks/pre-push', import.meta.url));
const repo = mkdtempSync(join(tmpdir(), 'pixelbank-push-'));
after(() => rmSync(repo, { recursive: true, force: true }));
const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: repo, encoding: 'utf8' }).trim();
git('init', '-q', '-b', 'main');
writeFileSync(join(repo, 'a.txt'), 'verified\n');
git('add', '.'); git('commit', '-qm', 'verified');
const verified = git('rev-parse', 'HEAD');
const tree = git('rev-parse', 'HEAD^{tree}');
git('tag', '-a', 'v0.1.0', '-m', 'v0.1.0');
git('tag', 'v0.1.1');
writeFileSync(join(repo, 'a.txt'), 'changed\n');
git('commit', '-qam', 'unverified');
const unverified = git('rev-parse', 'HEAD');
const zero = '0'.repeat(40);
const receipt = (body) => { const path = join(repo, `receipt-${Math.random()}`); writeFileSync(path, body); return path; };
const good = receipt(`tree=${tree}\ncommit=${verified}\npassed=true\n`);
const run = (path, updates, script = verifier, env = {}) =>
  spawnSync('bash', [script, ...(path ? [path] : [])], { cwd: repo, input: updates.map(u => `${u.join(' ')}\n`).join(''), encoding: 'utf8', env: { ...process.env, ...env } });
const accepts = (...args) => { const result = run(...args); assert.equal(result.status, 0, result.stderr); };
const refuses = (pattern, ...args) => { const result = run(...args); assert.notEqual(result.status, 0); assert.match(result.stderr, pattern); };

test('a verified main update is accepted', () => accepts(good, [['refs/heads/main', verified, 'refs/heads/main', zero]]));

test('an annotated version tag of the verified tree is accepted', () =>
  accepts(good, [['refs/tags/v0.1.0', git('rev-parse', 'v0.1.0'), 'refs/tags/v0.1.0', zero]]));

test('a different source tree is refused', () =>
  refuses(/differs from the verified source/, good, [['refs/heads/main', unverified, 'refs/heads/main', verified]]));

test('a lightweight version tag is refused', () =>
  refuses(/must be annotated/, good, [['refs/tags/v0.1.1', verified, 'refs/tags/v0.1.1', zero]]));

test('other branches and ref deletions are refused', () => {
  refuses(/Only main and vX.Y.Z/, good, [['refs/heads/main', verified, 'refs/heads/feature', zero]]);
  refuses(/deletion/, good, [['(delete)', zero, 'refs/heads/main', verified]]);
});

test('a missing, failed or malformed receipt is refused', () => {
  const update = [['refs/heads/main', verified, 'refs/heads/main', zero]];
  refuses(/No verification receipt/, join(repo, 'absent'), update);
  refuses(/did not pass/, receipt(`tree=${tree}\npassed=false\n`), update);
  refuses(/no valid source tree/, receipt('tree=HEAD\npassed=true\n'), update);
});

test('an empty update list is refused', () => refuses(/No verified source ref update/, good, []));

test('the hook refuses pushes without the container receipt', () =>
  refuses(/release container/, undefined, [['refs/heads/main', verified, 'refs/heads/main', zero]], hook, { PIXELBANK_PUSH_RECEIPT: '' }));
