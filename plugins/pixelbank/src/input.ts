import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type { JsonSchemaType } from '@modelcontextprotocol/server';
import type { Auth } from './auth.js';
import { SafeError } from './errors.js';

type Tool = Awaited<ReturnType<Auth['listCreativeTools']>>[number];

/** Validate the current server schema without coercing, defaulting or disclosing supplied values. */
export function validateToolInput(tool: Tool, input: Record<string, unknown>): void {
  let valid: boolean;
  try {
    const validator = new AjvJsonSchemaValidator();
    valid = validator.getValidator(tool.inputSchema as JsonSchemaType)(input).valid;
  } catch {
    throw new SafeError('INVALID_CATALOG', 'The current tool schema could not be validated. Refresh the service catalog.');
  }
  if (!valid) throw new SafeError('INVALID_INPUT', 'The input does not match the current tool contract. Check required fields, types and allowed values.');
}
