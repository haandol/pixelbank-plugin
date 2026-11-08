import type { openBrowser } from './oauth.js';

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
