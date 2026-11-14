// Matches the server's rule for names it may echo: lowercase letters and underscores, at most 64.
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z_]{1,64}$/.test(value);
// A JSON location of identifier-like segments or array indexes, never a supplied value.
const pointer = (value: unknown): value is string => typeof value === 'string' && value.length <= 256 &&
  /^\/$|^(\/([A-Za-z_][A-Za-z0-9_]{0,63}|[0-9]{1,6}))+$/.test(value);
const toolName = (value: unknown): value is string => identifier(value) && value.startsWith('pixelbank_');
type Hints = { tool?: string; action?: string; actions?: string[]; location?: string; problem?: string; replacement?: { tool: string; action?: string } };

/** Only typed consent details and identifier- or location-shaped call hints survive; free text never does. */
export class SafeError extends Error {
  readonly credit_cost?: number;
  readonly retry_same_command?: boolean;
  readonly hints: Hints = {};
  constructor(public code: string, message: string, public retryAfterSeconds?: number, details: Record<string, unknown> = {}) {
    super(message);
    if (typeof details.credit_cost === 'number' && Number.isFinite(details.credit_cost) && details.credit_cost >= 0) this.credit_cost = details.credit_cost;
    if (typeof details.retry_same_command === 'boolean') this.retry_same_command = details.retry_same_command;
    if (toolName(details.tool)) this.hints.tool = details.tool;
    if (identifier(details.action)) this.hints.action = details.action;
    const actions = details.actions;
    if (Array.isArray(actions) && actions.length > 0 && actions.length <= 64 && actions.every(identifier)) this.hints.actions = [...actions];
    if (pointer(details.location)) this.hints.location = details.location;
    if (identifier(details.problem)) this.hints.problem = details.problem;
    const replacement = details.replacement as Record<string, unknown> | undefined;
    if (replacement && typeof replacement === 'object' && toolName(replacement.tool))
      this.hints.replacement = { tool: replacement.tool, ...(identifier(replacement.action) ? { action: replacement.action } : {}) };
  }
}

export const uncertainOutcome = 'A write may already have taken effect; do not claim it was unsaved or replay it automatically. Check existing results with read tools or in PixelbankStudio first. An explicit retry must keep the complete original payload, approval, funding method, and operation key; if these are unavailable, ask an operator to reconcile the outcome.';
export const invalidArgumentsMessage = 'PixelbankStudio refused this call before doing any work because its arguments did not match the action\'s exact schema. Describe the action with pixelbank_read action describe if needed, correct the argument at the reported location and send the call again.';
export const authCleanup = 'Run pixelbank_connection action disconnect to finish any retained cleanup. If it reports reauthenticationRequired, use pixelbank_connection action connect for same-account browser recovery. Retry sign-in only after cleanup succeeds and the creator still wants to connect; if cleanup cannot proceed, ask an operator to recover it without deleting credential or lock files.';
export const storageRecovery = 'Ask the local operator to restore safe access while preserving credential and lock files, which may retain pending revocation. Do not copy tokens, change the credential scope to bypass cleanup, or keep retrying before repair.';

export const authCancelled = () => new SafeError('AUTH_CANCELLED', 'Sign-in was cancelled. Do not restart without creator intent. Run pixelbank_connection action disconnect if cleanup is still pending; preserve credential records until cleanup completes.');

export function safeError(error: unknown): { error: { code: string; message: string; retryAfterSeconds?: number; credit_cost?: number; retry_same_command?: boolean } & Hints } {
  if (error instanceof SafeError) return { error: { code: error.code, message: error.message,
    ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
    ...(error.credit_cost === undefined ? {} : { credit_cost: error.credit_cost }),
    ...(error.retry_same_command === undefined ? {} : { retry_same_command: error.retry_same_command }),
    ...structuredClone(error.hints) } };
  return { error: { code: 'INTERNAL_ERROR', message: `The plugin could not complete the operation for an unclassified reason. Ask the local operator to inspect the plugin before retrying. ${uncertainOutcome} Preserve credential and lock files; use pixelbank_connection action disconnect for pending cleanup when storage is usable.` } };
}

export class Secrets {
  private values = new Set<string>();
  add(...values: unknown[]) {
    for (const value of values) if (typeof value === 'string' && value.length > 0) this.values.add(value);
  }
  contains(value: string) { return [...this.values].some(secret => value.includes(secret)); }
  clean(value: unknown): unknown {
    if (typeof value === 'string') {
      for (const secret of [...this.values].sort((a, b) => b.length - a.length)) value = (value as string).split(secret).join('[redacted]');
      return (value as string).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/https?:\/\/[^\s"<>]*[?&]X-Amz-(?:Signature|Credential|Security-Token)=[^\s"<>]*/gi, '[redacted upload URL]')
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]');
    }
    if (Array.isArray(value)) return value.map(item => this.clean(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).filter(([key]) =>
        !/^(access.?token|previous.?access.?token|refresh.?token|id.?token|nonce|authorization|client.?secret|code.?verifier|upload.?url|x-amz-(signature|credential|security-token))$/i.test(key))
        .map(([key, item]) => [this.clean(key) as string, this.clean(item)]));
    }
    return value;
  }
}
