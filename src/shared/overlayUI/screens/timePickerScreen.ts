import { RuleSessionStatus } from "@/types/messages";
import { clearContainer } from "../utils/domHelpers";
import {
  styleButtonCompact,
  styleButtonCompactSecondary,
} from "../utils/buttonStyles";
import { OnStartSession } from "../overlay";
import { showInitialScreen } from "./initialScreen";
import { RL_FONT_BODY } from "../designTokens";
import {
  makeCaption,
  makeDivider,
  makeHeading,
  styleQuietButton,
} from "../components/cardParts";
import { t } from "~/lib/i18n";

export function showTimePickerScreen(
  container: HTMLDivElement,
  status: RuleSessionStatus,
  onStartSession: OnStartSession,
): void {
  clearContainer(container);

  container.appendChild(makeHeading(t("session_chooseLength")));

  const remainMin = Math.floor(status.dailyRemainingSeconds / 60);
  const remainSec = status.dailyRemainingSeconds % 60;
  container.appendChild(
    makeCaption(t("overlay_remainingTodayFormat", [String(remainMin), String(remainSec)])),
  );

  // ── Preset buttons ─────────────────────────────────────────────
  const presets = [1, 3, 5, 10];
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
    const available =
      seconds <= status.dailyRemainingSeconds ||
      (minutes === 1 && status.dailyRemainingSeconds > 0);
    if (!available) continue;

    const btn = document.createElement("button");
    btn.textContent = t("common_minutesShortFormat", [String(minutes)]);
    styleButtonCompact(btn);
    btn.addEventListener("click", () => {
      const clamped = Math.min(seconds, status.dailyRemainingSeconds);
      onStartSession(status.ruleId, clamped);
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
  input.max = String(Math.floor(status.dailyRemainingSeconds / 60) || 1);
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
    const seconds = Math.min(mins * 60, status.dailyRemainingSeconds);
    onStartSession(status.ruleId, seconds);
  });
  customRow.appendChild(goBtn);

  otherBtn.addEventListener("click", () => {
    customRow.style.display = "flex";
    input.focus();
  });

  // ── Cancel button ─────────────────────────────────────────────────
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = t("common_cancel");
  styleQuietButton(cancelBtn);
  cancelBtn.addEventListener("click", () => {
    showInitialScreen(container, status, onStartSession);
  });
  container.appendChild(makeDivider());
  container.appendChild(cancelBtn);
}
