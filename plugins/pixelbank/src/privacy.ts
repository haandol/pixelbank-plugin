import { SafeError, type Secrets } from './errors.js';
/** Known connection secrets never enter a creative request or model-visible result. */
export function filterExternalInput(input: unknown, secrets: Secrets): void {
  const text = JSON.stringify(input);
  if (text && (secrets.contains(text) || /Bearer\s+[^\s]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text))) throw new SafeError('SECRET_INPUT', 'Connection credentials cannot be sent as creative input.');
}
