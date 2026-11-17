// RelockrScheduleConstraints — logic-owner for schedule-based session gating.
//
// A direct port of iOS `RelockrScheduleConstraints.swift`. Pure logic: the only
// non-trivial dependency is the i18n accessor used to build human-readable
// reason strings (the numeric `isBlocked` / `maxContinuousMinutes` outputs are
// dependency-free and used by the background service worker).

import type { RelockrSchedule } from "~/types/models";
import { t } from "~/lib/i18n";
import { uiLocale } from "~/shared/overlayUI/utils/intlFormat";

// ── Result types ────────────────────────────────────────────────────

export interface ScheduleBlockingInfo {
  scheduleName: string;
  /** e.g. "Blocked by 'Bedtime' until 7:00 AM" */
  reason: string;
}

export interface ScheduleConstraintInfo {
  scheduleName: string;
  /** e.g. "Allowed until 'Bedtime' blocks at 10:30 PM" */
  reason: string;
}

export interface ScheduleConstraintResult {
  /** Whether the session is currently blocked by schedule constraints. */
  isBlocked: boolean;
  /**
   * Max continuous unblocked minutes from `now`, considering only schedule
   * constraints (the caller should also apply the daily usage cap separately).
   * `null` means schedules impose no limit (no relevant schedules, or unblocked
   * indefinitely).
   */
  maxContinuousMinutes: number | null;
  /** Present when `isBlocked === true`. Describes why and which schedule. */
  blockingInfo: ScheduleBlockingInfo | null;
  /** Present when a schedule constrains the duration. */
  constraintInfo: ScheduleConstraintInfo | null;
}

// ── Core logic ──────────────────────────────────────────────────────

// Maximum lookahead for finding the next boundary (minutes). 7 days covers all
// weekday patterns.
const MAX_LOOKAHEAD_MINUTES = 7 * 24 * 60;

type ConstraintKind =
  | { type: "blacklistStarts"; schedule: RelockrSchedule }
  | { type: "whitelistEnds"; schedule: RelockrSchedule };

/**
 * Evaluate schedule constraints for a given rule at a given time.
 *
 * @param now The current date/time.
 * @param schedules All schedules linked to this rule (already filtered).
 *                  Only enabled schedules are considered.
 */
export function evaluate(
  now: Date,
  schedules: RelockrSchedule[],
): ScheduleConstraintResult {
  const enabled = schedules.filter((s) => s.isEnabled);
  const blacklists = enabled.filter((s) => s.mode === 0);
  const whitelists = enabled.filter((s) => s.mode === 1);

  const minute = minuteOfDay(now);
  const weekday = weekdayIndex(now); // 0 = Sunday

  // --- Check if currently blocked ---

  // Blacklist check: blocked if ANY active blacklist covers now.
  const blocker = blacklists.find((s) =>
    isTimeInWindow(minute, weekday, s),
  );
  if (blocker) {
    const endsIn = minutesUntilWindowEnds(minute, weekday, blocker);
    const endsAtMinute = (minute + endsIn) % 1440;
    return {
      isBlocked: true,
      maxContinuousMinutes: 0,
      blockingInfo: {
        scheduleName: blocker.name,
        reason: t("session_scheduleBlockedUntilFormat", [
          blocker.name,
          formatMinute(endsAtMinute),
        ]),
      },
      constraintInfo: null,
    };
  }

  // Whitelist check: if whitelists exist, blocked unless at least one covers now.
  if (whitelists.length > 0) {
    const inAnyWhitelist = whitelists.some((s) =>
      isTimeInWindow(minute, weekday, s),
    );
    if (!inAnyWhitelist) {
      const { minutes: nextMinutes, schedule: nextSchedule } =
        findNextWindowStart(minute, weekday, whitelists);
      const startsAtMinute = (minute + nextMinutes) % 1440;
      const reason = nextSchedule
        ? t("session_scheduleOpensAtFormat", [
            nextSchedule.name,
            formatMinute(startsAtMinute),
          ])
        : t("session_scheduleOutsideAllWindows");
      return {
        isBlocked: true,
        maxContinuousMinutes: 0,
        blockingInfo: {
          scheduleName: nextSchedule?.name ?? t("scheduleCard_defaultScheduleName"),
          reason,
        },
        constraintInfo: null,
      };
    }
  }

  // --- Not blocked. Find max continuous unblocked minutes ---

  const { minutes: maxMinutes, kind } = findMaxContinuousMinutes(
    minute,
    weekday,
    blacklists,
    whitelists,
  );

  let constraintInfo: ScheduleConstraintInfo | null = null;
  if (kind && maxMinutes < MAX_LOOKAHEAD_MINUTES) {
    const constraintMinute = (minute + maxMinutes) % 1440;
    const constraintStr = formatMinute(constraintMinute);
    if (kind.type === "blacklistStarts") {
      constraintInfo = {
        scheduleName: kind.schedule.name,
        reason: t("session_scheduleAllowedUntilBlocksFormat", [
          kind.schedule.name,
          constraintStr,
        ]),
      };
    } else {
      constraintInfo = {
        scheduleName: kind.schedule.name,
        reason: t("session_scheduleAllowedUntilEndsFormat", [
          kind.schedule.name,
          constraintStr,
        ]),
      };
    }
  }

  return {
    isBlocked: false,
    maxContinuousMinutes:
      maxMinutes < MAX_LOOKAHEAD_MINUTES ? maxMinutes : null,
    blockingInfo: null,
    constraintInfo,
  };
}

// ── Time-in-window check ─────────────────────────────────────────────

/**
 * Whether a given minute-of-day + weekday falls within a schedule's window.
 *
 * - `startMinute < endMinute`: window is `[start, end)` on the same day.
 * - `startMinute > endMinute`: window wraps midnight — `[start, 1440)` ∪ `[0, end)`.
 *   The first half uses the start's weekday, the second half the next day's.
 * - `startMinute === endMinute`: empty window (never active).
 */
export function isTimeInWindow(
  minute: number,
  weekday: number,
  schedule: RelockrSchedule,
): boolean {
  const s = schedule.startMinute;
  const e = schedule.endMinute;

  if (s === e) return false;

  if (s < e) {
    // Same-day window: [s, e)
    if (!isWeekdayActive(weekday, schedule.weekdayMask)) return false;
    return minute >= s && minute < e;
  } else {
    // Wraps midnight: [s, 1440) on day D, then [0, e) on day D+1.
    if (minute >= s) {
      // Evening portion — today's weekday.
      return isWeekdayActive(weekday, schedule.weekdayMask);
    } else if (minute < e) {
      // Morning portion — the schedule started yesterday.
      const yesterday = (weekday + 6) % 7;
      return isWeekdayActive(yesterday, schedule.weekdayMask);
    }
    return false;
  }
}

// ── Find max continuous unblocked minutes ────────────────────────────

/**
 * Scan forward minute-by-minute to find how long the user can remain unblocked.
 */
function findMaxContinuousMinutes(
  startMinute: number,
  startWeekday: number,
  blacklists: RelockrSchedule[],
  whitelists: RelockrSchedule[],
): { minutes: number; kind: ConstraintKind | null } {
  const hasWhitelists = whitelists.length > 0;
  let minute = startMinute;
  let weekday = startWeekday;
  let elapsed = 0;

  while (elapsed < MAX_LOOKAHEAD_MINUTES) {
    elapsed += 1;
    minute += 1;
    if (minute >= 1440) {
      minute = 0;
      weekday = (weekday + 1) % 7;
    }

    // Check blacklist hit.
    const blocker = blacklists.find((s) =>
      isTimeInWindow(minute, weekday, s),
    );
    if (blocker) {
      return { minutes: elapsed, kind: { type: "blacklistStarts", schedule: blocker } };
    }

    // Check whitelist coverage.
    if (hasWhitelists) {
      const inAny = whitelists.some((s) => isTimeInWindow(minute, weekday, s));
      if (!inAny) {
        // Find which whitelist just ended (covered the previous minute).
        const prevMinute = minute === 0 ? 1439 : minute - 1;
        const prevWeekday = minute === 0 ? (weekday + 6) % 7 : weekday;
        const ender = whitelists.find((s) =>
          isTimeInWindow(prevMinute, prevWeekday, s),
        );
        return {
          minutes: elapsed,
          kind: ender ? { type: "whitelistEnds", schedule: ender } : null,
        };
      }
    }
  }

  return { minutes: MAX_LOOKAHEAD_MINUTES, kind: null };
}

// ── Find when a window ends (minutes from now) ───────────────────────

/**
 * Given that `minute`/`weekday` is currently inside `schedule`'s window,
 * how many minutes until the window ends?
 */
function minutesUntilWindowEnds(
  minute: number,
  weekday: number,
  schedule: RelockrSchedule,
): number {
  let m = minute;
  let wd = weekday;
  let elapsed = 0;

  while (elapsed < MAX_LOOKAHEAD_MINUTES) {
    elapsed += 1;
    m += 1;
    if (m >= 1440) {
      m = 0;
      wd = (wd + 1) % 7;
    }
    if (!isTimeInWindow(m, wd, schedule)) {
      return elapsed;
    }
  }
  return MAX_LOOKAHEAD_MINUTES;
}

// ── Find next window start ───────────────────────────────────────────

/** Scan forward to find when the next schedule window opens. */
function findNextWindowStart(
  startMinute: number,
  startWeekday: number,
  schedules: RelockrSchedule[],
): { minutes: number; schedule: RelockrSchedule | null } {
  let minute = startMinute;
  let weekday = startWeekday;
  let elapsed = 0;

  while (elapsed < MAX_LOOKAHEAD_MINUTES) {
    elapsed += 1;
    minute += 1;
    if (minute >= 1440) {
      minute = 0;
      weekday = (weekday + 1) % 7;
    }
    const opener = schedules.find((s) => isTimeInWindow(minute, weekday, s));
    if (opener) {
      return { minutes: elapsed, schedule: opener };
    }
  }
  return { minutes: MAX_LOOKAHEAD_MINUTES, schedule: null };
}

// ── Helpers ──────────────────────────────────────────────────────────

export function isWeekdayActive(weekday: number, mask: number): boolean {
  return (mask & (1 << weekday)) !== 0;
}

export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Returns weekday index where 0 = Sunday, 6 = Saturday (bitmask convention). */
export function weekdayIndex(date: Date): number {
  return date.getDay(); // JS getDay(): 0 = Sunday … 6 = Saturday
}

/** Formats a minute-of-day (0–1439) as a short local time string, e.g. "7:00 AM". */
export function formatMinute(minute: number): string {
  const d = new Date();
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return d.toLocaleTimeString(uiLocale(), { hour: "numeric", minute: "2-digit" });
}
