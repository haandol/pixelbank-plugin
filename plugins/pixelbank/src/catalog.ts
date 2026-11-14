import type { Auth } from './auth.js';
import { SafeError } from './errors.js';
import { UPLOAD_PURPOSES } from './upload.js';
import { WORKSPACE_ID, WORKSPACE_READ_TOOL } from './workspace.js';
import { WORKFLOW_STATUS_TOOL, WORKFLOW_WAIT_TOOL } from './workflow.js';

type ToolCatalog = Awaited<ReturnType<Auth['listCreativeTools']>>;
/** Remote tools used only by local helpers, mapped to the model-visible replacement. */
const internalTools = new Map([
  ['pixelbank_issue_upload', 'pixelbank_upload_image'],
  ['pixelbank_save_source', 'pixelbank_upload_image'],
  [WORKSPACE_READ_TOOL, 'pixelbank_open_workspace'],
  [WORKFLOW_STATUS_TOOL, WORKFLOW_WAIT_TOOL],
]);
export const internalToolNames: readonly string[] = [...internalTools.keys()];

export const localTools: ToolCatalog = [
  {
    name: 'pixelbank_upload_image',
    description:
      'Upload an explicitly selected local PNG, JPEG or WebP image to PixelbankStudio. Use workflow-input and save_source=true to prepare a persistent web-workspace source.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        purpose: { type: 'string', enum: [...UPLOAD_PURPOSES] },
        save_source: { type: 'boolean' },
      },
      required: ['file_path', 'purpose'],
      additionalProperties: false,
    },
  },
  {
    name: 'pixelbank_connect',
    description: 'Connect PixelbankStudio through browser sign-in, or check a sign-in already in progress.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'pixelbank_disconnect',
    description:
      'Revoke this PixelbankStudio connection and remove its local credentials. Accepted creative jobs retain their existing lifecycle.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'pixelbank_open_credits_page',
    description: 'Open the PixelbankStudio credit purchase page in the default browser. Opening never selects a plan, pays, adds credits or retries processing.',
    inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'pixelbank_open_workspace',
    description:
      'Open an owned prepared PixelbankStudio workspace in the default browser. Opening applies initial settings and never starts paid processing.',
    inputSchema: {
      type: 'object' as const,
      properties: { workspace_id: { type: 'string', pattern: WORKSPACE_ID.source } },
      required: ['workspace_id'],
      additionalProperties: false,
    },
  },
];

/** Upload, workspace and status reads stay inside local helpers rather than the model-visible catalog. */
export function isInternalTool(name: string): boolean {
  return internalTools.has(name);
}

export function visibleRemoteTools(tools: ToolCatalog): ToolCatalog {
  return tools.filter(tool => !isInternalTool(tool.name));
}

export function refuseInternalTool(name: string): SafeError {
  return new SafeError('UNKNOWN_TOOL', `This PixelbankStudio tool is used internally. Use ${internalTools.get(name)} instead.`);
}

/** A remote catalog cannot replace the bridge's connection or local-file controls. */
export function assertNoLocalOverrides(tools: ToolCatalog): void {
  if (tools.some((tool) => tool.name === WORKFLOW_WAIT_TOOL || localTools.some((local) => local.name === tool.name))) {
    throw new SafeError('INVALID_CATALOG', 'Remote tools cannot replace connection controls.');
  }
}
