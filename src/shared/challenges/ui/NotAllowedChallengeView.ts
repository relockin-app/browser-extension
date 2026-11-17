// DOM-based refusal — mirrors iOS NotAllowedView.swift
// Works in both popup and content script (page overlay) contexts.
//
// Shown when a challenge resolves to `notAllowed`, i.e. the user's guardrails
// set the action to Impossible. There is nothing to complete, so it never
// completes and the gated action never proceeds.
//
// Layout (top → bottom):
//   1. Muted stop icon
//   2. Title — "You can't X"
//   3. Body — why no challenge can unlock it
//   4. Guardrails hint — hidden until the user asks for it
//   5. Buttons — primary "Got it" + secondary "I really need to do this"
//
// Where to change guardrails sits behind a deliberate second click: the first
// click on the secondary button reveals the hint and turns the button into
// "Go to Guardrails", so the way out isn't the first thing the user reads.
// Where there's no way to navigate there (the page overlay), the hint alone
// says where to go and the button goes away.

import { t } from "~/lib/i18n";
import { RL_FONT_BODY, RL_FONT_TITLE } from "~/shared/overlayUI/designTokens";
import {
  styleButtonGradient,
  styleButtonOutline,
} from "~/shared/overlayUI/utils/buttonStyles";

export interface NotAllowedChallengeOptions {
  goalText: string;
  onCancelled: () => void;
  /** Shows the guardrail settings. Null where this context can't. */
  onGoToGuardrails: (() => void) | null;
}

export function createNotAllowedChallengeView(
  options: NotAllowedChallengeOptions,
): HTMLDivElement {
  const { goalText, onCancelled, onGoToGuardrails } = options;

  const root = document.createElement("div");
  root.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
  `;

  const icon = document.createElement("div");
  icon.textContent = "✋"; // raised hand
  icon.setAttribute("aria-hidden", "true");
  icon.style.cssText = `
    font-size: 44px;
    line-height: 1;
    margin-bottom: 8px;
    filter: grayscale(1);
    opacity: 0.5;
  `;
  root.appendChild(icon);

  const titleEl = document.createElement("div");
  titleEl.textContent = goalText;
  titleEl.style.cssText = `
    font-family: ${RL_FONT_TITLE};
    font-size: 20px;
    font-weight: 700;
    color: rgba(255,255,255,0.95);
    text-align: center;
    line-height: 1.3;
  `;
  root.appendChild(titleEl);

  const bodyEl = document.createElement("div");
  bodyEl.textContent = t("challengeUi_notAllowedBody");
  bodyEl.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    color: rgba(255,255,255,0.6);
    text-align: center;
    line-height: 1.5;
  `;
  root.appendChild(bodyEl);

  const hintEl = document.createElement("div");
  hintEl.textContent = t("challengeUi_notAllowedGuardrailsHint");
  hintEl.setAttribute("role", "status");
  hintEl.style.cssText = `
    display: none;
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    color: rgba(255,255,255,0.9);
    text-align: center;
    line-height: 1.5;
    opacity: 0;
    transition: opacity 0.25s ease;
  `;
  root.appendChild(hintEl);

  const buttonStack = document.createElement("div");
  buttonStack.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    margin-top: 20px;
  `;
  root.appendChild(buttonStack);

  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = t("common_gotIt");
  styleButtonGradient(dismissBtn);
  dismissBtn.style.boxSizing = "border-box";
  dismissBtn.addEventListener("click", () => onCancelled());
  buttonStack.appendChild(dismissBtn);

  const guardrailsBtn = document.createElement("button");
  guardrailsBtn.textContent = t("challengeUi_notAllowedReallyNeed");
  styleButtonOutline(guardrailsBtn);
  guardrailsBtn.style.boxSizing = "border-box";
  buttonStack.appendChild(guardrailsBtn);

  let isHintRevealed = false;

  guardrailsBtn.addEventListener("click", () => {
    if (!isHintRevealed) {
      revealHint();
      return;
    }
    guardrailsBtn.disabled = true;
    onCancelled();
    onGoToGuardrails?.();
  });

  function revealHint(): void {
    isHintRevealed = true;
    hintEl.style.display = "block";
    // Next frame, so the opacity change animates from the hidden state.
    requestAnimationFrame(() => {
      hintEl.style.opacity = "1";
    });

    if (!onGoToGuardrails) {
      guardrailsBtn.remove();
      return;
    }
    guardrailsBtn.textContent = t("challengeUi_notAllowedGoToGuardrails");
    // Disabled for the reveal so a double click can't skip straight past the
    // hint to the guardrail settings.
    guardrailsBtn.disabled = true;
    guardrailsBtn.style.opacity = "0.5";
    setTimeout(() => {
      guardrailsBtn.disabled = false;
      guardrailsBtn.style.opacity = "1";
    }, 250);
  }

  return root;
}
