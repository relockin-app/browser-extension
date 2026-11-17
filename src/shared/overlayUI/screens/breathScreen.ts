import { RuleSessionStatus } from "@/types/messages";
import { OnStartSession } from "../overlay";
import { clearContainer, makeText } from "../utils/domHelpers";
import { styleButtonGradient, styleButtonOutline } from "../utils/buttonStyles";
import { RL_ACCENT_BLUE, RL_FONT_TITLE } from "../designTokens";
import { makeHeading } from "../components/cardParts";
import { showInitialScreen } from "./initialScreen";
import { showTimePickerScreen } from "./timePickerScreen";
import { getSetting } from "@/shared/settings/relockrSettings";
import { SettingsKey } from "@/shared/settings/settingsKey";
import { t } from "~/lib/i18n";

export function showBreathScreen(
  container: HTMLDivElement,
  status: RuleSessionStatus,
  onStartSession: OnStartSession,
): void {
  const breathDuration = getSetting<number>(SettingsKey.General.BreathDuration);

  // If breath duration is 0, skip straight to the question
  if (breathDuration <= 0) {
    showBreathButtons(container, status, onStartSession);
    return;
  }

  clearContainer(container);

  container.appendChild(makeHeading(t("overlay_breathScreenHeading")));

  container.appendChild(
    makeText(t("overlay_breathScreenSubtitle"), {
      fontSize: "15px",
      fontStyle: "italic",
      color: "rgba(255,255,255,0.55)",
      textAlign: "center",
    }),
  );

  const countdownEl = makeText(String(breathDuration), {
    fontSize: "48px",
    fontWeight: "700",
    fontFamily: RL_FONT_TITLE,
    color: RL_ACCENT_BLUE,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    transition: "opacity 0.3s ease",
  });
  container.appendChild(countdownEl);

  const buttonsRow = document.createElement("div");
  Object.assign(buttonsRow.style, {
    display: "flex",
    gap: "10px",
    opacity: "0",
    transition: "opacity 0.4s ease",
    pointerEvents: "none",
  });
  container.appendChild(buttonsRow);

  const yesBtn = document.createElement("button");
  yesBtn.textContent = t("common_yes");
  styleButtonOutline(yesBtn);
  yesBtn.addEventListener("click", () => {
    showTimePickerScreen(container, status, onStartSession);
  });
  yesBtn.style.flex = "1 1 0";
  buttonsRow.appendChild(yesBtn);

  const noBtn = document.createElement("button");
  noBtn.textContent = t("common_no");
  styleButtonGradient(noBtn);
  noBtn.addEventListener("click", () => {
    showInitialScreen(container, status, onStartSession);
  });
  noBtn.style.flex = "1 1 0";
  buttonsRow.appendChild(noBtn);

  let remaining = breathDuration;
  const timer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      countdownEl.textContent = String(remaining);
    } else {
      clearInterval(timer);
      countdownEl.style.opacity = "0";
      setTimeout(() => countdownEl.remove(), 300);
      buttonsRow.style.opacity = "1";
      buttonsRow.style.pointerEvents = "auto";
    }
  }, 1000);
}

function showBreathButtons(
  container: HTMLDivElement,
  status: RuleSessionStatus,
  onStartSession: OnStartSession,
): void {
  clearContainer(container);

  container.appendChild(makeHeading(t("overlay_breathScreenHeading")));

  const buttonsRow = document.createElement("div");
  Object.assign(buttonsRow.style, { display: "flex", gap: "10px" });
  container.appendChild(buttonsRow);

  const yesBtn = document.createElement("button");
  yesBtn.textContent = t("common_yes");
  styleButtonGradient(yesBtn);
  yesBtn.addEventListener("click", () => {
    showTimePickerScreen(container, status, onStartSession);
  });
  yesBtn.style.flex = "1 1 0";
  buttonsRow.appendChild(yesBtn);

  const noBtn = document.createElement("button");
  noBtn.textContent = t("common_no");
  styleButtonOutline(noBtn);
  noBtn.addEventListener("click", () => {
    showInitialScreen(container, status, onStartSession);
  });
  noBtn.style.flex = "1 1 0";
  buttonsRow.appendChild(noBtn);
}
