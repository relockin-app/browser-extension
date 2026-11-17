// Core challenge types — mirrors iOS ChallengeTypes.swift + ChallengeContext

import { t } from "~/lib/i18n";

// ── Math Challenge ──────────────────────────────────────────────────

export enum MathOperation {
  Addition = "addition",
  Subtraction = "subtraction",
  Multiplication = "multiplication",
  Division = "division",
}

export const MATH_OPERATION_SYMBOLS: Record<MathOperation, string> = {
  [MathOperation.Addition]: "+",
  [MathOperation.Subtraction]: "−",
  [MathOperation.Multiplication]: "×",
  [MathOperation.Division]: "÷",
};

export enum MathDifficulty {
  Easy = "easy",
  Medium = "medium",
  Hard = "hard",
  ExtraHard = "extraHard",
}

export interface MathChallengeConfig {
  difficulty: MathDifficulty;
  problemCount: number;
  allowAddition: boolean;
  allowSubtraction: boolean;
  allowMultiplication: boolean;
  allowDivision: boolean;
}

export const DEFAULT_MATH_CONFIG: MathChallengeConfig = {
  difficulty: MathDifficulty.Easy,
  problemCount: 3,
  allowAddition: true,
  allowSubtraction: false,
  allowMultiplication: false,
  allowDivision: false,
};

export function getEnabledOperations(
  config: MathChallengeConfig,
): MathOperation[] {
  const ops: MathOperation[] = [];
  if (config.allowAddition) ops.push(MathOperation.Addition);
  if (config.allowSubtraction) ops.push(MathOperation.Subtraction);
  if (config.allowMultiplication) ops.push(MathOperation.Multiplication);
  if (config.allowDivision) ops.push(MathOperation.Division);
  return ops.length > 0 ? ops : [MathOperation.Addition];
}

/** Operand range for addition, subtraction, and division dividend. */
export function getOperandRange(
  difficulty: MathDifficulty,
): [number, number] {
  switch (difficulty) {
    case MathDifficulty.Easy:
      return [1, 20];
    case MathDifficulty.Medium:
      return [10, 50];
    case MathDifficulty.Hard:
      return [20, 100];
    case MathDifficulty.ExtraHard:
      return [50, 500];
  }
}

/** Factor range for multiplication and division divisors. */
export function getFactorRange(
  difficulty: MathDifficulty,
): [number, number] {
  switch (difficulty) {
    case MathDifficulty.Easy:
      return [2, 9];
    case MathDifficulty.Medium:
      return [2, 12];
    case MathDifficulty.Hard:
      return [2, 15];
    case MathDifficulty.ExtraHard:
      return [2, 25];
  }
}

// ── Challenge Step ──────────────────────────────────────────────────

export type ChallengeStep =
  | { type: "typingShort" }
  | { type: "typingLong" }
  | { type: "typingParagraph" }
  | { type: "math"; config: MathChallengeConfig }
  | { type: "accountabilityEmail" }
  /**
   * Forces a countdown to elapse before the confirm button appears. The
   * length is per step, so each occurrence in a spec can differ.
   */
  | { type: "waitTimer"; seconds: number }
  /**
   * Refuses the action outright — no confirm path. The only step of the
   * built-in Impossible difficulty. Hidden from the step editor.
   */
  | { type: "notAllowed" };

export type ChallengeStepType = ChallengeStep["type"];

/**
 * Wait-timer lengths the step editor offers, in seconds. 15s steps to 2min,
 * 1min steps to 10min, 5min steps to 20min. Mirrors iOS
 * WaitTimerDurationSlider.allowedSeconds.
 */
export const WAIT_TIMER_ALLOWED_SECONDS = [
  15, 30, 45, 60, 75, 90, 105, 120, 180, 240, 300, 360, 420, 480, 540, 600,
  900, 1200,
];

export const DEFAULT_WAIT_TIMER_SECONDS = 30;

/**
 * Rough effort of a step, 1-10. Internal only, never shown. Used to tell
 * whether an edit left a difficulty easier. A step's settings (math
 * difficulty, problem count) don't change its score.
 */
export function stepDifficultyScore(step: ChallengeStep): number {
  switch (step.type) {
    case "typingShort":
      return 2;
    case "waitTimer":
      return 3;
    case "typingLong":
      return 4;
    case "math":
      return 5;
    case "accountabilityEmail":
      return 6;
    case "typingParagraph":
      return 7;
    case "notAllowed":
      return 10;
  }
}

/** Whether two steps are identical, settings included. */
export function isSameStep(a: ChallengeStep, b: ChallengeStep): boolean {
  if (a.type === "waitTimer" && b.type === "waitTimer") {
    return a.seconds === b.seconds;
  }
  if (a.type === "math" && b.type === "math") {
    return (
      a.config.difficulty === b.config.difficulty &&
      a.config.problemCount === b.config.problemCount &&
      a.config.allowAddition === b.config.allowAddition &&
      a.config.allowSubtraction === b.config.allowSubtraction &&
      a.config.allowMultiplication === b.config.allowMultiplication &&
      a.config.allowDivision === b.config.allowDivision
    );
  }
  return a.type === b.type;
}

// ── Challenge Difficulty ────────────────────────────────────────────

export enum ChallengeDifficulty {
  None = "none",
  Easy = "easy",
  Medium = "medium",
  Hard = "hard",
  /**
   * No challenge can unlock the action — it's refused outright. Maps to a
   * single `notAllowed` step. UI that offers the action as one of several
   * choices hides it instead; see `ChallengeResolver.isAllowed`.
   */
  Impossible = "impossible",
}

/** Every built-in difficulty, in the order difficulty pickers list them. */
export const BUILT_IN_DIFFICULTIES: ChallengeDifficulty[] = [
  ChallengeDifficulty.None,
  ChallengeDifficulty.Easy,
  ChallengeDifficulty.Medium,
  ChallengeDifficulty.Hard,
  ChallengeDifficulty.Impossible,
];

/**
 * The built-in difficulty a stored spec is named after, e.g. to turn a picker
 * selection back into a difficulty. Null for custom spec names.
 */
export function difficultyFromSpecName(
  name: string,
): ChallengeDifficulty | null {
  return BUILT_IN_DIFFICULTIES.find((d) => d === name) ?? null;
}

export function difficultyDisplayName(difficulty: ChallengeDifficulty): string {
  switch (difficulty) {
    case ChallengeDifficulty.None:
      return t("challengeUi_difficultyNone");
    case ChallengeDifficulty.Easy:
      return t("challengeUi_difficultyEasy");
    case ChallengeDifficulty.Medium:
      return t("challengeUi_difficultyMedium");
    case ChallengeDifficulty.Hard:
      return t("challengeUi_difficultyHard");
    case ChallengeDifficulty.Impossible:
      return t("challengeUi_difficultyImpossible");
  }
}

/** Display name of a spec: built-ins localized, custom names as typed. */
export function specDisplayName(specName: string): string {
  const difficulty = difficultyFromSpecName(specName);
  return difficulty ? difficultyDisplayName(difficulty) : specName;
}

/**
 * Built-ins are stored by their identifier, so a custom spec reusing one (or
 * its localized label) would silently replace that built-in.
 */
export function isReservedSpecName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return BUILT_IN_DIFFICULTIES.some(
    (d) => d === normalized || difficultyDisplayName(d).toLowerCase() === normalized,
  );
}

export function getDefaultSteps(
  difficulty: ChallengeDifficulty,
): ChallengeStep[] {
  switch (difficulty) {
    case ChallengeDifficulty.None:
      return [];
    case ChallengeDifficulty.Easy:
      return [{ type: "typingShort" }];
    case ChallengeDifficulty.Medium:
      return [{ type: "typingLong" }];
    case ChallengeDifficulty.Hard:
      return [
        { type: "typingLong" },
        { type: "math", config: DEFAULT_MATH_CONFIG },
      ];
    case ChallengeDifficulty.Impossible:
      return [{ type: "notAllowed" }];
  }
}

// ── Challenge Context ───────────────────────────────────────────────

export type ChallengeContext =
  | {
      type: "overrideDailyLimit";
      requestedMinutes: number;
      totalAllowedMinutes: number;
    }
  | { type: "overrideSchedule"; requestedMinutes: number }
  | { type: "deleteTarget" }
  | { type: "deleteRule" }
  | { type: "removeFromBlocklist" }
  | { type: "rapidSessionStart"; count: number }
  | { type: "increaseAllowedMinutes" }
  | { type: "modifyScheduleLessRestrictive" }
  | { type: "modifyScheduleLessRestrictiveWhileActive" }
  /**
   * Fired when the user makes a guardrail easier. Always presented with
   * `stepsOverride`, so the resolver never looks it up — see GuardrailLoosening.
   */
  | { type: "loosenGuardrails" };

/**
 * Trigger key for `loosenGuardrails`. Deliberately missing from the difficulty
 * pickers: it isn't assignable. Its challenge is the difficulty being removed.
 */
export const LOOSEN_GUARDRAILS_TRIGGER_KEY = "loosenGuardrails";

export function getTriggerKey(context: ChallengeContext): string {
  switch (context.type) {
    case "overrideDailyLimit": {
      if (context.requestedMinutes <= 2) return "overrideDailyLimit.small";
      if (context.requestedMinutes < 10) return "overrideDailyLimit.medium";
      return "overrideDailyLimit.large";
    }
    case "overrideSchedule": {
      if (context.requestedMinutes <= 2) return "overrideSchedule.small";
      if (context.requestedMinutes < 10) return "overrideSchedule.medium";
      return "overrideSchedule.large";
    }
    case "deleteTarget":
      return "deleteTarget";
    case "deleteRule":
      return "deleteRule";
    case "removeFromBlocklist":
      return "removeFromBlocklist";
    case "rapidSessionStart": {
      if (context.count <= 1) return "rapidSessionStart.1";
      if (context.count <= 3) return "rapidSessionStart.2to3";
      return "rapidSessionStart.4plus";
    }
    case "increaseAllowedMinutes":
      return "increaseAllowedMinutes";
    case "modifyScheduleLessRestrictive":
      return "modifySchedule.whileInactive";
    case "modifyScheduleLessRestrictiveWhileActive":
      return "modifySchedule.whileActive";
    case "loosenGuardrails":
      return LOOSEN_GUARDRAILS_TRIGGER_KEY;
  }
}

/**
 * Difficulty a trigger gets when nothing else sets one: no per-rule override
 * and no global default. Keyed by trigger rather than context so the
 * guardrail-loosening check can look it up for a trigger picked in a sheet.
 */
export function getTriggerDefaultDifficulty(
  triggerKey: string,
): ChallengeDifficulty {
  switch (triggerKey) {
    case "overrideDailyLimit.small":
    case "overrideSchedule.small":
      return ChallengeDifficulty.Easy;
    case "overrideDailyLimit.medium":
    case "overrideSchedule.medium":
      return ChallengeDifficulty.Medium;
    case "overrideDailyLimit.large":
    case "overrideSchedule.large":
      return ChallengeDifficulty.Hard;
    // A single quick return isn't worth interrupting — no challenge means
    // the quick-return guard doesn't pause the user at all. Matches the
    // hardcoded defaults listed in TriggerDefaultDifficultySheet.
    case "rapidSessionStart.1":
      return ChallengeDifficulty.None;
    case "rapidSessionStart.2to3":
      return ChallengeDifficulty.Easy;
    case "rapidSessionStart.4plus":
      return ChallengeDifficulty.Medium;
    case "deleteTarget":
    case "removeFromBlocklist":
      return ChallengeDifficulty.Easy;
    case "deleteRule":
      return ChallengeDifficulty.Medium;
    case "increaseAllowedMinutes":
    case "modifySchedule.whileInactive":
      return ChallengeDifficulty.Easy;
    case "modifySchedule.whileActive":
      return ChallengeDifficulty.Medium;
    case LOOSEN_GUARDRAILS_TRIGGER_KEY:
      return ChallengeDifficulty.Hard;
    default:
      return ChallengeDifficulty.None;
  }
}

// ── Challenge Strength ──────────────────────────────────────────────

/**
 * Comparable strictness of a *resolved* challenge, used when several
 * restrictions block a session at once and only the strictest of them should
 * be enforced. Custom specs rank above Hard: the user assembled them by hand,
 * so we can't assume they're any easier than the built-in top tier.
 * Impossible ranks above everything — no challenge gets past it.
 */
export enum ChallengeStrength {
  None = 0,
  Easy = 1,
  Medium = 2,
  Hard = 3,
  Custom = 4,
  Impossible = 5,
}

/**
 * Strength of a stored difficulty spec. Specs named after a built-in
 * difficulty rank as that difficulty; anything else is a user-authored custom
 * spec and ranks above Hard. Impossible isn't decided by name — the resolver
 * ranks any refusal as Impossible from its steps.
 */
export function strengthOfSpecName(name: string): ChallengeStrength {
  switch (name.toLowerCase()) {
    case ChallengeDifficulty.None:
      return ChallengeStrength.None;
    case ChallengeDifficulty.Easy:
      return ChallengeStrength.Easy;
    case ChallengeDifficulty.Medium:
      return ChallengeStrength.Medium;
    case ChallengeDifficulty.Hard:
      return ChallengeStrength.Hard;
    default:
      return ChallengeStrength.Custom;
  }
}
