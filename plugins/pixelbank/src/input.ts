import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type { JsonSchemaType } from '@modelcontextprotocol/server';
import type { Auth } from './auth.js';
import { SafeError, invalidArgumentsMessage } from './errors.js';

type Tool = Awaited<ReturnType<Auth['listCreativeTools']>>[number];
export interface ArgumentContext { tool?: string; action?: string; prefix?: string; problem?: string }

/** Validate the current schema without coercing, defaulting or disclosing supplied values. */
export function validateToolInput(tool: Tool, input: Record<string, unknown>, context: ArgumentContext = {}): void {
  let result: { valid: boolean; errorMessage?: string };
  try {
    const validator = new AjvJsonSchemaValidator();
    result = validator.getValidator(tool.inputSchema as JsonSchemaType)(input);
  } catch {
    throw new SafeError('INVALID_CATALOG', 'The current tool schema could not be validated. Refresh the service catalog.');
  }
  if (!result.valid) throw invalidArguments(`${context.prefix ?? ''}${firstLocation(result.errorMessage)}`, context);
}

export function invalidArguments(location: string, { tool, action, problem }: ArgumentContext = {}): SafeError {
  return new SafeError('INVALID_ARGUMENTS', invalidArgumentsMessage, undefined, { location: location || '/', tool, action, problem });
}

// The validator reports locations as data/<pointer>; only the first pointer is kept and sanitized by SafeError.
function firstLocation(message = ''): string {
  return /^data(\/\S*?)?(?=[\s,]|$)/.exec(message)?.[1] ?? '';
}
