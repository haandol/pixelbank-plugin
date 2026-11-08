import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the dependency audit monitors every locked package on a schedule without gating merges', async () => {
  const workflow = await read('.github/workflows/dependency-audit.yml');
  const scripts = JSON.parse(await read('package.json')).scripts;
  assert.match(workflow, /\non:\n  schedule:\n    - cron: '[^']+'\n  workflow_dispatch:\n\npermissions:\n  contents: read\n/);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|pull_request_target):/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /pixelbank-plugin-check bun run audit:deps\n/);
  assert.match(workflow, /test -z "\$\(git status --porcelain --untracked-files=all\)"/);
  assert.equal(scripts['audit:deps'], 'bun audit', 'Every severity is reported and nothing is rewritten');
});
