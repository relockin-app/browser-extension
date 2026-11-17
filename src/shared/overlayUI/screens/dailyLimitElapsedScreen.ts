import { clearContainer } from "../utils/domHelpers";
import type { BlockFlow } from "../restrictions";
import { createOtherRestrictionsNote } from "../components/otherRestrictionsNote";
import { createOverrideButton } from "../components/overrideButton";
import { createUsageRing } from "../components/usageRing";
import {
  makeBody,
  makeCloseTabButton,
  makeDivider,
  makeHeading,
  makeRow,
  makeStatTile,
} from "../components/cardParts";
import { formatClockTime, formatHoursMinutes } from "../utils/intlFormat";
import { nextDayBoundary } from "~/shared/dayBoundary";
import { t } from "~/lib/i18n";

export function showDailyLimitElapsedScreen(
  container: HTMLDivElement,
  flow: BlockFlow,
): void {
  const { status } = flow;
  clearContainer(container);

  const headingRow = makeRow("16px");
  headingRow.appendChild(
    createUsageRing(1, 56, t("session_dailyLimitReached"), true),
  );
  headingRow.appendChild(makeHeading(t("session_dailyLimitReached")));
  container.appendChild(headingRow);

  const usedMinutes = Math.ceil(status.dailyUsedSeconds / 60);
  const stats = makeRow();
  stats.style.alignItems = "stretch";
  stats.appendChild(
    makeStatTile(
      formatHoursMinutes(Math.floor(usedMinutes / 60), usedMinutes % 60),
      t("overlay_usedTodayLabel"),
    ),
  );
  stats.appendChild(
    makeStatTile(
      formatClockTime(nextDayBoundary()),
      t("overlay_resetsAtLabel"),
    ),
  );
  container.appendChild(stats);

  container.appendChild(makeBody(t("session_dailyLimitMotivationalMessage")));

  const otherRestrictions = createOtherRestrictionsNote(flow, "daily");
  if (otherRestrictions) container.appendChild(otherRestrictions);

  container.appendChild(makeCloseTabButton("primary"));
  container.appendChild(makeDivider());
  container.appendChild(createOverrideButton(container, flow, t("session_nothingBetterToDo")));
}
