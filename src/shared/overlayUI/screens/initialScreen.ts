import { clearContainer, makeText } from "../utils/domHelpers";
import { RL_FONT_TITLE, RL_TEXT_MUTED } from "../designTokens";
import { RuleSessionStatus } from "@/types/messages";
import { OnStartSession } from "../overlay";
import { showBreathScreen } from "./breathScreen";
import { createUsageRing } from "../components/usageRing";
import {
  makeBody,
  makeCloseTabButton,
  makeDivider,
  makeHeading,
  makeRow,
  makeStat,
  stylePrimaryBlock,
} from "../components/cardParts";
import { formatMinutesSeconds, formatPercent } from "../utils/intlFormat";
import { t } from "~/lib/i18n";

export function showInitialScreen(
  container: HTMLDivElement,
  status: RuleSessionStatus,
  onStartSession: OnStartSession,
): void {
  clearContainer(container);

  container.appendChild(makeHeading(t("domShared_blockedOverlayHeading")));

  const domain = new URL(document.URL).hostname.replace("www.", "");
  const bodyText = domain
    ? t("overlay_initialScreenBodyFormat", [domain, status.ruleName])
    : t("overlay_initialScreenBodyNoDomainFormat", [status.ruleName]);
  container.appendChild(makeBody(bodyText));

  if (status.dailyLimitSeconds > 0) {
    container.appendChild(makeDivider());
    container.appendChild(makeUsageRow(status));
  }

  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "4px",
  });
  container.appendChild(actions);

  const startBtn = document.createElement("button");
  startBtn.textContent = t("session_startSession");
  stylePrimaryBlock(startBtn);
  startBtn.addEventListener("click", () => {
    showBreathScreen(container, status, onStartSession);
  });
  actions.appendChild(startBtn);
  actions.appendChild(makeCloseTabButton("secondary"));
}

/** Ring + time left today + percentage used. */
function makeUsageRow(status: RuleSessionStatus): HTMLDivElement {
  const fraction = status.dailyUsedSeconds / status.dailyLimitSeconds;
  const pct = formatPercent(Math.round(Math.min(1, fraction) * 100));

  const row = makeRow("14px");
  row.appendChild(
    createUsageRing(fraction, 48, `${pct} ${t("overlay_usagePieChartLabel")}`),
  );

  const remainMin = Math.floor(status.dailyRemainingSeconds / 60);
  const remainSec = status.dailyRemainingSeconds % 60;
  const stat = makeStat(
    formatMinutesSeconds(remainMin, remainSec),
    t("overlay_remainingTodayLabel"),
  );
  stat.style.flexGrow = "1";
  row.appendChild(stat);

  row.appendChild(
    makeText(pct, {
      fontFamily: RL_FONT_TITLE,
      fontSize: "13px",
      color: RL_TEXT_MUTED,
    }),
  );
  return row;
}
