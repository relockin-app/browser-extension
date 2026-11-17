import { clearContainer } from "../utils/domHelpers";
import {
  styleButtonCompact,
  styleButtonCompactSecondary,
} from "../utils/buttonStyles";
import { type BlockFlow, startSessionPastRestrictions } from "../restrictions";
import { showBlockedScreen } from "./blockedScreen";
import { RL_FONT_BODY } from "../designTokens";
import {
  makeCaption,
  makeDivider,
  makeHeading,
  styleQuietButton,
} from "../components/cardParts";
import { t } from "~/lib/i18n";

/**
 * Direct session picker shown after the user completes an override challenge.
 * Bypasses the breath/initial screens: the user has already paid the cost,
 * and the cap is the tier they chose. Starting from here clears every
 * restriction that was active, since the challenge they passed was the
 * strictest of them.
 */
export function showOverrideTimePickerScreen(
  container: HTMLDivElement,
  flow: BlockFlow,
  capMinutes: number,
): void {
  clearContainer(container);

  const start = (seconds: number) => {
    startSessionPastRestrictions(flow, seconds).catch((e) => {
      console.warn("[RELOCKR] Override session start failed:", String(e));
    });
  };

  container.appendChild(makeHeading(t("session_chooseLength")));

  container.appendChild(
    // Show the cap so the user knows their limit for this override.
    makeCaption(t("common_minutesShortFormat", String(capMinutes))),
  );

  // ── Preset buttons clamped to cap ──────────────────────────────
  const presetCandidates = [1, 3, 5, 10, 15, 30, 45, 60];
  const presets = presetCandidates.filter((m) => m <= capMinutes);
  // Always include the cap itself so the user can pick the max in one tap.
  if (!presets.includes(capMinutes)) presets.push(capMinutes);

  const buttonsRow = document.createElement("div");
  Object.assign(buttonsRow.style, {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  });
  container.appendChild(buttonsRow);

  for (const minutes of presets) {
    const seconds = minutes * 60;
    const btn = document.createElement("button");
    btn.textContent = t("common_minutesShortFormat", String(minutes));
    styleButtonCompact(btn);
    btn.addEventListener("click", () => {
      start(seconds);
    });
    buttonsRow.appendChild(btn);
  }

  // "Other Time" button (secondary / dark)
  const otherBtn = document.createElement("button");
  otherBtn.textContent = t("session_other");
  styleButtonCompactSecondary(otherBtn);
  buttonsRow.appendChild(otherBtn);

  // ── Custom duration input (hidden until "Other" clicked) ───────
  const customRow = document.createElement("div");
  Object.assign(customRow.style, {
    display: "none",
    gap: "8px",
    alignItems: "center",
  });
  container.appendChild(customRow);

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = String(capMinutes);
  input.placeholder = t("rule_minutesPlaceholder");
  Object.assign(input.style, {
    width: "80px",
    padding: "6px 10px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.1)",
    color: "#fff",
    fontSize: "14px",
    fontFamily: RL_FONT_BODY,
    outline: "none",
  });
  customRow.appendChild(input);

  const goBtn = document.createElement("button");
  goBtn.textContent = t("common_start");
  styleButtonCompact(goBtn);
  goBtn.addEventListener("click", () => {
    const mins = parseInt(input.value, 10);
    if (!mins || mins < 1) return;
    const clamped = Math.min(mins, capMinutes);
    start(clamped * 60);
  });
  customRow.appendChild(goBtn);

  otherBtn.addEventListener("click", () => {
    customRow.style.display = "flex";
    input.focus();
  });

  // ── Cancel button ─────────────────────────────────────────────────
  // Bouncing back to the block screen drops the override unlock, matching the
  // iOS pattern: each successful challenge is a single-shot.
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = t("common_cancel");
  styleQuietButton(cancelBtn);
  cancelBtn.addEventListener("click", () => {
    showBlockedScreen(container, flow);
  });
  container.appendChild(makeDivider());
  container.appendChild(cancelBtn);
}
