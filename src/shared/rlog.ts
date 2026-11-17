/**
 * Debug log, printed in dev builds only. For something a user should be able
 * to see and report from a production build (a failed request, a broken
 * feature), use console.warn or console.error instead.
 */
export function rlog(...args: unknown[]): void {
  if (!import.meta.env.DEV) return;
  console.log("[RELOCKR]", ...args);
}
