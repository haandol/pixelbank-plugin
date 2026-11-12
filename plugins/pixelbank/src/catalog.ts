import type { Auth } from './auth.js';
import { SafeError } from './errors.js';
import { UPLOAD_PURPOSES } from './upload.js';
import { WORKSPACE_ID } from './workspace.js';
import { WORKFLOW_WAIT_TOOL } from './workflow.js';

type ToolCatalog = Awaited<ReturnType<Auth['listCreativeTools']>>;
const internalUploadTools = ['pixelbank_issue_upload', 'pixelbank_save_source'];

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

/** Upload tickets remain inside the local helper rather than the model-visible catalog. */
export function isInternalUploadTool(name: string): boolean {
  return internalUploadTools.includes(name);
}

/** A remote catalog cannot replace the bridge's connection or local-file controls. */
export function assertNoLocalOverrides(tools: ToolCatalog): void {
  if (tools.some((tool) => tool.name === WORKFLOW_WAIT_TOOL || localTools.some((local) => local.name === tool.name))) {
    throw new SafeError('INVALID_CATALOG', 'Remote tools cannot replace connection controls.');
  }
}
