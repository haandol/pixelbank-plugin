import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
type Tool = Awaited<ReturnType<Client['listTools']>>['tools'][number];
import { validateBase } from './config.js';
import { SafeError, uncertainOutcome } from './errors.js';
import { object } from './http.js';
import { boundedEventStream, readBoundedBody } from './body.js';
import { apiError } from './api-errors.js';
import { retryAfterSeconds } from './traffic.js';

const TOOL_NAME = /^pixelbank_[a-z][a-z0-9_]+$/;
export const OPERATION_TIMEOUT_MS = 15 * 60_000;
export const DISCOVERY_TIMEOUT_MS = 30_000;
export interface RemoteOptions {
  protocolVersion?: '2026-07-28' | '2025-11-25';
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: { progress: number; total?: number }) => void;
}

/** No automatic authorization, operation replay, discovery fallback, or alternate route. */
async function withRemote<T>(base: string, token: () => Promise<string>, action: (client: Client) => Promise<T>, options: RemoteOptions): Promise<T> {
  const endpoint = new URL('/mcp', validateBase(base));
  const version = options.protocolVersion ?? '2026-07-28';
  const client = new Client({ name: 'pixelbank-mcp', version: '0.1.1' }, {
    supportedProtocolVersions: [version],
    versionNegotiation: { mode: version === '2026-07-28' ? { pin: version } : 'legacy', probe: { maxRetries: 0 } },
    inputRequired: { autoFulfill: false },
  });
  let boundaryError: SafeError | undefined;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? OPERATION_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const invalid = () => boundaryError ??= new SafeError('INVALID_RESPONSE', `The MCP response was invalid or exceeded its bounded message size. ${uncertainOutcome}`);
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { redirect: 'error' },
    onInsufficientScope: 'throw', maxStepUpRetries: 0,
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 0, maxReconnectionDelay: 0, reconnectionDelayGrowFactor: 1 },
    fetch: async (input, init) => {
      try {
        const target = new URL(input instanceof Request ? input.url : String(input));
        if (target.href !== endpoint.href) throw new SafeError('INVALID_ROUTE', 'The remote transport cannot call an alternative destination.');
        if ((init?.method ?? 'GET').toUpperCase() === 'GET') return new Response(null, { status: 405 });
        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${await token()}`);
        const response = await fetch(endpoint, { ...init, headers, redirect: 'error', signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
        if (response.ok && response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'text/event-stream' && response.body) {
          return new Response(boundedEventStream(response.body, invalid), { status: response.status, headers: response.headers });
        }
        let body: Awaited<ReturnType<typeof readBoundedBody>>;
        try { body = await readBoundedBody(response.body); }
        catch (error) { if (response.ok) throw error; body = { kind: 'too-large' }; }
        if (!response.ok) {
          let code = 'API_ERROR', pause: unknown, detail: Record<string, unknown> = {};
          try {
            detail = object(object(JSON.parse(body.kind === 'complete' ? body.text : '')).error);
            if (typeof detail.code === 'string') { code = detail.code; pause = detail.retryAfterSeconds; }
          } catch { /* Untrusted error bodies never become model-visible diagnostics. */ }
          throw apiError(response.status, code, response.headers.has('retry-after') ? retryAfterSeconds(response.headers.get('retry-after')) : undefined, pause, detail);
        }
        if (body.kind !== 'complete') throw invalid();
        return new Response(body.text || null, { status: response.status, headers: response.headers });
      } catch (error) {
        boundaryError = error instanceof SafeError ? error : new SafeError('NETWORK_ERROR', `The MCP request could not be completed securely. ${uncertainOutcome}`);
        throw boundaryError;
      }
    },
  });
  client.onerror = () => { void client.close(); };
  try {
    await client.connect(transport, { timeout: Math.min(options.timeoutMs ?? DISCOVERY_TIMEOUT_MS, DISCOVERY_TIMEOUT_MS), signal });
    return await action(client);
  } catch (error) {
    if (boundaryError) throw boundaryError;
    if (error instanceof SafeError) throw error;
    throw new SafeError('MCP_REQUEST_FAILED', `The MCP protocol request failed or ended without a confirmed result. Check plugin/service compatibility and recover the original operation before retrying. ${uncertainOutcome}`);
  } finally { await client.close(); }
}

export async function listRemoteTools(base: string, token: () => Promise<string>, options: RemoteOptions = {}): Promise<Tool[]> {
  options = { timeoutMs: DISCOVERY_TIMEOUT_MS, ...options };
  return withRemote(base, token, async client => {
    const result = await client.listTools(undefined, { timeout: options.timeoutMs ?? OPERATION_TIMEOUT_MS, signal: options.signal });
    if (result.nextCursor) throw new SafeError('UNSUPPORTED_CATALOG', 'The server catalog must fit the published tool contract.');
    if (new Set(result.tools.map(tool => tool.name)).size !== result.tools.length || result.tools.some(tool => !TOOL_NAME.test(tool.name))) throw new SafeError('INVALID_CATALOG', 'The server returned an invalid tool catalog.');
    return result.tools;
  }, options);
}

export async function callRemoteTool(base: string, token: () => Promise<string>, name: string, input: Record<string, unknown>, options: RemoteOptions = {}): Promise<Record<string, unknown>> {
  if (!TOOL_NAME.test(name)) throw new SafeError('INVALID_TOOL', 'Choose a published PixelbankStudio creative tool.');
  return withRemote(base, token, async client => {
    const result = await client.callTool({ name, arguments: input }, { timeout: options.timeoutMs ?? OPERATION_TIMEOUT_MS, signal: options.signal, onprogress: options.onProgress, allowInputRequired: true });
    if (!('content' in result)) throw new SafeError('INPUT_REQUIRED', 'This operation requires additional user input before it can run.');
    let data = result.structuredContent;
    if (!data && result.content.length === 1 && result.content[0]?.type === 'text') {
      try { data = object(JSON.parse(result.content[0].text)); } catch { throw new SafeError('INVALID_RESPONSE', 'The creative result did not match its structured contract.'); }
    }
    const envelope = object(data);
    if (result.isError || Object.hasOwn(envelope, 'error')) {
      const error = object(envelope.error);
      throw apiError(200, typeof error.code === 'string' ? error.code : 'API_ERROR', undefined, error.retryAfterSeconds, error);
    }
    if (!Object.hasOwn(envelope, 'data')) throw new SafeError('INVALID_RESPONSE', `The creative result is missing its data envelope. ${uncertainOutcome}`);
    return envelope;
  }, options);
}
