import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForWorkflow, workflowWaitTool, WORKFLOW_STATUS_TOOL } from '../src/workflow.js';
import { validateToolInput } from '../src/input.js';
import { SafeError } from '../src/errors.js';

const tool = { name: WORKFLOW_STATUS_TOOL, inputSchema: { type: 'object' as const,
  properties: { run_id: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['run_id'], additionalProperties: false } };
const state = (status = 'running', revision = 1) => ({ data: { run_id: 'run', status, revision,
  pollable: status === 'running' || status === 'queued', terminal: status === 'completed' || status === 'failed',
  poll_after_seconds: status === 'running' ? 10 : status === 'queued' ? 5 : 0,
  completed_steps: status === 'completed' ? 3 : 1, total_steps: 3 } });

test('live schema validation rejects wrong types and unknown fields without coercing input', () => {
  const input = { run_id: 4 };
  assert.throws(() => validateToolInput(tool, input), { code: 'INVALID_INPUT' });
  assert.deepEqual(input, { run_id: 4 });
  assert.throws(() => validateToolInput(tool, { run_id: 'run', owner: 'another' }), { code: 'INVALID_INPUT' });
  const changed = { ...tool, inputSchema: { ...tool.inputSchema, required: ['run_id', 'revision'],
    properties: { ...tool.inputSchema.properties, revision: { type: 'integer', minimum: 1 } } } };
  assert.throws(() => validateToolInput(changed, { run_id: 'run' }), { code: 'INVALID_INPUT' });
  validateToolInput(changed, { run_id: 'run', revision: 2 });
});

test('external schema references fail locally without turning input into authority', () => {
  assert.throws(() => validateToolInput({ ...tool, inputSchema: { type: 'object', $ref: 'https://invalid.example/schema' } }, {}), { code: 'INVALID_CATALOG' });
});

test('bounded workflow wait follows server delays and sends only status reads', async () => {
  let now = 0;
  const pauses: number[] = [], calls: unknown[] = [], values = [state('queued', 1), state('running', 2), state('completed', 3)];
  const auth = { callCreativeTool: async (name: string, input: Record<string, unknown>) => {
    calls.push({ name, input }); return values.shift()!;
  } };
  const result = await waitForWorkflow(auth, tool, { run_id: 'run' }, {}, { now: () => now, sleep: async ms => { pauses.push(ms); now += ms; } });
  assert.deepEqual(pauses, [5000, 10000]);
  assert.deepEqual(calls, Array.from({ length: 3 }, () => ({ name: WORKFLOW_STATUS_TOOL, input: { run_id: 'run' } })));
  assert.equal((result.data as any).status, 'completed');
  assert.deepEqual(result.wait, { reason: 'terminal', polls: 3, elapsed_seconds: 15, next_poll_after_seconds: 0 });
});

test('unchanged state backs off and returns a delay instead of extending the wait', async () => {
  let now = 0, reads = 0;
  const pauses: number[] = [];
  const result = await waitForWorkflow({ callCreativeTool: async () => { reads++; return state(); } }, tool,
    { run_id: 'run', max_wait_seconds: 30 }, {}, { now: () => now, sleep: async ms => { pauses.push(ms); now += ms; } });
  assert.deepEqual(pauses, [10000, 10000]); assert.equal(reads, 3);
  assert.equal((result.data as any).status, 'running');
  assert.deepEqual(result.wait, { reason: 'time_limit', polls: 3, elapsed_seconds: 20, next_poll_after_seconds: 20 });
});

test('workflow wait preserves throttling and cannot shorten retry-after', async () => {
  let reads = 0;
  await assert.rejects(waitForWorkflow({ callCreativeTool: async () => { reads++; throw new SafeError('REQUEST_THROTTLED', 'wait', 47); } }, tool,
    { run_id: 'run' }), (error: unknown) => error instanceof SafeError && error.retryAfterSeconds === 47);
  assert.equal(reads, 1);
});

test('a slow throttle refusal still retains retry-after when the wait deadline has elapsed', async () => {
  let now = 0, reads = 0;
  await assert.rejects(waitForWorkflow({ callCreativeTool: async () => {
    if (++reads === 1) return state();
    now = 31_000;
    throw new SafeError('REQUEST_THROTTLED', 'wait', 47);
  } }, tool, { run_id: 'run' }, {}, { now: () => now, sleep: async ms => { now += ms; } }),
  (error: unknown) => error instanceof SafeError && error.retryAfterSeconds === 47);
  assert.equal(reads, 2);
});

test('failed and input-ready workflows return without polling or a creative write', async () => {
  for (const status of ['failed', 'active']) {
    let reads = 0;
    const result = await waitForWorkflow({ callCreativeTool: async () => { reads++; return state(status); } }, tool,
      { run_id: 'run' }, {}, { now: () => 0, sleep: async () => { assert.fail('inactive run was polled'); } });
    assert.equal(reads, 1);
    assert.equal((result.wait as any).reason, status === 'failed' ? 'terminal' : 'not_running');
  }
});

test('wait cancellation and invalid status never change the accepted workflow', async () => {
  const controller = new AbortController(); let reads = 0;
  await assert.rejects(waitForWorkflow({ callCreativeTool: async () => { reads++; return state(); } }, tool,
    { run_id: 'run' }, { signal: controller.signal }, { now: () => 0, sleep: async () => { controller.abort(); throw new Error('aborted'); } }), { code: 'WAIT_CANCELLED' });
  assert.equal(reads, 1);
  await assert.rejects(waitForWorkflow({ callCreativeTool: async () => ({ data: { ...state().data, run_id: 'foreign' } }) }, tool,
    { run_id: 'run' }), { code: 'INVALID_RESPONSE' });
  assert.equal(workflowWaitTool([]), undefined);
  assert.throws(() => validateToolInput(workflowWaitTool([tool])!, { run_id: 'run', max_wait_seconds: 0 }), { code: 'INVALID_INPUT' });
});
