import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type { JsonSchemaType } from '@modelcontextprotocol/server';
import type { Auth } from './auth.js';
import { SafeError, invalidArgumentsMessage } from './errors.js';

type Tool = Awaited<ReturnType<Auth['listCreativeTools']>>[number];
export interface ArgumentContext { tool?: string; action?: string; prefix?: string; problem?: string }

/** Validate the current schema without coercing, defaulting or disclosing supplied values. */
export function validateToolInput(tool: Tool, input: Record<string, unknown>, context: ArgumentContext = {}): void {
  let result: { valid: boolean; errorMessage?: string };
  let validator: AjvJsonSchemaValidator;
  try {
    validator = new AjvJsonSchemaValidator();
    result = validator.getValidator(tool.inputSchema as JsonSchemaType)(input);
  } catch {
    throw new SafeError('INVALID_CATALOG', 'The current tool schema could not be validated. Refresh the service catalog.');
  }
  if (result.valid) return;
  const failure: { location: string; problem?: string } = firstFailure(validator, tool.inputSchema, input) ??
    { location: firstLocation(result.errorMessage) };
  throw invalidArguments(`${context.prefix ?? ''}${failure.location}`, { ...context, problem: failure.problem ?? context.problem });
}

export function invalidArguments(location: string, { tool, action, problem }: ArgumentContext = {}): SafeError {
  return new SafeError('INVALID_ARGUMENTS', invalidArgumentsMessage, undefined, { location: location || '/', tool, action, problem });
}

interface AjvError { keyword: string; instancePath: string; params: Record<string, unknown> }
interface AjvEngine { compile(schema: unknown): ((input: unknown) => boolean) & { errors?: AjvError[] | null } }

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
function firstFailure(validator: AjvJsonSchemaValidator, schema: unknown, input: unknown): { location: string; problem: string } | undefined {
  try {
    // The default 2020-12 engine is the one getValidator uses for these undeclared-dialect schemas.
    const engine = (validator as unknown as { ajv: AjvEngine }).ajv;
    const validate = engine.compile(schema);
    if (validate(input)) return undefined;
    const errors = (validate.errors ?? []).filter(error => error.keyword !== 'if');
    const error = [...errors].sort((left, right) => rank(left.keyword) - rank(right.keyword))[0];
    if (!error) return undefined;
    const property = error.params.missingProperty ?? error.params.additionalProperty;
    const location = `${error.instancePath}${typeof property === 'string' ? `/${escape(property)}` : ''}`;
    return { location, problem: problems[error.keyword] ?? 'invalid' };
  } catch { return undefined; }
}

// The validator reports locations as data/<pointer>; only the first pointer is kept and sanitized by SafeError.
function firstLocation(message = ''): string {
  return /^data(\/\S*?)?(?=[\s,]|$)/.exec(message)?.[1] ?? '';
}
