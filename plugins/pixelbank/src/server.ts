import { Server } from '@modelcontextprotocol/server';
import { Auth } from './auth.js';
import { CredentialStore } from './store.js';
import { resolveBase, validateBase } from './config.js';
import { SafeError, Secrets } from './errors.js';
import { openBrowser } from './oauth.js';
import { actionNames, advertisedTools, assertNoLocalOverrides, CONNECTION_ACTIONS, CONNECTION_TOOL, isInternalTool, refuseInternalTool, retiredLocalTool,
  retiredRemoteTool, visibleRemoteTools } from './catalog.js';
import { runLocalAction } from './local.js';
import { openCreditsPage, recoverCreditShortage } from './credits.js';
import { validateToolInput } from './input.js';
import { apiError } from './api-errors.js';
export { validateWorkspaceURL } from './workspace.js';

/** Connection actions take no arguments; an empty arguments object is accepted like any argument-free action. */
function refuseConnectionArguments(input: Record<string, unknown>): void {
  const refuse = (location: string, problem: string) => new SafeError('INVALID_ARGUMENTS', `Nothing was run. ${CONNECTION_TOOL} takes only action (${CONNECTION_ACTIONS.join(', ')}) and accepts no credentials, URLs, payment information or other arguments.`,
    undefined, { tool: CONNECTION_TOOL, action: input.action, location, problem });
  const extra = Object.keys(input).sort().find(key => key !== 'action' && key !== 'arguments');
  if (extra !== undefined) throw refuse(`/${extra}`, 'unexpected');
  const args = input.arguments;
  if (args === undefined) return;
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw refuse('/arguments', 'type');
  const nested = Object.keys(args).sort()[0];
  if (nested !== undefined) throw refuse(`/arguments/${nested}`, 'unexpected');
}

/** The local server bridges only the authenticated remote catalog and local connection actions. */
export function createServer(profile = process.env.PIXELBANK_AUTH_SCOPE ?? 'standalone', dependencies: { auth?: Auth; browser?: typeof openBrowser } = {}) {
  const base = dependencies.auth ? validateBase(dependencies.auth.base) : resolveBase();
  const secrets = dependencies.auth?.secrets ?? new Secrets();
  const auth = dependencies.auth ?? new Auth(base, new CredentialStore(base, profile, secrets), secrets);
  const browser = dependencies.browser ?? openBrowser;
  const server = new Server({ name: 'pixelbank', version: '0.3.0' }, { supportedProtocolVersions: ['2026-07-28', '2025-11-25'], capabilities: { tools: { listChanged: true } },
    instructions: 'Use PixelbankStudio for creative operations and workflows. Complex visual editing continues in a prepared PixelbankStudio web workspace. Each tool selects one operation with `action` and takes its arguments in `arguments`. Preserve operation keys, approved costs and workflow provenance. For insufficient credits, show the returned credit-page link in the creator\'s language. Page opening is not payment or funding confirmation; check current balance and authority when the creator asks to continue. Read exact action arguments with the pixelbank_read action describe. Connect with pixelbank_connection before discovering account tools.' });
  let catalog: Awaited<ReturnType<Auth['listCreativeTools']>> = [];
  server.onclose = () => { void auth.cancel(); };
  // The full remote catalog keeps internal tools so local helpers can derive and call them.
  const discover = async (signal?: AbortSignal) => {
    const tools = await auth.listCreativeTools({ signal });
    assertNoLocalOverrides(tools);
    return tools;
  };
  server.setRequestHandler('tools/list', async (_request, extra) => {
    catalog = [];
    try { catalog = await discover(extra.mcpReq.signal); }
    catch (error) { if (!(error instanceof SafeError && error.code === 'AUTH_REQUIRED')) throw error; catalog = []; }
    return { tools: secrets.clean(advertisedTools(catalog)) as typeof catalog, ttlMs: 0, cacheScope: 'private' as const };
  });
  server.setRequestHandler('tools/call', async (request, extra) => {
    const name = request.params.name, input = request.params.arguments ?? {};
    const progressToken = extra.mcpReq._meta?.progressToken;
    const options = { signal: extra.mcpReq.signal, onProgress: progressToken === undefined ? undefined : ({ progress, total }: { progress: number; total?: number }) => {
      void extra.mcpReq.notify({ method: 'notifications/progress', params: { progressToken, progress, ...(total === undefined ? {} : { total }) } }).catch(() => {});
    } };
    let value: Record<string, unknown>;
    try {
      if (name === CONNECTION_TOOL) {
        if (!CONNECTION_ACTIONS.includes(input.action as never))
          throw apiError(400, 'INVALID_ACTION', undefined, undefined, { tool: CONNECTION_TOOL, actions: [...CONNECTION_ACTIONS] });
        refuseConnectionArguments(input);
        if (input.action === 'open_credits_page') value = await openCreditsPage(browser);
        else {
          value = input.action === 'connect' ? await auth.connect() : await auth.disconnect();
          await server.notification({ method: 'notifications/tools/list_changed' }).catch(() => {});
        }
      } else {
        const retired = retiredLocalTool(name);
        if (retired) throw retired;
        if (isInternalTool(name)) throw refuseInternalTool(name);
        catalog = await discover(extra.mcpReq.signal);
        const local = await runLocalAction({ auth, browser, base, secrets, catalog }, name, input, options);
        if (local) value = local;
        else {
          const tool = visibleRemoteTools(catalog).find(tool => tool.name === name);
          if (!tool) throw retiredRemoteTool(name, catalog, input.action) ?? new SafeError('UNKNOWN_TOOL', 'This tool is not available in the authenticated PixelbankStudio catalog.');
          const actions = actionNames(advertisedTools(catalog).find(entry => entry.name === name)!);
          if (actions.length && !actions.includes(input.action as string))
            throw apiError(400, 'INVALID_ACTION', undefined, undefined, { tool: name, actions });
          validateToolInput(tool, input, { tool: name, action: typeof input.action === 'string' ? input.action : undefined });
          value = await auth.callCreativeTool(name, input, options);
        }
      }
    } catch (error) { value = await recoverCreditShortage(error, browser); }
    const clean = secrets.clean(value) as Record<string, unknown>;
    return { content: [{ type: 'text' as const, text: JSON.stringify(clean) }], structuredContent: clean, isError: 'error' in clean };
  });
  return { server, stop: async () => { await auth.cancel(); await server.close(); } };
}
