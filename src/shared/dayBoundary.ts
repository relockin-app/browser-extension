/**
 * The hour (in local time) at which a new "usage day" begins.
 * e.g. 3 means 2:59 AM still counts as the previous day.
 */
export const DAY_BOUNDARY_HOUR = 3;

/**
 * Returns the current "logical day" as a YYYY-MM-DD string,
 * using the user's local timezone with a day boundary at DAY_BOUNDARY_HOUR.
 *
 * For example, at 1:00 AM local on March 8 with a boundary of 3,
 * the logical day is still "2025-03-07".
 */
export function todayLocal(): string {
  const now = new Date();
  const shifted = new Date(
    now.getTime() - DAY_BOUNDARY_HOUR * 60 * 60 * 1000,
  );
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** When the current "logical day" ends: the next DAY_BOUNDARY_HOUR, local time. */
export function nextDayBoundary(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}
