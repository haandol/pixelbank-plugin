import { SafeError, uncertainOutcome } from './errors.js';
const messages: Record<string, string> = {
 AUTH_REQUIRED: 'PixelbankStudio rejected authorization. Ask the PixelbankStudio operator to repair configuration or authorization before retrying. Repeating connection setup or cleanup does not force a rejected unexpired token to refresh. After repair, use pixelbank_connect to resume retained setup or recovery, or pixelbank_disconnect to finish cleanup. Preserve credential records.',
 CONNECTION_INACTIVE: 'This connection has been revoked. Reconnect with the same account before using creative tools.',
 CONNECTION_FORBIDDEN: 'The granted scopes do not permit this operation.',
 NOT_ENOUGH_CREDIT: 'There are not enough credits. Top up in PixelbankStudio before retrying the original operation.',
 FREE_TRIAL_UNAVAILABLE: 'Free-use availability could not be confirmed. Paid fallback requires separate consent for this operation.',
 CREDIT_PRICE_CHANGED: 'The current price exceeds the approved amount. Review a new quote before authorizing execution.',
 MCP_APPROVAL_INVALID: 'Review and authorize the exact operation and credit amount before execution.',
 IDEMPOTENCY_KEY_CONFLICT: 'This operation key belongs to different inputs. Recover the original request and result.',
 ALREADY_PROCESSED: 'This operation is already recorded and was not run again. Check available results or the workflow in PixelbankStudio. Do not automatically resubmit with a new operation key; a new operation requires explicit user intent.',
 WORKFLOW_CONFLICT: 'The workflow changed. Reload its acknowledged state before choosing the next action.',
 WORKSPACE_CONFLICT: 'This workspace preparation conflicts with an existing request or newer workflow revision.',
 WORKSPACE_UNAVAILABLE: 'The prepared workspace or one of its owned source assets is unavailable.',
};
export function apiError(status: number, code: string, headerPause?: number, structuredPause?: unknown, details: Record<string, unknown> = {}): SafeError {
 if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) code = 'API_ERROR';
 if (status === 401) return new SafeError('AUTH_REQUIRED', messages.AUTH_REQUIRED!);
 if ((status === 429 || status === 503) && code === 'API_ERROR') code = status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE';
 const error = new SafeError(code, messages[code] ?? `PixelbankStudio could not complete the operation (${code}). ${uncertainOutcome}`, undefined, details);
 if (status === 429 || status === 503 || code === 'RATE_LIMITED') {
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 86400;
  const delays = [headerPause, structuredPause, details.retry_after_seconds, details.retry_after];
  error.retryAfterSeconds = Math.max(0, ...delays.filter(valid)) || 30;
 }
 return error;
}
