import { uiLocale } from "~/shared/overlayUI/utils/intlFormat";

/**
 * Whether the schedules tutorial has been seen, and whether the "more
 * schedules" tip it leads to is still waiting on the Schedules tab. Mirrors
 * Android `RelockrSchedulesTutorialPrefs` / iOS `RelockrSchedulesTutorial`.
 *
 * Purely cosmetic UI state, so it lives in local extension storage rather
 * than going through the synced storage interface.
 */

const SEEN_KEY = "local:schedulesTutorial.seen";
const MORE_SCHEDULES_TIP_PENDING_KEY = "local:schedulesTutorial.moreSchedulesTipPending";

export async function hasSeenSchedulesTutorial(): Promise<boolean> {
  return (await storage.getItem<boolean>(SEEN_KEY)) === true;
}

export async function setHasSeenSchedulesTutorial(seen: boolean): Promise<void> {
  await storage.setItem(SEEN_KEY, seen);
}

/** Set when the first run of the tutorial ends; the tab then shows a tip over Add Schedule until it's closed or used. */
export async function isMoreSchedulesTipPending(): Promise<boolean> {
  return (await storage.getItem<boolean>(MORE_SCHEDULES_TIP_PENDING_KEY)) === true;
}

export async function setMoreSchedulesTipPending(pending: boolean): Promise<void> {
  await storage.setItem(MORE_SCHEDULES_TIP_PENDING_KEY, pending);
}

/** The Sleep schedule a first schedule starts from, on the tab and in the schedules tutorial. */
export function sleepScheduleDraft(name: string) {
  return {
    name,
    startMinute: 23 * 60,
    endMinute: 6 * 60,
    isEnabled: true,
    mode: 0,
    weekdayMask: 0b1111111,
    shouldAutoApplyToNewRules: true,
  };
}

/** "11:00 PM" (or "23:00"), following the UI language. */
export function formatScheduleMinute(minute: number): string {
  const d = new Date();
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return d.toLocaleTimeString(uiLocale(), { hour: "numeric", minute: "2-digit" });
}
