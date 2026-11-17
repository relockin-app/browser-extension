// Quick-return guard ("Take a break") — mirrors iOS RelockrModel.recomputeQuickReturnBlock.
//
// Starting sessions back-to-back is the shape a binge takes: end a session,
// immediately start another, repeat. When recently-completed sessions chain
// together with only a short gap between them, we pause session starts for a
// while. The pause is bypassable, but only through the `rapidSessionStart`
// challenge — which escalates with the length of the chain.
//
// A chain is a stretch of *use*, not of open sessions: session time only
// ticks while the site is focused, so a 5-minute session can stay open for an
// hour while the user is elsewhere. Walking away mid-session for at least the
// gap is the same break as waiting that long between sessions, and ends the
// chain there.
//
// The block state is *derived*, not stored: every call recomputes it from the
// recent session history plus the two user-tunable knobs. The one persisted
// bit is the bypass marker written by `clearQuickReturnBlock()`.

import type { ReelockrStorage } from "~/storage/interface";
import type { RuleSession } from "~/types/models";
import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
import { ChallengeResolver } from "../challenges/ChallengeResolver";
import { ensureSettingsLoaded, getSetting } from "../settings/relockrSettings";
import { SettingsKey } from "../settings/settingsKey";

/** Epoch ms; completed sessions ending at or before this were already bypassed. */
const CLEARED_THROUGH_KEY = "local:relockrQuickReturnClearedThrough";

/** How far back through completed sessions we walk when counting a chain. */
const RECENT_SESSION_LOOKBACK = 20;

/**
 * Minimum time actually spent in a completed session for it to count toward
 * the chain.
 * Kept hardcoded — the user-facing knobs are the gap and pause durations;
 * this is plumbing that filters out drive-by sessions that don't represent
 * real binge intent.
 */
const MIN_SESSION_SECONDS_FOR_CHAIN = 45;

export interface QuickReturnBlockState {
  /** Epoch ms the pause lifts, or null when no pause is in effect. */
  blockedUntil: number | null;
  /** How many back-to-back sessions led to this pause (0 when unblocked). */
  count: number;
}

function unblocked(): QuickReturnBlockState {
  return { blockedUntil: null, count: 0 };
}

/**
 * Recomputes the cross-rule quick-return pause from recent completed sessions.
 * Returns `blockedUntil: null` when the user is free to start a session.
 */
export async function computeQuickReturnBlock(
  store: ReelockrStorage,
): Promise<QuickReturnBlockState> {
  // Read both knobs up front so the rest of the function sees a consistent
  // snapshot even if settings change mid-recompute.
  await ensureSettingsLoaded();
  const gapSeconds = getSetting<number>(
    SettingsKey.General.QuickReturnGapSeconds,
  );
  const pauseSeconds = getSetting<number>(
    SettingsKey.General.QuickReturnPauseSeconds,
  );
  if (!(gapSeconds > 0) || !(pauseSeconds > 0)) return unblocked();

  const completed = (
    await store.getRecentCompletedSessions(RECENT_SESSION_LOOKBACK)
  ).filter(
    (s) =>
      s.endTime !== null && s.usedSeconds >= MIN_SESSION_SECONDS_FOR_CHAIN,
  );

  const lastEndTime = completed[0]?.endTime?.getTime();
  if (lastEndTime === undefined) return unblocked();

  // Already bypassed this chain — don't re-block until a newer session ends.
  const clearedThrough =
    (await storage.getItem<number>(CLEARED_THROUGH_KEY)) ?? 0;
  if (lastEndTime <= clearedThrough) return unblocked();

  // The pause runs from the end of the chain, so it also bounds how long a
  // stale chain can matter — nothing older than one pause can block.
  const blockedUntil = lastEndTime + pauseSeconds * 1000;
  if (Date.now() >= blockedUntil) return unblocked();

  // Walk backwards while each session started soon after the previous was
  // last used, stopping at a session the user walked away from partway
  // through: the chain only reaches back to that break. When the newest
  // session holds the break, the chain is just the part after it.
  const gapMs = gapSeconds * 1000;
  const hadBreakInside = (s: RuleSession) => s.longestIdleSeconds >= gapSeconds;
  let count = 1;
  for (let i = 0; i < completed.length - 1; i++) {
    if (hadBreakInside(completed[i])) break;
    const older = completed[i + 1];
    const olderLastUse = older.lastActiveTime ?? older.endTime;
    if (!olderLastUse) break;
    const gap = completed[i].startTime.getTime() - olderLastUse.getTime();
    if (gap < 0 || gap >= gapMs) break;
    count += 1;
  }

  // A chain length whose challenge resolves to "none" isn't worth pausing for
  // — there would be nothing to complete on the block screen.
  const resolver = new ChallengeResolver(createWxtChallengeStorage());
  const steps = await resolver.resolve({ type: "rapidSessionStart", count });
  if (steps.length === 0) return unblocked();

  return { blockedUntil, count };
}

/**
 * Marks the current chain as bypassed, after the user completed the
 * `rapidSessionStart` challenge. Sessions that end from here on start a
 * fresh chain.
 */
export async function clearQuickReturnBlock(): Promise<void> {
  await storage.setItem(CLEARED_THROUGH_KEY, Date.now());
}

/** True when `state` currently forbids starting a session. */
export function isQuickReturnBlockActive(
  state: QuickReturnBlockState,
  now: number = Date.now(),
): boolean {
  return state.blockedUntil !== null && state.blockedUntil > now;
}
