import { Server } from '@modelcontextprotocol/server';
import { Auth } from './auth.js';
import { CredentialStore } from './store.js';
import { resolveBase, validateBase } from './config.js';
import { SafeError, Secrets, safeError } from './errors.js';
import { openBrowser } from './oauth.js';
import { uploadImage, UPLOAD_PURPOSES } from './upload.js';

const authTools: Awaited<ReturnType<Auth['listCreativeTools']>> = [
  { name: 'pixelbank_upload_image', description: 'Upload an explicitly selected local PNG, JPEG or WebP image to Pixelbank. Use workflow-input and save_source=true to prepare a persistent web-workspace source.', inputSchema: { type: 'object', properties: { file_path: {type:'string'}, purpose: {type:'string', enum: [...UPLOAD_PURPOSES]}, save_source: {type:'boolean'} }, required:['file_path','purpose'], additionalProperties:false } },
  { name: 'pixelbank_connect', description: 'Connect Pixelbank through browser sign-in, or check a sign-in already in progress.', inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } },
  { name: 'pixelbank_disconnect', description: 'Revoke this Pixelbank connection and remove its local credentials. Accepted creative jobs retain their existing lifecycle.', inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } },
  { name: 'pixelbank_open_workspace', description: 'Open an owned prepared Pixelbank workspace in the default browser. Opening applies initial settings and never starts paid processing.', inputSchema: { type: 'object' as const, properties: { workspace_id: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, required: ['workspace_id'], additionalProperties: false } },
];

/** The local server bridges only the authenticated remote catalog and local connection actions. */
export function createServer(profile = process.env.PIXELBANK_AUTH_SCOPE ?? 'standalone', dependencies: { auth?: Auth; browser?: typeof openBrowser } = {}) {
  const base = dependencies.auth ? validateBase(dependencies.auth.base) : resolveBase();
  const secrets = dependencies.auth?.secrets ?? new Secrets();
  const auth = dependencies.auth ?? new Auth(base, new CredentialStore(base, profile, secrets), secrets);
  const browser = dependencies.browser ?? openBrowser;
  const server = new Server({ name: 'pixelbank', version: '0.1.0' }, { supportedProtocolVersions: ['2026-07-28', '2025-11-25'], capabilities: { tools: { listChanged: true } },
    instructions: 'Use Pixelbank for creative operations and workflows. Complex visual editing continues in a prepared Pixelbank web workspace. Preserve operation keys, approved costs and workflow provenance. Connect before discovering account tools.' });
  let catalog: Awaited<ReturnType<Auth['listCreativeTools']>> = [];
  server.onclose = () => { void auth.cancel(); };
  const discover = async (signal?: AbortSignal) => {
    const tools = await auth.listCreativeTools({ signal });
    if (tools.some(tool => authTools.some(local => local.name === tool.name))) throw new SafeError('INVALID_CATALOG', 'Remote tools cannot replace connection controls.');
    return tools.filter(tool => !['pixelbank_issue_upload','pixelbank_save_source'].includes(tool.name));
  };
  server.setRequestHandler('tools/list', async (_request, extra) => {
    catalog = [];
    try { catalog = await discover(extra.mcpReq.signal); }
    catch (error) { if (!(error instanceof SafeError && error.code === 'AUTH_REQUIRED')) throw error; catalog = []; }
    if (catalog.some(tool => authTools.some(local => local.name === tool.name))) throw new SafeError('INVALID_CATALOG', 'Remote tools cannot replace connection controls.');
    return { tools: secrets.clean([...authTools, ...catalog]) as typeof catalog, ttlMs: 0, cacheScope: 'private' as const };
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
        if (typeof input.file_path !== 'string' || typeof input.purpose !== 'string' || (input.save_source !== undefined && typeof input.save_source !== 'boolean') || Object.keys(input).some(key => !['file_path','purpose','save_source'].includes(key))) throw new SafeError('INVALID_INPUT', 'A local image path and upload purpose are required.');
        value = await uploadImage(auth, base, {file_path:input.file_path,purpose:input.purpose,save_source:input.save_source as boolean | undefined}, extra.mcpReq.signal);
      } else if (name === 'pixelbank_open_workspace') {
        if (Object.keys(input).length !== 1 || typeof input.workspace_id !== 'string' || !/^[a-f0-9]{64}$/.test(input.workspace_id)) throw new SafeError('INVALID_INPUT', 'An owned prepared workspace identity is required.');
        value = await auth.callCreativeTool('pixelbank_get_workspace', input, options);
        const data = value.data as { url?: unknown } | undefined;
        const url = validateWorkspaceURL(data?.url, base, input.workspace_id);
        if (secrets.contains(url)) throw new SafeError('INVALID_WORKSPACE', 'The workspace URL contains private connection data.');
        try { await browser(url); value = { data: { workspace_id: input.workspace_id, url, opened: true } }; }
        catch { value = { data: { workspace_id: input.workspace_id, url, opened: false, message: 'Open this link in your browser to continue editing.' } }; }
      } else {
        if (['pixelbank_issue_upload','pixelbank_save_source'].includes(name)) throw new SafeError('UNKNOWN_TOOL', 'Use pixelbank_upload_image for an explicitly selected local image.');
        if (!catalog.some(tool => tool.name === name)) catalog = await discover(extra.mcpReq.signal);
        if (!catalog.some(tool => tool.name === name)) throw new SafeError('UNKNOWN_TOOL', 'This tool is not available in the authenticated Pixelbank catalog.');
        value = await auth.callCreativeTool(name, input, options);
      }
    } catch (error) { value = safeError(error); }
    const clean = secrets.clean(value) as Record<string, unknown>;
    return { content: [{ type: 'text' as const, text: JSON.stringify(clean) }], structuredContent: clean, isError: 'error' in clean };
  });
  return { server, stop: async () => { await auth.cancel(); await server.close(); } };
}

export function validateWorkspaceURL(value: unknown, _base: string, workspaceId?: string): string {
  let url: URL;
  try {
    if (typeof value !== 'string' || /[\s\\\x00-\x1f\x7f]/.test(value)) throw new Error();
    url = new URL(value);
  } catch { throw new SafeError('INVALID_WORKSPACE', 'The workspace has no valid web URL.'); }
  if (url.origin !== 'https://www.pixelbankstudio.com' || url.username || url.password || url.hash ||
      !['/segment', '/generation'].includes(url.pathname) || !/^[a-f0-9]{64}$/.test(url.searchParams.get('workspace') ?? '') ||
      [...url.searchParams.keys()].some(key => !['workspace', 'workflow', 'step'].includes(key)) ||
      ['workspace', 'workflow', 'step'].some(key => url.searchParams.getAll(key).length > 1) ||
      (workspaceId !== undefined && url.searchParams.get('workspace') !== workspaceId) ||
      ['workflow', 'step'].some(key => url.searchParams.has(key) && !/^[a-zA-Z0-9_-]{1,128}$/.test(url.searchParams.get(key)!))) {
    throw new SafeError('INVALID_WORKSPACE', 'The workspace URL does not belong to the supported Pixelbank editor.');
  }
  return url.href;
}
