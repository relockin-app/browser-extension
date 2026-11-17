// DOM-based accountability email challenge — mirrors iOS AccountabilityEmailChallengeView.swift
// Currently the email sending is stubbed, matching iOS behavior.

import { t } from "~/lib/i18n";
import { RL_FONT_BODY, RL_FONT_TITLE } from "~/shared/overlayUI/designTokens";
import {
  styleButtonGradient,
  styleButtonOutline,
} from "~/shared/overlayUI/utils/buttonStyles";

export interface AccountabilityEmailChallengeOptions {
  goalText: string;
  onCompleted: () => void;
  onCancelled: () => void;
}

export function createAccountabilityEmailChallengeView(
  options: AccountabilityEmailChallengeOptions,
): HTMLDivElement {
  const { goalText, onCompleted, onCancelled } = options;

  const root = document.createElement("div");
  root.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    box-sizing: border-box;
  `;

  // Goal text
  const goalEl = document.createElement("div");
  goalEl.textContent = goalText;
  goalEl.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    color: rgba(255,255,255,0.5);
    text-align: center;
  `;
  root.appendChild(goalEl);

  // Warning card
  const card = document.createElement("div");
  card.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px;
    background: rgba(255,152,0,0.1);
    border: 1px solid rgba(255,152,0,0.3);
    border-radius: 12px;
  `;

  // Warning icon + title
  const titleRow = document.createElement("div");
  titleRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
  `;

  const icon = document.createElement("span");
  icon.textContent = "\u2709\uFE0F"; // envelope emoji
  icon.style.fontSize = "20px";
  titleRow.appendChild(icon);

  const titleEl = document.createElement("div");
  titleEl.textContent = t("challengeUi_accountabilityPartnerNotified");
  titleEl.style.cssText = `
    font-family: ${RL_FONT_TITLE};
    font-size: 16px;
    font-weight: 700;
    color: #ff9800;
  `;
  titleRow.appendChild(titleEl);
  card.appendChild(titleRow);

  // Body text
  const bodyEl = document.createElement("div");
  bodyEl.textContent = t("challengeUi_accountabilityEmailBody");
  bodyEl.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 13px;
    color: rgba(255,255,255,0.7);
    line-height: 1.5;
    text-align: center;
  `;
  card.appendChild(bodyEl);
  root.appendChild(card);

  // Button row
  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = `
    display: flex;
    gap: 10px;
    width: 100%;
  `;

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = t("common_cancel");
  styleButtonOutline(cancelBtn);
  cancelBtn.style.flex = "1";
  cancelBtn.style.boxSizing = "border-box";
  buttonRow.appendChild(cancelBtn);

  const continueBtn = document.createElement("button");
  continueBtn.textContent = t("challengeUi_sendNotificationAndContinue");
  styleButtonGradient(continueBtn);
  continueBtn.style.flex = "1";
  continueBtn.style.boxSizing = "border-box";
  buttonRow.appendChild(continueBtn);

  root.appendChild(buttonRow);

  cancelBtn.addEventListener("click", () => {
    onCancelled();
  });

  continueBtn.addEventListener("click", () => {
    // TODO: send accountability email before completing
    continueBtn.style.opacity = "0.5";
    continueBtn.style.pointerEvents = "none";
    onCompleted();
  });

  return root;
}
