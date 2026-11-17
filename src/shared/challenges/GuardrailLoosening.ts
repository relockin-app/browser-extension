// Decides when making a guardrail easier needs a challenge, and which one —
// mirrors iOS GuardrailLoosening.swift.
//
// What counts as loosening. Built-in difficulties rank
// None < Easy < Medium < Hard < Impossible. A custom difficulty can hold
// anything, including nothing, so it counts as Hard when you move away from it
// and as None when you move to it. Moving to a custom difficulty is therefore
// always loosening, unless you start from None. An edit to a difficulty's
// steps loosens it when their combined `stepDifficultyScore` goes down.
//
// What it costs. Lowering a trigger's difficulty costs the difficulty being
// removed, so it never costs less than doing the guarded action once.
// Impossible has nothing to complete and costs Hard. Loosening a difficulty's
// steps costs the steps taken out. Every loosening challenge offers to wait
// `WAIT_INSTEAD_SECONDS` instead, for anyone who can't complete the steps they
// set.
//
// When it applies. Once per change. Not while the user has turned the
// requirement off, and not within `GRACE_PERIOD_MS` of finishing onboarding, so
// a new user can tune their setup first.

import { t } from "~/lib/i18n";
import type { OnboardingState } from "~/types/models";
import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
import { ChallengeResolver, type GuardrailLevel } from "./ChallengeResolver";
import {
  type ChallengeStep,
  ChallengeDifficulty,
  isSameStep,
  stepDifficultyScore,
} from "./ChallengeTypes";
import { presentChallenge } from "./ui/ChallengeModal";
import { isLooseningChallengeRequired } from "./GuardrailLooseningSettings";

export const WAIT_INSTEAD_SECONDS = 3 * 60;
export const GRACE_PERIOD_MS = 30 * 60 * 1000;

const ONBOARDING_STATE_KEY = "local:onboardingState";

// ── Challenge requests ──────────────────────────────────────────────
//
// Each resolves once the change may be applied — straight away when no
// challenge is due — and rejects if the user cancels.

/** Changing a trigger from `current` to `proposed`. */
export async function presentLevelChangeChallenge(
  current: GuardrailLevel,
  proposed: GuardrailLevel,
  goalText: string,
): Promise<void> {
  const cost = isLoosening(current, proposed)
    ? await costOfRemoving(current.steps)
    : [];
  await present(cost, goalText);
}

/**
 * Replacing a difficulty's steps. Deleting a difficulty is replacing its
 * steps with none.
 */
export async function presentStepsEditChallenge(
  current: ChallengeStep[],
  proposed: ChallengeStep[],
  goalText: string,
): Promise<void> {
  await present(await costOfEditing(current, proposed), goalText);
}

/**
 * Turning off the requirement itself. That removes every loosening challenge
 * at once, so it costs Hard, the most any built-in one costs.
 */
export async function presentStopRequiringChallenge(): Promise<void> {
  const hard = await resolver().levelForDifficulty(ChallengeDifficulty.Hard);
  await present(hard.steps, t("challengeGoals_stopRequiringLooseningChallenge"));
}

async function present(steps: ChallengeStep[], goalText: string): Promise<void> {
  await presentChallenge({
    context: { type: "loosenGuardrails" },
    goalText,
    stepsOverride: (await isChallengeRequired(Date.now())) ? steps : [],
    waitInsteadSeconds: WAIT_INSTEAD_SECONDS,
  });
}

// ── Costs ───────────────────────────────────────────────────────────

/**
 * What replacing `current` with `proposed` costs: nothing unless the
 * difficulty gets easier by score, and then the steps taken out. Swapping a
 * step for a harder one is free.
 */
async function costOfEditing(
  current: ChallengeStep[],
  proposed: ChallengeStep[],
): Promise<ChallengeStep[]> {
  if (totalDifficultyScore(proposed) >= totalDifficultyScore(current)) return [];
  return costOfRemoving(removedSteps(current, proposed));
}

/**
 * The steps themselves: removing a challenge means completing it once more.
 * A refusal has nothing to complete, so removing Impossible costs Hard.
 */
async function costOfRemoving(steps: ChallengeStep[]): Promise<ChallengeStep[]> {
  if (!steps.some((s) => s.type === "notAllowed")) return steps;
  return (await resolver().levelForDifficulty(ChallengeDifficulty.Hard)).steps;
}

function totalDifficultyScore(steps: ChallengeStep[]): number {
  return steps.reduce((sum, step) => sum + stepDifficultyScore(step), 0);
}

// ── Classifying edits ───────────────────────────────────────────────

export function isLoosening(
  current: GuardrailLevel,
  proposed: GuardrailLevel,
): boolean {
  if (current.specName === proposed.specName) return false;
  const currentRank = rank(current.builtInDifficulty ?? ChallengeDifficulty.Hard);
  const proposedRank = rank(proposed.builtInDifficulty ?? ChallengeDifficulty.None);
  return proposedRank < currentRank;
}

/**
 * The steps in `current` that `proposed` no longer has. A step whose settings
 * changed (different math) still counts as kept. Exact matches pair up first,
 * so removing one of two math steps charges the one actually removed.
 */
export function removedSteps(
  current: ChallengeStep[],
  proposed: ChallengeStep[],
): ChallengeStep[] {
  const unmatchedProposed = [...proposed];
  const unmatchedCurrent: ChallengeStep[] = [];
  for (const step of current) {
    const index = unmatchedProposed.findIndex((p) => isSameStep(p, step));
    if (index !== -1) {
      unmatchedProposed.splice(index, 1);
    } else {
      unmatchedCurrent.push(step);
    }
  }

  return unmatchedCurrent.filter((step) => {
    const index = unmatchedProposed.findIndex((p) => p.type === step.type);
    if (index === -1) return true;
    unmatchedProposed.splice(index, 1);
    return false;
  });
}

function rank(difficulty: ChallengeDifficulty): number {
  switch (difficulty) {
    case ChallengeDifficulty.None:
      return 0;
    case ChallengeDifficulty.Easy:
      return 1;
    case ChallengeDifficulty.Medium:
      return 2;
    case ChallengeDifficulty.Hard:
      return 3;
    case ChallengeDifficulty.Impossible:
      return 4;
  }
}

// ── When a challenge is due ─────────────────────────────────────────

export async function isChallengeRequired(now: number): Promise<boolean> {
  return (
    (await isLooseningChallengeRequired()) &&
    (await gracePeriodRemainingMs(now)) === null
  );
}

/**
 * Time left in the window after onboarding where loosening is free, or null
 * outside it. Users who finished onboarding before its completion time was
 * recorded get no window.
 */
export async function gracePeriodRemainingMs(
  now: number,
): Promise<number | null> {
  const state = await storage.getItem<OnboardingState>(ONBOARDING_STATE_KEY);
  const completedAt = state?.completedAt;
  if (completedAt === undefined) return null;
  const elapsed = now - completedAt;
  // A clock set back before completion shouldn't reopen the window.
  if (elapsed < 0 || elapsed >= GRACE_PERIOD_MS) return null;
  return GRACE_PERIOD_MS - elapsed;
}

function resolver(): ChallengeResolver {
  return new ChallengeResolver(createWxtChallengeStorage());
}
