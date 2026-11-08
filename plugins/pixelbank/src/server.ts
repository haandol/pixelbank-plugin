import { Server } from '@modelcontextprotocol/server';
import { Auth } from './auth.js';
import { CredentialStore } from './store.js';
import { resolveBase, validateBase } from './config.js';
import { SafeError, Secrets } from './errors.js';
import { openBrowser } from './oauth.js';
import { parseUploadInput, uploadImage } from './upload.js';
import { localTools, isInternalUploadTool, assertNoLocalOverrides } from './catalog.js';
import { openPreparedWorkspace } from './workspace.js';
import { openCreditsPage, recoverCreditShortage } from './credits.js';
export { validateWorkspaceURL } from './workspace.js';

/** The local server bridges only the authenticated remote catalog and local connection actions. */
export function createServer(profile = process.env.PIXELBANK_AUTH_SCOPE ?? 'standalone', dependencies: { auth?: Auth; browser?: typeof openBrowser } = {}) {
  const base = dependencies.auth ? validateBase(dependencies.auth.base) : resolveBase();
  const secrets = dependencies.auth?.secrets ?? new Secrets();
  const auth = dependencies.auth ?? new Auth(base, new CredentialStore(base, profile, secrets), secrets);
  const browser = dependencies.browser ?? openBrowser;
  const server = new Server({ name: 'pixelbank', version: '0.2.3' }, { supportedProtocolVersions: ['2026-07-28', '2025-11-25'], capabilities: { tools: { listChanged: true } },
    instructions: 'Use PixelbankStudio for creative operations and workflows. Complex visual editing continues in a prepared PixelbankStudio web workspace. Preserve operation keys, approved costs and workflow provenance. For insufficient credits, show the returned credit-page link in the creator\'s language. Page opening is not payment or funding confirmation; check current balance and authority when the creator asks to continue. Connect before discovering account tools.' });
  let catalog: Awaited<ReturnType<Auth['listCreativeTools']>> = [];
  server.onclose = () => { void auth.cancel(); };
  const discover = async (signal?: AbortSignal) => {
    const tools = await auth.listCreativeTools({ signal });
    assertNoLocalOverrides(tools);
    return tools.filter(tool => !isInternalUploadTool(tool.name));
  };
  server.setRequestHandler('tools/list', async (_request, extra) => {
    catalog = [];
    try { catalog = await discover(extra.mcpReq.signal); }
    catch (error) { if (!(error instanceof SafeError && error.code === 'AUTH_REQUIRED')) throw error; catalog = []; }
    assertNoLocalOverrides(catalog);
    return { tools: secrets.clean([...localTools, ...catalog]) as typeof catalog, ttlMs: 0, cacheScope: 'private' as const };
  });
  server.setRequestHandler('tools/call', async (request, extra) => {
    const name = request.params.name, input = request.params.arguments ?? {};
    const progressToken = extra.mcpReq._meta?.progressToken;
    const options = { signal: extra.mcpReq.signal, onProgress: progressToken === undefined ? undefined : ({ progress, total }: { progress: number; total?: number }) => {
      void extra.mcpReq.notify({ method: 'notifications/progress', params: { progressToken, progress, ...(total === undefined ? {} : { total }) } }).catch(() => {});
    } };
    let value: Record<string, unknown>;
    try {
      if (name === 'pixelbank_connect' || name === 'pixelbank_disconnect') {
        if (Object.keys(input).length) throw new SafeError('INVALID_INPUT', 'Connection controls accept no credentials or arguments.');
        value = name === 'pixelbank_connect' ? await auth.connect() : await auth.disconnect();
        await server.notification({ method: 'notifications/tools/list_changed' }).catch(() => {});
      } else if (name === 'pixelbank_upload_image') {
        value = await uploadImage(auth, base, parseUploadInput(input), extra.mcpReq.signal);
      } else if (name === 'pixelbank_open_workspace') {
        value = await openPreparedWorkspace({ auth, browser, base, secrets }, input, options);
      } else if (name === 'pixelbank_open_credits_page') {
        if (Object.keys(input).length) throw new SafeError('INVALID_INPUT', 'The credit-page control accepts no URL, payment information or arguments.');
        value = await openCreditsPage(browser);
      } else {
        if (isInternalUploadTool(name)) throw new SafeError('UNKNOWN_TOOL', 'Use pixelbank_upload_image for an explicitly selected local image.');
        if (!catalog.some(tool => tool.name === name)) catalog = await discover(extra.mcpReq.signal);
        if (!catalog.some(tool => tool.name === name)) throw new SafeError('UNKNOWN_TOOL', 'This tool is not available in the authenticated PixelbankStudio catalog.');
        value = await auth.callCreativeTool(name, input, options);
      }
    } catch (error) { value = await recoverCreditShortage(error, browser); }
    const clean = secrets.clean(value) as Record<string, unknown>;
    return { content: [{ type: 'text' as const, text: JSON.stringify(clean) }], structuredContent: clean, isError: 'error' in clean };
  });
  return { server, stop: async () => { await auth.cancel(); await server.close(); } };
}
