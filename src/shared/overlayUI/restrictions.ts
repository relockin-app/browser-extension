// Which restrictions currently forbid starting a session, and how the user
// gets past them.
//
// Several restrictions can be active at the same moment (a schedule window, a
// spent daily allowance, the quick-return pause). Making the user defuse each
// one in turn doesn't work: every screen only knows about its own restriction,
// so clearing one drops the user onto a start button the background still
// refuses. Instead the whole set is treated as one gate — the user completes
// the strictest single challenge among them, and the session then bypasses all
// of them at once.

import type { RuleSessionStatus } from "~/types/messages";
import {
  type ChallengeContext,
  ChallengeStrength,
} from "~/shared/challenges/ChallengeTypes";
import { ChallengeResolver } from "~/shared/challenges/ChallengeResolver";
import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
import { t } from "~/lib/i18n";
import type { OnClearQuickReturnBlock, OnStartSession } from "./overlay";

export type RestrictionKind = "schedule" | "daily" | "quickReturn";

/**
 * Order restrictions are listed and screened in. Only decides which block
 * screen fronts the set (and the tie-break between equally strict
 * challenges) — never how hard the user has to work to get past it.
 */
const RESTRICTION_ORDER: RestrictionKind[] = [
  "schedule",
  "daily",
  "quickReturn",
];

/** Everything blocking a session start for `status`, in display order. */
export function getActiveRestrictions(
  status: RuleSessionStatus,
  now: number = Date.now(),
): RestrictionKind[] {
  const active: RestrictionKind[] = [];
  if (status.scheduleBlocked) active.push("schedule");
  if (status.dailyRemainingSeconds <= 0) active.push("daily");
  if (
    status.quickReturnBlockedUntil !== null &&
    status.quickReturnBlockedUntil > now
  ) {
    active.push("quickReturn");
  }
  return RESTRICTION_ORDER.filter((kind) => active.includes(kind));
}

/**
 * The block-screen flow for one rule: the restrictions being defused together
 * plus the callbacks that act on the background once they are.
 */
export interface BlockFlow {
  status: RuleSessionStatus;
  /** Every restriction blocking the start — cleared as a set, not one by one. */
  active: RestrictionKind[];
  onStartSession: OnStartSession;
  onClearQuickReturnBlock: OnClearQuickReturnBlock;
}

/** Short name for a restriction, for listing the ones a screen isn't fronting. */
export function restrictionLabel(kind: RestrictionKind): string {
  switch (kind) {
    case "schedule":
      return t("session_restrictionScheduleShort");
    case "daily":
      return t("session_dailyLimitReached");
    case "quickReturn":
      return t("session_restrictionQuickReturnShort");
  }
}

/** The challenge that gates bypassing one restriction at the chosen tier. */
function challengeContextFor(
  kind: RestrictionKind,
  status: RuleSessionStatus,
  requestedMinutes: number,
): ChallengeContext {
  switch (kind) {
    case "schedule":
      return { type: "overrideSchedule", requestedMinutes };
    case "daily":
      return {
        type: "overrideDailyLimit",
        requestedMinutes,
        totalAllowedMinutes: Math.max(
          1,
          Math.round(status.dailyLimitSeconds / 60),
        ),
      };
    case "quickReturn":
      return { type: "rapidSessionStart", count: status.quickReturnCount };
  }
}

function goalTextFor(kind: RestrictionKind): string {
  switch (kind) {
    case "schedule":
      return t("challengeGoals_overrideSchedule");
    case "daily":
      return t("challengeGoals_bypassDailyLimit");
    case "quickReturn":
      return t("challengeGoals_bypassBreak");
  }
}

export interface RestrictionChallenge {
  kind: RestrictionKind;
  context: ChallengeContext;
  goalText: string;
  /** Resolved strictness, or null when no lookup succeeded. */
  strength: ChallengeStrength | null;
}

/**
 * Tier-button subtitle naming how hard `strength` is, or null for "no
 * challenge" and for Impossible, whose tier isn't shown.
 */
export function challengeStrengthSubtitle(
  strength: ChallengeStrength,
): string | null {
  switch (strength) {
    case ChallengeStrength.None:
    case ChallengeStrength.Impossible:
      return null;
    case ChallengeStrength.Easy:
      return t("session_overrideTierChallengeEasy");
    case ChallengeStrength.Medium:
      return t("session_overrideTierChallengeMedium");
    // A custom spec is treated as the top tier — see ChallengeStrength.
    case ChallengeStrength.Hard:
    case ChallengeStrength.Custom:
      return t("session_overrideTierChallengeHard");
  }
}

/**
 * Whether some challenge can get past `challenge`, i.e. it isn't Impossible.
 * A failed lookup counts as allowed: the challenge modal still refuses if it
 * turns out not to be.
 */
export function isRestrictionChallengeAllowed(
  challenge: RestrictionChallenge,
): boolean {
  return challenge.strength !== ChallengeStrength.Impossible;
}

/**
 * The single challenge that stands in for every active restriction: the
 * strictest of the ones the user would otherwise face one at a time. Ties go
 * to the first in `RESTRICTION_ORDER`, so the screen the user is looking at
 * is the one that asks.
 *
 * `requestedMinutes` is the override tier the user picked — the daily and
 * schedule challenges scale with it, so strictness can only be compared once
 * it's known.
 */
export async function strictestRestrictionChallenge(
  flow: BlockFlow,
  requestedMinutes: number,
): Promise<RestrictionChallenge> {
  const { status } = flow;
  const kinds: RestrictionKind[] =
    flow.active.length > 0 ? flow.active : ["daily"];
  const challengeFor = (kind: RestrictionKind): RestrictionChallenge => ({
    kind,
    context: challengeContextFor(kind, status, requestedMinutes),
    goalText: goalTextFor(kind),
    strength: null,
  });

  const resolver = new ChallengeResolver(createWxtChallengeStorage());
  let strictest = challengeFor(kinds[0]);

  for (const kind of kinds) {
    try {
      const candidate = challengeFor(kind);
      const strength = await resolver.resolveStrength(
        candidate.context,
        status.ruleId,
      );
      if (strictest.strength === null || strength > strictest.strength) {
        strictest = { ...candidate, strength };
      }
    } catch (e) {
      // A storage read failed — keep whatever we have rather than dropping
      // the gate entirely.
      console.warn("[RELOCKR] Challenge strength lookup failed:", String(e));
    }
  }

  return strictest;
}

/**
 * Starts the session once the gate is cleared, bypassing exactly the
 * restrictions that were active — the quick-return pause is lifted through the
 * background (it has no per-request bypass flag), the other two ride along as
 * override flags on the start itself.
 */
export async function startSessionPastRestrictions(
  flow: BlockFlow,
  durationSeconds: number,
): Promise<void> {
  if (flow.active.includes("quickReturn")) {
    // Persist the bypass before asking for the session — otherwise the
    // background would still refuse the start it's about to receive.
    await flow.onClearQuickReturnBlock();
  }
  flow.onStartSession(
    flow.status.ruleId,
    durationSeconds,
    flow.active.includes("daily"),
    flow.active.includes("schedule"),
  );
}
