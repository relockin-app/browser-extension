// DOM-based countdown — mirrors iOS WaitTimerChallengeView.swift
// Works in both popup and content script (page overlay) contexts.
//
// The confirm button stays hidden until the countdown ends. Used both for the
// wait-timer challenge step and as the "I can't do this" alternative to a
// guardrail-loosening challenge.

import { t } from "~/lib/i18n";
import { RL_FONT_BODY, RL_FONT_TITLE } from "~/shared/overlayUI/designTokens";
import {
  styleButtonGradient,
  styleButtonOutline,
} from "~/shared/overlayUI/utils/buttonStyles";

export interface WaitTimerChallengeOptions {
  seconds: number;
  goalText: string;
  titleText: string;
  onCompleted: () => void;
  /** Leaves the countdown: back to the step the user left, or cancel. */
  onBack: () => void;
  /** Defaults to "Back". */
  backText?: string;
}

export function createWaitTimerChallengeView(
  options: WaitTimerChallengeOptions,
): HTMLDivElement {
  const {
    seconds,
    goalText,
    titleText,
    onCompleted,
    onBack,
    backText = t("common_back"),
  } = options;

  const root = document.createElement("div");
  root.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    box-sizing: border-box;
  `;

  const goalEl = document.createElement("div");
  goalEl.textContent = goalText;
  goalEl.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    color: rgba(255,255,255,0.5);
    text-align: center;
  `;
  root.appendChild(goalEl);

  const titleEl = document.createElement("div");
  titleEl.textContent = titleText;
  titleEl.style.cssText = `
    font-family: ${RL_FONT_TITLE};
    font-size: 20px;
    font-weight: 700;
    color: rgba(255,255,255,0.95);
    text-align: center;
    line-height: 1.3;
  `;
  root.appendChild(titleEl);

  const hintEl = document.createElement("div");
  hintEl.textContent = t("challengeUi_waitTimerHint");
  hintEl.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 13px;
    color: rgba(255,255,255,0.5);
    text-align: center;
    line-height: 1.5;
  `;
  root.appendChild(hintEl);

  const countdownEl = document.createElement("div");
  countdownEl.style.cssText = `
    font-family: ${RL_FONT_TITLE};
    font-size: 40px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: rgba(255,255,255,0.95);
    text-align: center;
    line-height: 1.1;
    padding: 8px 0;
  `;
  root.appendChild(countdownEl);

  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = `
    display: flex;
    gap: 10px;
    width: 100%;
  `;

  const backBtn = document.createElement("button");
  backBtn.textContent = backText;
  styleButtonOutline(backBtn);
  backBtn.style.flex = "1";
  backBtn.style.boxSizing = "border-box";
  backBtn.addEventListener("click", () => {
    clearInterval(timer);
    onBack();
  });
  buttonRow.appendChild(backBtn);

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = t("challengeUi_confirm");
  styleButtonGradient(confirmBtn);
  confirmBtn.style.flex = "1";
  confirmBtn.style.boxSizing = "border-box";
  confirmBtn.style.display = "none";
  confirmBtn.addEventListener("click", () => {
    confirmBtn.style.pointerEvents = "none";
    onCompleted();
  });
  buttonRow.appendChild(confirmBtn);

  root.appendChild(buttonRow);

  // Counted against a deadline rather than by ticks, since timers in a
  // background tab get throttled.
  const deadline = Date.now() + Math.max(1, seconds) * 1000;

  // The view is built before it's mounted, so "still in the document" is
  // only a meaningful liveness test once it has been attached.
  let hasMounted = false;

  const tick = () => {
    if (root.isConnected) hasMounted = true;
    if (hasMounted && !root.isConnected) {
      clearInterval(timer);
      return;
    }
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    countdownEl.textContent = formatCountdown(remaining);
    if (remaining === 0) {
      clearInterval(timer);
      hintEl.textContent = t("challengeUi_waitTimerCompleted");
      confirmBtn.style.display = "inline-flex";
    }
  };
  const timer = setInterval(tick, 1000);
  tick();

  return root;
}

/** m:ss, matching the session timer's clock. */
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
