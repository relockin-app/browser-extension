// Promise-based challenge modal — mirrors iOS ChallengeSheet + ChallengeModalViewController.
// Renders challenge steps sequentially inside a full-screen overlay.
// Works in both popup and content script (page overlay) contexts.

import { t, tp } from "~/lib/i18n";
import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
import { ChallengeResolver } from "../ChallengeResolver";
import type { ChallengeContext, ChallengeStep } from "../ChallengeTypes";
import { shortSentence, longSentence, paragraph } from "../ChallengeContentProvider";
import { createTypingChallengeView } from "./TypingChallengeView";
import { createMathChallengeView } from "./MathChallengeView";
import { createAccountabilityEmailChallengeView } from "./AccountabilityEmailChallengeView";
import { createNotAllowedChallengeView } from "./NotAllowedChallengeView";
import { createWaitTimerChallengeView } from "./WaitTimerChallengeView";
import { getGuardrailsNavigator } from "../guardrailsNavigation";
import {
  RL_FONT_BODY,
  RL_FONT_TITLE,
  RL_ACCENT_BLUE,
} from "~/shared/overlayUI/designTokens";
import { styleButtonOutline } from "~/shared/overlayUI/utils/buttonStyles";
import { applyUiLanguage } from "~/shared/overlayUI/utils/domHelpers";

export interface ChallengeRequest {
  context: ChallengeContext;
  ruleId?: string;
  goalText?: string;
  /**
   * Fixed steps to present instead of resolving the context — for challenges
   * whose steps are computed by the caller, like loosening a guardrail.
   */
  stepsOverride?: ChallengeStep[];
  /**
   * If set, each step offers to swap the rest of the challenge for a wait
   * timer of this many seconds, for users who can't complete the steps.
   */
  waitInsteadSeconds?: number;
}

const MODAL_ID = "relockr-challenge-modal";

/** Whether a challenge is currently on screen (the user is mid-attempt). */
export function isChallengeModalOpen(): boolean {
  return document.getElementById(MODAL_ID) !== null;
}

/**
 * Present a challenge sequence. Resolves when all steps are completed.
 * Rejects if the user cancels (closes the modal).
 * If the difficulty resolves to zero steps, resolves immediately.
 */
export function presentChallenge(request: ChallengeRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    // An error anywhere in building the challenge rejects instead of leaving
    // the caller waiting forever.
    runChallenge(request, resolve, reject).catch(reject);
  });
}

async function runChallenge(
  request: ChallengeRequest,
  resolve: () => void,
  reject: (error: Error) => void,
): Promise<void> {
  // Don't stack modals
  if (document.getElementById(MODAL_ID)) {
    reject(new Error("Challenge modal already open"));
    return;
  }

  const steps =
    request.stepsOverride ??
    (await new ChallengeResolver(createWxtChallengeStorage()).resolve(
      request.context,
      request.ruleId,
    ));

  // No steps = no challenge needed (e.g. "None" difficulty)
  if (steps.length === 0) {
    resolve();
    return;
  }

  const goal = request.goalText;
  /** "Are you sure you want to X?" */
  const areYouSureText = goal
    ? t("challengeUi_areYouSureGoalFormat", goal)
    : t("challengeUi_defaultGoalText");

  /** A refusal gets "You can't X" instead, since there is nothing to be sure about. */
  const goalTextFor = (step: ChallengeStep): string => {
    if (step.type !== "notAllowed") return areYouSureText;
    return goal
      ? t("challengeUi_notAllowedTitleFormat", goal)
      : t("challengeUi_notAllowedDefaultTitle");
  };

  let currentStepIndex = 0;
  let settled = false;

  // ── Build modal overlay ─────────────────────────────────────────

  const overlay = document.createElement("div");
  overlay.id = MODAL_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 10, 15, 0.95);
    backdrop-filter: blur(8px);
    animation: rlChallengeModalFadeIn 0.2s ease;
  `;
  applyUiLanguage(overlay);

  // Inject keyframe animation
  const style = document.createElement("style");
  style.textContent = `
    @keyframes rlChallengeModalFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  overlay.appendChild(style);

  // Inner container (scrollable, constrained width)
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-width: 380px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    padding: 24px 20px;
    box-sizing: border-box;
  `;
  overlay.appendChild(container);

  // ── Header row: close button + step indicator ──────────────────

  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 8px;
  `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "\u2715"; // × symbol
  closeBtn.setAttribute("aria-label", t("common_close"));
  closeBtn.style.cssText = `
    all: unset;
    font-size: 18px;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: color 0.15s ease, background 0.15s ease;
  `;
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.color = "rgba(255,255,255,0.7)";
    closeBtn.style.background = "rgba(255,255,255,0.08)";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.color = "rgba(255,255,255,0.4)";
    closeBtn.style.background = "transparent";
  });
  closeBtn.addEventListener("click", () => {
    dismiss();
    if (!settled) {
      settled = true;
      reject(new Error("Challenge cancelled"));
    }
  });
  header.appendChild(closeBtn);

  const stepIndicator = document.createElement("div");
  stepIndicator.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 12px;
    color: rgba(255,255,255,0.35);
  `;
  header.appendChild(stepIndicator);

  container.appendChild(header);

  // ── Content area (swapped per step) ───────────────────────────

  const contentArea = document.createElement("div");
  contentArea.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  `;
  container.appendChild(contentArea);

  // ── "I can't do this" (wait instead) ──────────────────────────

  const waitInsteadSeconds = request.waitInsteadSeconds;

  const cantDoThisBtn = document.createElement("button");
  cantDoThisBtn.textContent = t("challengeUi_cantDoThisChallenge");
  cantDoThisBtn.style.cssText = `
    all: unset;
    display: none;
    margin-top: 12px;
    padding: 6px 10px;
    font-family: ${RL_FONT_BODY};
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
    border-radius: 6px;
    transition: color 0.15s ease;
  `;
  cantDoThisBtn.addEventListener("mouseenter", () => {
    cantDoThisBtn.style.color = "rgba(255,255,255,0.8)";
  });
  cantDoThisBtn.addEventListener("mouseleave", () => {
    cantDoThisBtn.style.color = "rgba(255,255,255,0.5)";
  });
  cantDoThisBtn.addEventListener("click", () => showWaitInstead());
  container.appendChild(cantDoThisBtn);

  /**
   * Swaps the current step for a wait timer, for users who can't complete
   * the challenge. Waiting it out confirms the whole request; Back returns
   * to the step they left, as they left it.
   */
  function showWaitInstead(): void {
    const stepView = contentArea.firstElementChild as HTMLElement | null;
    if (!stepView || waitInsteadSeconds === undefined) return;

    const stepViewDisplay = stepView.style.display;
    const stepIndicatorText = stepIndicator.textContent;
    stepView.style.display = "none";
    cantDoThisBtn.style.display = "none";
    // The wait stands in for every remaining step, so "1 / 2" no longer applies.
    stepIndicator.textContent = "";

    const waitView = createWaitTimerChallengeView({
      seconds: waitInsteadSeconds,
      goalText: areYouSureText,
      titleText: tp(
        "challengeUi_waitInsteadTitle",
        Math.max(1, Math.floor(waitInsteadSeconds / 60)),
      ),
      onCompleted: complete,
      onBack: () => {
        waitView.remove();
        stepView.style.display = stepViewDisplay;
        stepIndicator.textContent = stepIndicatorText;
        cantDoThisBtn.style.display = "";
      },
    });
    contentArea.appendChild(waitView);
  }

  // ── Render a step ─────────────────────────────────────────────

  function renderStep(index: number): void {
    contentArea.innerHTML = "";
    const step = steps[index];

    if (steps.length > 1) {
      stepIndicator.textContent = t("common_stepCounterFormat", [
        String(index + 1),
        String(steps.length),
      ]);
    } else {
      stepIndicator.textContent = "";
    }

    const onStepCompleted = () => {
      currentStepIndex++;
      if (currentStepIndex < steps.length) {
        renderStep(currentStepIndex);
      } else {
        complete();
      }
    };

    const onStepCancelled = () => {
      dismiss();
      if (!settled) {
        settled = true;
        reject(new Error("Challenge cancelled"));
      }
    };

    const view = makeStepView(step, goalTextFor(step), onStepCompleted, onStepCancelled);
    contentArea.appendChild(view);

    const offersWaitInstead =
      waitInsteadSeconds !== undefined && step.type !== "notAllowed";
    cantDoThisBtn.style.display = offersWaitInstead ? "" : "none";
  }

  /** All steps complete — dismiss and confirm. */
  function complete(): void {
    dismiss();
    if (!settled) {
      settled = true;
      resolve();
    }
  }

  // ── Dismiss helper ────────────────────────────────────────────

  function dismiss(): void {
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.15s ease";
    setTimeout(() => overlay.remove(), 150);
  }

  // ── Escape key closes modal ───────────────────────────────────

  function onKeyDown(e: KeyboardEvent): void {
    // Escape also cancels an IME conversion; that must not cancel the challenge.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      dismiss();
      if (!settled) {
        settled = true;
        reject(new Error("Challenge cancelled"));
      }
      document.removeEventListener("keydown", onKeyDown);
    }
  }
  document.addEventListener("keydown", onKeyDown);

  // Clean up when the modal is removed. If the page removed it (a re-render
  // that replaces the body, say), count that as cancelling, so the caller
  // isn't left waiting.
  const observer = new MutationObserver(() => {
    if (overlay.isConnected) return;
    document.removeEventListener("keydown", onKeyDown);
    observer.disconnect();
    if (!settled) {
      settled = true;
      reject(new Error("Challenge cancelled"));
    }
  });
  observer.observe(document.body, { childList: true });
  observer.observe(document.documentElement, { childList: true });

  // ── Mount and show first step ─────────────────────────────────

  document.body.appendChild(overlay);
  renderStep(0);
}

// ── View factory ���───────────────────────────────────────────────────

function makeStepView(
  step: ChallengeStep,
  goalText: string,
  onCompleted: () => void,
  onCancelled: () => void,
): HTMLDivElement {
  switch (step.type) {
    case "typingShort":
      return createTypingChallengeView({
        targetSentence: shortSentence(),
        goalText,
        onCompleted,
        onCancelled,
      });

    case "typingLong":
      return createTypingChallengeView({
        targetSentence: longSentence(),
        goalText,
        onCompleted,
        onCancelled,
      });

    case "typingParagraph": {
      const text = paragraph();
      return createTypingChallengeView({
        targetSentence: text,
        goalText,
        titleText: t("challengeUi_typeParagraphTitle"),
        sentenceLabelText: t("challengeUi_paragraphLabelFormat", text),
        inputMinHeight: 156,
        onCompleted,
        onCancelled,
      });
    }

    case "waitTimer":
      return createWaitTimerChallengeView({
        seconds: step.seconds,
        goalText,
        titleText: t("challengeUi_waitTimerTitle"),
        onCompleted,
        onBack: onCancelled,
        backText: t("common_cancel"),
      });

    case "math":
      return createMathChallengeView({
        config: step.config,
        goalText,
        onCompleted,
        onCancelled,
      });

    case "accountabilityEmail":
      return createAccountabilityEmailChallengeView({
        goalText,
        onCompleted,
        onCancelled,
      });

    case "notAllowed":
      return createNotAllowedChallengeView({
        goalText,
        onCancelled,
        onGoToGuardrails: getGuardrailsNavigator(),
      });
  }
}
