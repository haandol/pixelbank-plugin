import type { Auth } from './auth.js';
import { SafeError } from './errors.js';
import { UPLOAD_PURPOSES } from './upload.js';
import { WORKSPACE_ID, WORKSPACE_READ_TOOL } from './workspace.js';
import { WORKFLOW_STATUS_TOOL, waitArgumentsSchema } from './workflow.js';

type ToolCatalog = Awaited<ReturnType<Auth['listCreativeTools']>>;
type Tool = ToolCatalog[number];
type Schema = Tool['inputSchema'];

export const CONNECTION_TOOL = 'pixelbank_connection';
export const READ_TOOL = 'pixelbank_read';
export const EDIT_TOOL = 'pixelbank_edit';
export const DESCRIBE_ACTION = 'describe';
export const ARGUMENTS_FIELD = 'arguments';
export const UPLOAD_TICKET_TOOL = 'pixelbank_issue_upload';
export const CONNECTION_ACTIONS = ['connect', 'disconnect', 'open_credits_page'] as const;

/** Remote tools used only by local actions, mapped to the model-visible replacement tool and action. */
const internalTools = new Map<string, [string, string]>([
  [UPLOAD_TICKET_TOOL, [EDIT_TOOL, 'upload_image']],
  ['pixelbank_save_source', [EDIT_TOOL, 'upload_image']],
  [WORKSPACE_READ_TOOL, [READ_TOOL, 'open_workspace']],
  [WORKFLOW_STATUS_TOOL, [READ_TOOL, 'wait_for_workflow']],
]);
export const internalToolNames: readonly string[] = [...internalTools.keys()];

/** One operation the bridge runs itself inside the remote tool of its authority class. */
export interface LocalAction {
  tool: typeof READ_TOOL | typeof EDIT_TOOL;
  action: string;
  summary: string;
  /** The internal remote tool the action needs; the action is offered only while it is advertised. */
  requires: string;
  schema(catalog: ToolCatalog): Schema;
}

export const localActions: readonly LocalAction[] = [
  {
    tool: READ_TOOL, action: 'wait_for_workflow', requires: WORKFLOW_STATUS_TOOL,
    summary: 'Wait up to 60 seconds for an accepted workflow run with read-only status checks; a finished run returns at once.',
    schema: catalog => waitArgumentsSchema(catalog.find(tool => tool.name === WORKFLOW_STATUS_TOOL)!),
  },
  {
    tool: READ_TOOL, action: 'open_workspace', requires: WORKSPACE_READ_TOOL,
    summary: 'Open an owned prepared web workspace in the default browser; never starts processing.',
    schema: () => ({ type: 'object', properties: { workspace_id: { type: 'string', pattern: WORKSPACE_ID.source } },
      required: ['workspace_id'], additionalProperties: false }),
  },
  {
    tool: EDIT_TOOL, action: 'upload_image', requires: UPLOAD_TICKET_TOOL,
    summary: 'Upload one explicitly selected local PNG, JPEG or WebP image; workflow-input with save_source=true keeps a persistent source.',
    schema: () => ({ type: 'object', properties: { file_path: { type: 'string', minLength: 1 },
      purpose: { type: 'string', enum: [...UPLOAD_PURPOSES] }, save_source: { type: 'boolean' } },
      required: ['file_path', 'purpose'], additionalProperties: false,
      // A persistent source must be a workflow input, so the exact schema refuses any other purpose.
      if: { properties: { save_source: { const: true } }, required: ['save_source'] },
      then: { properties: { purpose: { const: 'workflow-input' } } } }),
  },
];

export const connectionSummaries: Record<(typeof CONNECTION_ACTIONS)[number], string> = {
  connect: 'Connect PixelbankStudio through browser sign-in, or check a sign-in already in progress.',
  disconnect: 'Revoke this connection and remove its local credentials; accepted creative jobs continue.',
  open_credits_page: 'Open the fixed credit purchase page in the default browser; never pays, adds credits or retries processing.',
};

export const connectionTool: Tool = {
  name: CONNECTION_TOOL,
  description: 'Manage the PixelbankStudio connection. Actions: connect (browser sign-in, or check one in progress), ' +
    'disconnect (revoke this connection and remove local credentials; accepted jobs continue), open_credits_page ' +
    '(open the credit purchase page; never pays, adds credits or retries processing). Send the action alone.',
  inputSchema: { type: 'object', properties: { action: { type: 'string', enum: [...CONNECTION_ACTIONS] } },
    required: ['action'], additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};

/** Former tool names whose replacement does not depend on the live catalog. */
const retiredLocalTools = new Map<string, [string, string]>([
  ['pixelbank_connect', [CONNECTION_TOOL, 'connect']],
  ['pixelbank_disconnect', [CONNECTION_TOOL, 'disconnect']],
  ['pixelbank_open_credits_page', [CONNECTION_TOOL, 'open_credits_page']],
  ...localActions.map(local => [`pixelbank_${local.action}`, [local.tool, local.action]] as [string, [string, string]]),
]);

export function retiredLocalTool(name: string): SafeError | undefined {
  const replacement = retiredLocalTools.get(name);
  return replacement && retiredTool(...replacement);
}

/** Never-released intermediate grouped names and the tool of their class, as the service retires them. */
const retiredGroupedTools = new Map([
  ['pixelbank_read_workflow', READ_TOOL], ['pixelbank_edit_workflow', EDIT_TOOL],
  ['pixelbank_process_image', 'pixelbank_run'], ['pixelbank_generate', 'pixelbank_run'],
]);

/** A former per-operation or intermediate grouped name whose operations now live in a visible tool. */
export function retiredRemoteTool(name: string, catalog: ToolCatalog, requested?: unknown): SafeError | undefined {
  const visible = advertisedTools(catalog);
  const grouped = retiredGroupedTools.get(name);
  if (grouped !== undefined) {
    const owner = visible.find(tool => tool.name === grouped);
    if (!owner) return undefined;
    return retiredTool(owner.name, typeof requested === 'string' && actionNames(owner).includes(requested) ? requested : undefined);
  }
  const action = name.slice('pixelbank_'.length);
  const owner = action === DESCRIBE_ACTION ? undefined : visibleRemoteTools(catalog).find(tool => actionNames(tool).includes(action));
  return owner && retiredTool(owner.name, action);
}

function retiredTool(tool: string, action?: string): SafeError {
  const target = action === undefined ? `${tool} with one of its listed actions` : `${tool} with action ${action}`;
  return new SafeError('TOOL_RETIRED', `This PixelbankStudio tool name is retired and nothing was run. Call ${target} instead.`,
    undefined, { replacement: { tool, ...(action === undefined ? {} : { action }) } });
}

export function isInternalTool(name: string): boolean {
  return internalTools.has(name);
}

/** A hidden compatibility tool is refused like a former name, with its model-visible replacement. */
export function refuseInternalTool(name: string): SafeError {
  return retiredTool(...internalTools.get(name)!);
}

export function visibleRemoteTools(tools: ToolCatalog): ToolCatalog {
  return tools.filter(tool => !isInternalTool(tool.name));
}

export function actionNames(tool: Tool): string[] {
  const values = (tool.inputSchema.properties?.action as { enum?: unknown } | undefined)?.enum;
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [];
}

/** Local actions the current catalog can serve: their remote tool and internal read are both advertised. */
export function availableLocalActions(catalog: ToolCatalog): LocalAction[] {
  return localActions.filter(local => catalog.some(tool => tool.name === local.tool) && catalog.some(tool => tool.name === local.requires));
}

export function findLocalAction(tool: string, action: unknown, catalog: ToolCatalog): LocalAction | undefined {
  return availableLocalActions(catalog).find(local => local.tool === tool && local.action === action);
}

/** A remote catalog cannot replace the connection tool or shadow a local action. */
export function assertNoLocalOverrides(tools: ToolCatalog): void {
  const shadowed = tools.some(tool => tool.name === CONNECTION_TOOL || retiredLocalTools.has(tool.name) ||
    localActions.some(local => local.tool === tool.name && actionNames(tool).includes(local.action)));
  if (shadowed) throw new SafeError('INVALID_CATALOG', 'Remote tools cannot replace connection controls or local actions.');
}

/** The same compact outline the service uses: sorted top-level fields, optional ones marked with ?. */
export function outline(local: LocalAction, catalog: ToolCatalog): string {
  const schema = local.schema(catalog), required = schema.required ?? [];
  const fields = Object.keys(schema.properties ?? {}).sort().map(name => required.includes(name) ? name : `${name}?`);
  return `${local.action}{${fields.join(',')}}`;
}

/** Adds each available local action to its tool's action list and outline without touching remote actions. */
export function advertisedTools(catalog: ToolCatalog): ToolCatalog {
  const locals = availableLocalActions(catalog);
  const remote = visibleRemoteTools(catalog).map(tool => {
    const added = locals.filter(local => local.tool === tool.name);
    if (!added.length) return tool;
    const schema = structuredClone(tool.inputSchema);
    const action = schema.properties?.action as { enum?: unknown[] } | undefined;
    if (!action || !Array.isArray(action.enum)) throw new SafeError('INVALID_CATALOG', 'A remote tool used for local actions has no action list.');
    action.enum = [...action.enum, ...added.map(local => local.action)];
    const outlines = added.map(local => outline(local, catalog)).join('; ');
    return { ...tool, description: `${tool.description ?? ''} Local: ${outlines}.`.trim(), inputSchema: schema };
  });
  return [connectionTool, ...remote];
}
