import { setTimeout as delay } from 'node:timers/promises';
import type { Auth } from './auth.js';
import type { RemoteOptions } from './remote.js';
import { SafeError } from './errors.js';
import { object } from './http.js';
import { validateToolInput } from './input.js';

type Tool = Awaited<ReturnType<Auth['listCreativeTools']>>[number];
export const WORKFLOW_STATUS_TOOL = 'pixelbank_get_workflow_status';
export const WORKFLOW_WAIT_TOOL = 'pixelbank_wait_for_workflow';
const defaultWaitSeconds = 30;
const maximumWaitSeconds = 60;
const minimumPollSeconds = 5;

/** The helper inherits run arguments from live discovery; it adds only a bounded local wait. */
export function workflowWaitTool(tools: Tool[]): Tool | undefined {
  const status = tools.find(tool => tool.name === WORKFLOW_STATUS_TOOL);
  if (!status) return undefined;
  const schema = structuredClone(status.inputSchema);
  if (!schema.properties || !Object.hasOwn(schema.properties, 'run_id') || Object.hasOwn(schema.properties, 'max_wait_seconds'))
    throw new SafeError('INVALID_CATALOG', 'The workflow status contract cannot be used for a bounded wait.');
  schema.properties.max_wait_seconds = { type: 'integer', minimum: 1, maximum: maximumWaitSeconds, default: defaultWaitSeconds };
  return {
    name: WORKFLOW_WAIT_TOOL,
    description: 'Wait briefly for an accepted PixelbankStudio workflow using read-only status checks. Follow the returned poll delay if still running. This never starts, retries or cancels creative processing.',
    inputSchema: schema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  };
}

interface PollClock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
const clock: PollClock = { now: Date.now, sleep: async (ms, signal) => { await delay(ms, undefined, { signal }); } };

function workflowStatus(envelope: Record<string, unknown>, runId: unknown) {
  const value = object(envelope.data);
  if (value.run_id !== runId || !['active', 'queued', 'running', 'completed', 'failed'].includes(String(value.status)) ||
    typeof value.pollable !== 'boolean' || typeof value.terminal !== 'boolean' ||
    !Number.isInteger(value.revision) || Number(value.revision) < 1 ||
    !Number.isInteger(value.poll_after_seconds) || Number(value.poll_after_seconds) < 0 || Number(value.poll_after_seconds) > 86400 ||
    !Number.isInteger(value.completed_steps) || !Number.isInteger(value.total_steps) ||
    Number(value.completed_steps) < 0 || Number(value.total_steps) < Number(value.completed_steps) ||
    value.terminal !== ['completed', 'failed'].includes(String(value.status)) ||
    value.pollable !== ['queued', 'running'].includes(String(value.status)) ||
    (value.pollable && Number(value.poll_after_seconds) < minimumPollSeconds))
    throw new SafeError('INVALID_RESPONSE', 'The workflow status response is inconsistent. The accepted workflow was not changed.');
  return value;
}

/** Polls the same owned run; only reads occur after acceptance, even across transient UI waits. */
export async function waitForWorkflow(auth: Pick<Auth, 'callCreativeTool'>, statusTool: Tool,
  input: Record<string, unknown>, options: RemoteOptions = {}, timer: PollClock = clock): Promise<Record<string, unknown>> {
  const wait = workflowWaitTool([statusTool]);
  if (!wait) throw new SafeError('UNKNOWN_TOOL', 'Workflow status is unavailable in the current catalog.');
  validateToolInput(wait, input);
  const { max_wait_seconds: requested = defaultWaitSeconds, ...arguments_ } = input;
  validateToolInput(statusTool, arguments_);
  const start = timer.now(), deadline = start + Number(requested) * 1000;
  let last: Record<string, unknown> | undefined, revision: unknown, backoff = minimumPollSeconds, polls = 0, nextDelay = 0;
  const finish = (reason: string) => ({ ...last, wait: { reason, polls, elapsed_seconds: (timer.now() - start) / 1000, next_poll_after_seconds: nextDelay } });
  while (timer.now() < deadline) {
    if (options.signal?.aborted) throw new SafeError('WAIT_CANCELLED', 'Waiting stopped; the accepted workflow continues.');
    let current: Record<string, unknown>;
    try {
      current = await auth.callCreativeTool(WORKFLOW_STATUS_TOOL, arguments_, {
        ...options, timeoutMs: Math.min(30_000, deadline - timer.now()), onProgress: undefined,
      });
    } catch (error) {
      if (options.signal?.aborted) throw new SafeError('WAIT_CANCELLED', 'Waiting stopped; the accepted workflow continues.');
      const timedOut = error instanceof SafeError && ['NETWORK_ERROR', 'MCP_REQUEST_FAILED'].includes(error.code);
      if (last && timer.now() >= deadline && timedOut) return finish('time_limit');
      throw error;
    }
    polls++;
    const data = workflowStatus(current, input.run_id);
    last = current;
    if (revision !== data.revision) {
      backoff = minimumPollSeconds;
      options.onProgress?.({ progress: Number(data.completed_steps), total: Number(data.total_steps) });
    } else backoff = Math.min(maximumWaitSeconds, backoff * 2);
    revision = data.revision;
    if (!data.pollable) { nextDelay = 0; return finish(data.terminal ? 'terminal' : 'not_running'); }
    const pause = Math.max(minimumPollSeconds, Number(data.poll_after_seconds), backoff) * 1000;
    nextDelay = pause / 1000;
    if (pause >= deadline - timer.now()) return finish('time_limit');
    try { await timer.sleep(pause, options.signal); }
    catch (error) {
      if (options.signal?.aborted) throw new SafeError('WAIT_CANCELLED', 'Waiting stopped; the accepted workflow continues.');
      throw error;
    }
  }
  return finish('time_limit');
}
