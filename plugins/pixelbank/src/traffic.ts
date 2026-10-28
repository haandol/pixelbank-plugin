import { SafeError } from './errors.js';
export interface TrafficState { blockedUntil?: number }
export function validTraffic(value: unknown): value is TrafficState {
  return !!value && typeof value === 'object' && (!('blockedUntil' in value) || (Number.isFinite(value.blockedUntil) && Number(value.blockedUntil) >= 0));
}
export function retryAfterSeconds(value: string | null): number {
  const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? Math.ceil((Date.parse(value) - Date.now()) / 1000) : 30;
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400 ? Math.max(1, seconds) : 30;
}
export function checkRequestBudget(state?: TrafficState) {
  if ((state?.blockedUntil ?? 0) > Date.now()) throw new SafeError('REQUEST_THROTTLED', 'Wait before retrying this operation with its original inputs and operation key.', Math.ceil((state!.blockedUntil! - Date.now()) / 1000));
}
export async function reserveRequest(state?: TrafficState): Promise<TrafficState> { checkRequestBudget(state); return state ?? {}; }
