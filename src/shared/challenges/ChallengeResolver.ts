// Three-tier challenge resolution — mirrors iOS ChallengeResolver.swift
//
// Lookup order:
//   1. Per-rule ChallengeOverride (specific trigger, then wildcard)
//   2. Global TriggerDefaultDifficulty for the trigger key
//   3. The built-in difficulty from getTriggerDefaultDifficulty — its saved
//      edits if any, otherwise its hardcoded steps
//
// A result containing `notAllowed` (the Impossible difficulty) is collapsed to
// just that step, so the user is refused up front rather than after working
// through other steps.
//
// The `level` methods expose the same lookup one step earlier — which
// difficulty a trigger is set to, not just its steps — so GuardrailLoosening
// can compare a setting before and after an edit.

import type { ChallengeStorage } from "~/storage/challengeInterface";
import type { ChallengeDifficultySpec } from "~/types/challengeModels";
import {
  type ChallengeContext,
  type ChallengeStep,
  ChallengeDifficulty,
  ChallengeStrength,
  difficultyFromSpecName,
  getTriggerKey,
  getTriggerDefaultDifficulty,
  getDefaultSteps,
  strengthOfSpecName,
} from "./ChallengeTypes";

/** A trigger's difficulty setting, together with the steps it resolves to. */
export interface GuardrailLevel {
  /** Null for a custom difficulty. */
  builtInDifficulty: ChallengeDifficulty | null;
  specName: string;
  steps: ChallengeStep[];
}

export class ChallengeResolver {
  constructor(private storage: ChallengeStorage) {}

  async resolve(
    context: ChallengeContext,
    ruleId?: string,
  ): Promise<ChallengeStep[]> {
    const { steps } = await this.levelForTriggerKey(
      getTriggerKey(context),
      ruleId,
    );
    return steps.some((s) => s.type === "notAllowed")
      ? [{ type: "notAllowed" }]
      : steps;
  }

  /**
   * Whether any challenge can unlock the action, i.e. its difficulty isn't
   * Impossible. For UI that offers the action as one of several choices and
   * hides the ones no challenge can unlock.
   */
  async isAllowed(
    context: ChallengeContext,
    ruleId?: string,
  ): Promise<boolean> {
    const { steps } = await this.levelForTriggerKey(
      getTriggerKey(context),
      ruleId,
    );
    return !steps.some((s) => s.type === "notAllowed");
  }

  /**
   * How strict the challenge this context resolves to is, on a comparable
   * scale. Used to pick which restriction to enforce when several block a
   * session at once — see `strictestRestrictionChallenge`.
   */
  async resolveStrength(
    context: ChallengeContext,
    ruleId?: string,
  ): Promise<ChallengeStrength> {
    const level = await this.levelForTriggerKey(getTriggerKey(context), ruleId);
    if (level.steps.some((s) => s.type === "notAllowed")) {
      return ChallengeStrength.Impossible;
    }
    return strengthOfSpecName(level.specName);
  }

  // ── Levels ──────────────────────────────────────────────────────

  /** What a trigger is set to for a rule (lookup steps 1-3). */
  async levelForTriggerKey(
    triggerKey: string,
    ruleId?: string,
  ): Promise<GuardrailLevel> {
    // 1. Per-rule override
    if (ruleId) {
      const spec = await this.ruleOverrideSpec(ruleId, triggerKey);
      if (spec) return levelOfSpec(spec);
    }
    return this.globalLevel(triggerKey);
  }

  /** What a trigger is set to for rules without their own override (steps 2-3). */
  async globalLevel(triggerKey: string): Promise<GuardrailLevel> {
    // 2. Global trigger default
    const spec = await this.triggerDefaultSpec(triggerKey);
    if (spec) return levelOfSpec(spec);
    return this.fallbackLevel(triggerKey);
  }

  /**
   * What a trigger is set to when no global default is saved (step 3): its
   * built-in difficulty, with any edits the user saved to that difficulty.
   */
  fallbackLevel(triggerKey: string): Promise<GuardrailLevel> {
    return this.levelForDifficulty(getTriggerDefaultDifficulty(triggerKey));
  }

  /**
   * A built-in difficulty as it applies wherever it's assigned: its saved
   * row's steps when one exists, otherwise the hardcoded defaults.
   */
  async levelForDifficulty(
    difficulty: ChallengeDifficulty,
  ): Promise<GuardrailLevel> {
    const spec = await this.storage.getSpecByName(difficulty);
    const steps =
      spec && spec.steps.length > 0
        ? stepsOfSpec(spec)
        : getDefaultSteps(difficulty);
    return { builtInDifficulty: difficulty, specName: difficulty, steps };
  }

  /**
   * The difficulty a picker option names. A built-in that hasn't been saved
   * yet gets its hardcoded steps.
   */
  async levelForSpecName(specName: string): Promise<GuardrailLevel> {
    const difficulty = difficultyFromSpecName(specName);
    if (difficulty) return this.levelForDifficulty(difficulty);
    const spec = await this.storage.getSpecByName(specName);
    return { builtInDifficulty: null, specName, steps: spec?.steps ?? [] };
  }

  // ── Storage lookups ─────────────────────────────────────────────

  private async ruleOverrideSpec(
    ruleId: string,
    triggerKey: string,
  ): Promise<ChallengeDifficultySpec | null> {
    const overrides = await this.storage.getOverridesForRule(ruleId);

    // Specific trigger takes precedence over wildcard (null trigger)
    const specific = overrides.find((o) => o.trigger === triggerKey);
    const wildcard = overrides.find((o) => o.trigger === null);
    const override = specific ?? wildcard;

    if (!override) return null;

    return this.storage.getSpec(override.specId);
  }

  private async triggerDefaultSpec(
    triggerKey: string,
  ): Promise<ChallengeDifficultySpec | null> {
    const td = await this.storage.getTriggerDefault(triggerKey);
    if (!td) return null;

    return this.storage.getSpec(td.specId);
  }
}

/** A saved spec's level. Its row's steps are used as saved. */
function levelOfSpec(spec: ChallengeDifficultySpec): GuardrailLevel {
  return {
    builtInDifficulty: difficultyFromSpecName(spec.name),
    specName: spec.name,
    steps: stepsOfSpec(spec),
  };
}

/**
 * The Impossible spec always refuses, whatever its row holds. Its steps
 * aren't user-editable, and a row with no steps would otherwise read as no
 * challenge at all.
 */
function stepsOfSpec(spec: ChallengeDifficultySpec): ChallengeStep[] {
  return spec.name === ChallengeDifficulty.Impossible
    ? getDefaultSteps(ChallengeDifficulty.Impossible)
    : spec.steps;
}
