/**
 * Firefox's built-in consent for data we send (see data_collection_permissions
 * in wxt.config.ts). Other browsers have no such prompt, so they count as allowed.
 * The minimum Firefox versions in wxt.config.ts all support it.
 */

export const ACCOUNT_DATA = ["authenticationInfo", "personallyIdentifyingInfo"];
export const AI_VOTE_DATA = ["browsingActivity"];

/**
 * Shows Firefox's prompt, if these aren't already allowed. Firefox only allows
 * this during a click, so call it before anything is awaited in the handler.
 */
export function requestAccountConsent(): Promise<boolean> {
  if (!import.meta.env.FIREFOX) return Promise.resolve(true);
  return browser.permissions.request({
    data_collection: [...ACCOUNT_DATA, ...AI_VOTE_DATA],
  } as Parameters<typeof browser.permissions.request>[0]);
}

export async function hasDataConsent(categories: string[]): Promise<boolean> {
  if (!import.meta.env.FIREFOX) return true;
  const granted = (await browser.permissions.getAll()) as { data_collection?: string[] };
  return categories.every((category) => granted.data_collection?.includes(category));
}
