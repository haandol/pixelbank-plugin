import type { Auth } from './auth.js';
import { SafeError, type Secrets } from './errors.js';
import type { openBrowser } from './oauth.js';
import type { RemoteOptions } from './remote.js';
import { availableLocalActions, connectionSummaries, findLocalAction, ARGUMENTS_FIELD, CONNECTION_ACTIONS, CONNECTION_TOOL, DESCRIBE_ACTION, READ_TOOL,
  type LocalAction } from './catalog.js';
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

interface Described { tool: string; action: string; authority: string; summary: string; schema: () => unknown }

/** Every action the bridge answers itself: available local actions and the connection actions. */
function describable(catalog: ToolCatalog): Described[] {
  return [
    ...availableLocalActions(catalog).map(local => ({ tool: local.tool, action: local.action, authority: local.tool === READ_TOOL ? 'read' : 'write',
      summary: local.summary, schema: () => local.schema(catalog) })),
    ...CONNECTION_ACTIONS.map(action => ({ tool: CONNECTION_TOOL, action, authority: 'connection', summary: connectionSummaries[action],
      schema: () => ({ type: 'object', additionalProperties: false }) })),
  ];
}

/** Describes a bridge-owned action locally, and adds bridge-owned actions to a full listing returned by the service. */
async function describe({ auth, catalog }: LocalDependencies, input: Record<string, unknown>, options: RemoteOptions) {
  const target = describedAction(input);
  const owned = describable(catalog);
  const local = owned.find(entry => entry.action === target);
  if (local) {
    const context = { tool: READ_TOOL, action: DESCRIBE_ACTION, problem: 'unexpected' };
    const extra = Object.keys(input).find(key => key !== 'action' && key !== ARGUMENTS_FIELD) ??
      Object.keys(input[ARGUMENTS_FIELD] as object).find(key => key !== 'action');
    if (extra !== undefined) throw invalidArguments(Object.hasOwn(input, extra) ? `/${extra}` : `/${ARGUMENTS_FIELD}/${extra}`, context);
    return { data: { tool: local.tool, action: local.action, authority: local.authority, description: local.summary, arguments_schema: local.schema() } };
  }
  const read = catalog.find(tool => tool.name === READ_TOOL)!;
  validateToolInput(read, input, { tool: READ_TOOL, action: DESCRIBE_ACTION });
  const value = await auth.callCreativeTool(READ_TOOL, input, options);
  if (target === DESCRIBE_ACTION) return withOwnedTargets(value, owned);
  if (target !== undefined) return value;
  const data = value.data as { actions?: unknown } | undefined;
  if (!data || !Array.isArray(data.actions)) throw new SafeError('INVALID_RESPONSE', 'The action listing did not match its contract. Nothing was changed.');
  return { ...value, data: { ...data, actions: [...data.actions, ...owned.map(({ tool, action, authority, summary }) => ({ tool, action, authority, summary }))] } };
}

/** describe's own exact schema also accepts the actions the bridge describes itself. */
function withOwnedTargets(value: Record<string, unknown>, owned: Described[]): Record<string, unknown> {
  const data = value.data as { arguments_schema?: { properties?: { action?: { enum?: unknown } } } } | undefined;
  const targets = data?.arguments_schema?.properties?.action;
  if (!targets || !Array.isArray(targets.enum)) return value;
  const copy = structuredClone(value);
  const action = (copy.data as typeof data)!.arguments_schema!.properties!.action!;
  action.enum = [...targets.enum, ...owned.map(entry => entry.action).filter(name => !(targets.enum as unknown[]).includes(name))];
  return copy;
}

function describedAction(input: Record<string, unknown>): unknown {
  const args = input[ARGUMENTS_FIELD];
  return args && typeof args === 'object' ? (args as Record<string, unknown>).action : undefined;
}
