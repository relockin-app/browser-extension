// Storage entities for the challenge system — mirrors iOS ChallengeDifficultySpec,
// ChallengeOverride, and TriggerDefaultDifficulty.

import type { ChallengeStep } from "~/shared/challenges/ChallengeTypes";

export interface ChallengeDifficultySpec {
  id: string;
  name: string;
  steps: ChallengeStep[];
}

export interface ChallengeOverride {
  id: string;
  ruleId: string;
  trigger: string | null; // null = wildcard (applies to all triggers for this rule)
  specId: string;
}

export interface TriggerDefaultDifficulty {
  id: string;
  trigger: string;
  specId: string;
}
