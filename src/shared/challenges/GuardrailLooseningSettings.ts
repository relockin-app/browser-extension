// Whether making a guardrail easier requires a challenge — mirrors iOS
// GuardrailLooseningSettings.swift. On by default. See GuardrailLoosening.
//
// Kept under its own key rather than in `local:reelockrSettings`: the Settings
// tab writes that whole object back from a copy it loaded on mount, which
// would clobber a change made from the difficulty sheets in between.

const IS_CHALLENGE_REQUIRED_KEY =
  "local:relockrGuardrailLooseningRequiresChallenge";

export async function isLooseningChallengeRequired(): Promise<boolean> {
  return (await storage.getItem<boolean>(IS_CHALLENGE_REQUIRED_KEY)) ?? true;
}

/**
 * Turning the requirement off is itself loosening; callers gate it behind
 * `presentStopRequiringChallenge`.
 */
export async function setLooseningChallengeRequired(
  isRequired: boolean,
): Promise<void> {
  await storage.setItem(IS_CHALLENGE_REQUIRED_KEY, isRequired);
}

export function watchLooseningChallengeRequired(
  onChange: (isRequired: boolean) => void,
): () => void {
  return storage.watch<boolean>(IS_CHALLENGE_REQUIRED_KEY, (value) => {
    onChange(value ?? true);
  });
}
