import type { Auth } from './auth.js';
import { SafeError, type Secrets } from './errors.js';
import type { openBrowser } from './oauth.js';
import type { RemoteOptions } from './remote.js';
import { availableLocalActions, findLocalAction, ARGUMENTS_FIELD, DESCRIBE_ACTION, READ_TOOL, type LocalAction } from './catalog.js';
import { invalidArguments, validateToolInput } from './input.js';
import { parseUploadInput, uploadImage } from './upload.js';
import { openPreparedWorkspace } from './workspace.js';
import { waitForWorkflow, WORKFLOW_STATUS_TOOL } from './workflow.js';

type ToolCatalog = Awaited<ReturnType<Auth['listCreativeTools']>>;
interface LocalDependencies {
  auth: Auth;
  browser: typeof openBrowser;
  base: string;
  secrets: Secrets;
  catalog: ToolCatalog;
}

/** Runs a local action or a describe that involves local actions; returns undefined for an ordinary remote call. */
export async function runLocalAction(dependencies: LocalDependencies, tool: string, input: Record<string, unknown>,
  options: RemoteOptions): Promise<Record<string, unknown> | undefined> {
  const { auth, catalog } = dependencies;
  if (tool === READ_TOOL && input.action === DESCRIBE_ACTION && catalog.some(entry => entry.name === READ_TOOL)) return describe(dependencies, input, options);
  const local = findLocalAction(tool, input.action, catalog);
  if (!local) return undefined;
  const args = localArguments(local, input, catalog);
  if (local.action === 'wait_for_workflow')
    return waitForWorkflow(auth, catalog.find(entry => entry.name === WORKFLOW_STATUS_TOOL)!, args, options);
  if (local.action === 'open_workspace') return openPreparedWorkspace(dependencies, args, options);
  return uploadImage(auth, dependencies.base, parseUploadInput(args), options.signal);
}

/** A local action takes action and an optional arguments object, validated against its exact schema like the service. */
function localArguments(local: LocalAction, input: Record<string, unknown>, catalog: ToolCatalog): Record<string, unknown> {
  const context = { tool: local.tool, action: local.action };
  const extra = Object.keys(input).sort().find(key => key !== 'action' && key !== ARGUMENTS_FIELD);
  if (extra !== undefined) throw invalidArguments(`/${extra}`, { ...context, problem: 'unexpected' });
  const args = input[ARGUMENTS_FIELD] ?? {};
  if (typeof args !== 'object' || args === null || Array.isArray(args)) throw invalidArguments(`/${ARGUMENTS_FIELD}`, { ...context, problem: 'type' });
  validateToolInput({ name: local.tool, inputSchema: local.schema(catalog) }, args as Record<string, unknown>, { ...context, prefix: `/${ARGUMENTS_FIELD}` });
  return args as Record<string, unknown>;
}

function authority(local: LocalAction) {
  return local.tool === READ_TOOL ? 'read' : 'write';
}

/** Describes a local action locally, and adds local actions to a full listing returned by the service. */
async function describe({ auth, catalog }: LocalDependencies, input: Record<string, unknown>, options: RemoteOptions) {
  const target = describedAction(input);
  const locals = availableLocalActions(catalog);
  const local = locals.find(entry => entry.action === target);
  if (local) {
    const context = { tool: READ_TOOL, action: DESCRIBE_ACTION, problem: 'unexpected' };
    const extra = Object.keys(input).find(key => key !== 'action' && key !== ARGUMENTS_FIELD) ??
      Object.keys(input[ARGUMENTS_FIELD] as object).find(key => key !== 'action');
    if (extra !== undefined) throw invalidArguments(Object.hasOwn(input, extra) ? `/${extra}` : `/${ARGUMENTS_FIELD}/${extra}`, context);
    return { data: { tool: local.tool, action: local.action, authority: authority(local), description: local.summary,
      arguments_schema: local.schema(catalog) } };
  }
  const read = catalog.find(tool => tool.name === READ_TOOL)!;
  validateToolInput(read, input, { tool: READ_TOOL, action: DESCRIBE_ACTION });
  const value = await auth.callCreativeTool(READ_TOOL, input, options);
  if (target !== undefined) return value;
  const data = value.data as { actions?: unknown } | undefined;
  if (!data || !Array.isArray(data.actions)) throw new SafeError('INVALID_RESPONSE', 'The action listing did not match its contract. Nothing was changed.');
  return { ...value, data: { ...data, actions: [...data.actions, ...locals.map(entry => ({ tool: entry.tool, action: entry.action,
    authority: authority(entry), summary: entry.summary }))] } };
}

function describedAction(input: Record<string, unknown>): unknown {
  const args = input[ARGUMENTS_FIELD];
  return args && typeof args === 'object' ? (args as Record<string, unknown>).action : undefined;
}
