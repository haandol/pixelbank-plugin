import type { openBrowser } from './oauth.js';
import { SafeError, safeError } from './errors.js';

export const CREDITS_PAGE_URL = 'https://www.pixelbankstudio.com/pricing';

/** Opening the public credit page never selects a plan or submits an operation. */
export async function openCreditsPage(browser: typeof openBrowser) {
  try {
    await browser(CREDITS_PAGE_URL);
    return { data: { url: CREDITS_PAGE_URL, opened: true } };
  } catch {
    return { data: { url: CREDITS_PAGE_URL, opened: false,
      message: 'Open this link to add credits in PixelbankStudio, then ask to continue your original request.' } };
  }
}

/** Preserve the original refusal, adding page recovery only for confirmed insufficient credits. */
export async function recoverCreditShortage(error: unknown, browser: typeof openBrowser) {
  const failure = safeError(error);
  if (!(error instanceof SafeError && error.code === 'NOT_ENOUGH_CREDIT')) return failure;
  const recovery = await openCreditsPage(browser);
  return { error: { ...failure.error, credits_url: recovery.data.url,
    credits_page_opened: recovery.data.opened } };
}
