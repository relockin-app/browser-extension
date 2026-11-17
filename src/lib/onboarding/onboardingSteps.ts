import type { OnboardingGoal } from "~/types/models";

export type OnboardingStepId =
  | "welcome"
  | "phoneApp"
  | "phoneLimits"
  | "goalAi"
  | "goalCustomize"
  | "goalLimits"
  | "ack"
  | "aiContent"
  | "account"
  | "shorts"
  | "siteTweaks"
  | "limitsIntro"
  | "limitsSites"
  | "pin"
  | "phone"
  | "done"
  | "tour";

/**
 * "install" is the full first-run flow. "limits" is just the time limit
 * steps, for users who skipped them and start them later from the Limits tab.
 */
export type OnboardingFlowKind = "install" | "limits";

/** The yes/no question steps, in order, and the goal each one asks about. */
export const GOAL_QUESTIONS: { step: OnboardingStepId; goal: OnboardingGoal }[] = [
  { step: "goalAi", goal: "aiContent" },
  { step: "goalCustomize", goal: "customizeSites" },
  { step: "goalLimits", goal: "screenTime" },
];

/**
 * The steps for a flow and its answers so far. Questions come first so
 * everything after them can be shaped by the answers:
 * - The AI step always shows: covering AI videos is on by default, so every
 *   user should learn why covers appear on YouTube.
 * - Sign-in only follows a yes on AI, since voting is what an account adds.
 * - Shorts only shows for a yes on less addictive sites; the other site
 *   customizations always show, before pinning, so users know what the
 *   toolbar icon is for by the time they're asked to pin it.
 * - Time limits are introduced after a yes on scrolling less, but only set
 *   up once the user opts in on that introduction (`limitsOptIn`): plenty of
 *   people install RelockIn for the filters and never want limits.
 * - On a phone, the app is recommended straight after the welcome, since the
 *   extension there only has the app's free version: first what the app does,
 *   then what the extension can't do there. Pinning to a toolbar and
 *   getting the app on your phone are left out: there's no toolbar, and that
 *   step has already been.
 */
export function buildOnboardingSteps(
  flow: OnboardingFlowKind,
  goals: ReadonlySet<OnboardingGoal>,
  limitsOptIn: boolean,
  isPhone = false,
): OnboardingStepId[] {
  const limits: OnboardingStepId[] = limitsOptIn ? ["limitsIntro", "limitsSites"] : ["limitsIntro"];
  if (flow === "limits") return limits;
  const steps: OnboardingStepId[] = ["welcome"];
  if (isPhone) steps.push("phoneApp", "phoneLimits");
  steps.push(...GOAL_QUESTIONS.map((q) => q.step), "ack");
  steps.push("aiContent");
  if (goals.has("aiContent")) steps.push("account");
  if (goals.has("customizeSites")) steps.push("shorts");
  steps.push("siteTweaks");
  if (goals.has("screenTime")) steps.push(...limits);
  if (!isPhone) steps.push("pin", "phone");
  steps.push("done", "tour");
  return steps;
}
