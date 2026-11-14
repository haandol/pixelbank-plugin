import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { Auth } from './auth.js';
import { SafeError, invalidArgumentsMessage } from './errors.js';

type Tool = Awaited<ReturnType<Auth['listCreativeTools']>>[number];
export interface ArgumentContext { tool?: string; action?: string; prefix?: string; problem?: string }

// The bridge's own 2020-12 engine with the SDK validator's options; it never logs, coerces or adds defaults.
const engine = new Ajv2020({ strict: false, validateSchema: false, allErrors: true, logger: false });
addFormats.default(engine);

/** Validate the current schema without coercing, defaulting or disclosing supplied values. */
export function validateToolInput(tool: Tool, input: Record<string, unknown>, context: ArgumentContext = {}): void {
  let errors: ErrorObject[];
  try {
    const validate = engine.compile(tool.inputSchema);
    errors = validate(input) ? [] : validate.errors ?? [];
  } catch {
    throw new SafeError('INVALID_CATALOG', 'The current tool schema could not be validated. Refresh the service catalog.');
  } finally {
    // Each discovery returns fresh schema objects; dropping them keeps the engine's cache bounded.
    try { engine.removeSchema(tool.inputSchema); } catch { /* a schema that never compiled left nothing to drop */ }
  }
  if (!errors.length) return;
  const failure = firstFailure(errors);
  throw invalidArguments(`${context.prefix ?? ''}${failure.location}`, { ...context, problem: failure.problem ?? context.problem });
}

export function invalidArguments(location: string, { tool, action, problem }: ArgumentContext = {}): SafeError {
  return new SafeError('INVALID_ARGUMENTS', invalidArgumentsMessage, undefined, { location: location || '/', tool, action, problem });
}

/** The service's constraint names, keyed by validator keyword. */
const problems: Record<string, string> = {
  required: 'required', additionalProperties: 'unexpected', type: 'type', enum: 'enum', const: 'enum',
  pattern: 'pattern', minLength: 'min_length', maxLength: 'max_length', minimum: 'minimum', exclusiveMinimum: 'minimum',
  maximum: 'maximum', exclusiveMaximum: 'maximum', minItems: 'min_items', maxItems: 'max_items',
  uniqueItems: 'unique_items', oneOf: 'one_of', not: 'not',
};
// Like the service, a missing required property is reported before an unexpected one, then any other constraint.
const rank = (keyword: string) => keyword === 'required' ? 0 : keyword === 'additionalProperties' ? 1 : 2;
const escape = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** Names the failing property itself, not its parent object, from the validator's structured errors. */
function firstFailure(errors: ErrorObject[]): { location: string; problem?: string } {
  const error = errors.filter(entry => entry.keyword !== 'if').sort((left, right) => rank(left.keyword) - rank(right.keyword))[0];
  if (!error) return { location: '' };
  const property = (error.params as Record<string, unknown>).missingProperty ?? (error.params as Record<string, unknown>).additionalProperty;
  return { location: `${error.instancePath}${typeof property === 'string' ? `/${escape(property)}` : ''}`, problem: problems[error.keyword] ?? 'invalid' };
}
