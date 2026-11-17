import type {
  ChallengeDifficultySpec,
  ChallengeOverride,
  TriggerDefaultDifficulty,
} from "~/types/challengeModels";

/**
 * Storage interface for challenge configuration data.
 * Mirrors the pattern of ReelockrStorage for future Supabase parity.
 */
export interface ChallengeStorage {
  // ── Difficulty Specs ───────────────────────────────────────────────

  getAllSpecs(): Promise<ChallengeDifficultySpec[]>;
  getSpec(id: string): Promise<ChallengeDifficultySpec | null>;
  getSpecByName(name: string): Promise<ChallengeDifficultySpec | null>;
  /**
   * Inserts or updates a spec, matched by id, then by name. Returns the stored
   * spec, whose id is the existing row's when the name was already taken —
   * callers that link to the spec must use the returned id, not `spec`'s.
   */
  upsertSpec(spec: ChallengeDifficultySpec): Promise<ChallengeDifficultySpec>;
  deleteSpec(id: string): Promise<void>;

  // ── Per-Rule Overrides ─────────────────────────────────────────────

  getOverridesForRule(ruleId: string): Promise<ChallengeOverride[]>;
  upsertOverride(override: ChallengeOverride): Promise<ChallengeOverride>;
  deleteOverride(id: string): Promise<void>;
  deleteOverridesForRule(ruleId: string): Promise<void>;

  // ── Global Trigger Defaults ────────────────────────────────────────

  getAllTriggerDefaults(): Promise<TriggerDefaultDifficulty[]>;
  getTriggerDefault(
    trigger: string,
  ): Promise<TriggerDefaultDifficulty | null>;
  upsertTriggerDefault(
    td: TriggerDefaultDifficulty,
  ): Promise<TriggerDefaultDifficulty>;
  deleteTriggerDefault(id: string): Promise<void>;
}
