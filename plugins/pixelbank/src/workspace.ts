import type { Auth } from './auth.js';
import { SafeError, type Secrets } from './errors.js';
import type { openBrowser } from './oauth.js';
import type { RemoteOptions } from './remote.js';

export const WORKSPACE_ID = /^[a-f0-9]{64}$/;

interface WorkspaceDependencies {
  auth: Pick<Auth, 'callCreativeTool'>;
  browser: typeof openBrowser;
  base: string;
  secrets: Secrets;
}

/** Resolve the owned preparation before opening its validated URL; retain the link if the opener fails. */
export async function openPreparedWorkspace(
  { auth, browser, base, secrets }: WorkspaceDependencies,
  input: Record<string, unknown>,
  options: RemoteOptions,
): Promise<Record<string, unknown>> {
  if (
    Object.keys(input).length !== 1 ||
    typeof input.workspace_id !== 'string' ||
    !WORKSPACE_ID.test(input.workspace_id)
  )
    throw new SafeError('INVALID_INPUT', 'An owned prepared workspace identity is required.');
  let value = await auth.callCreativeTool('pixelbank_get_workspace', input, options);
  const data = value.data as { url?: unknown } | undefined;
  const url = validateWorkspaceURL(data?.url, base, input.workspace_id);
  if (secrets.contains(url))
    throw new SafeError('INVALID_WORKSPACE', 'The workspace URL contains private connection data.');
  try {
    await browser(url);
    value = { data: { workspace_id: input.workspace_id, url, opened: true } };
  } catch {
    value = {
      data: {
        workspace_id: input.workspace_id,
        url,
        opened: false,
        message: 'Open this link in your browser to continue editing.',
      },
    };
  }
  return value;
}

export function validateWorkspaceURL(value: unknown, _base: string, workspaceId?: string): string {
  let url: URL;
  try {
    if (typeof value !== 'string' || /[\s\\\x00-\x1f\x7f]/.test(value)) throw new Error();
    url = new URL(value);
  } catch {
    throw new SafeError('INVALID_WORKSPACE', 'The workspace has no valid web URL.');
  }
  if (
    url.origin !== 'https://www.pixelbankstudio.com' ||
    url.username ||
    url.password ||
    url.hash ||
    !['/segment', '/generation'].includes(url.pathname) ||
    !WORKSPACE_ID.test(url.searchParams.get('workspace') ?? '') ||
    [...url.searchParams.keys()].some((key) => !['workspace', 'workflow', 'step'].includes(key)) ||
    ['workspace', 'workflow', 'step'].some((key) => url.searchParams.getAll(key).length > 1) ||
    (workspaceId !== undefined && url.searchParams.get('workspace') !== workspaceId) ||
    ['workflow', 'step'].some(
      (key) => url.searchParams.has(key) && !/^[a-zA-Z0-9_-]{1,128}$/.test(url.searchParams.get(key)!),
    )
  ) {
    throw new SafeError('INVALID_WORKSPACE', 'The workspace URL does not belong to the supported PixelbankStudio editor.');
  }
  return url.href;
}
