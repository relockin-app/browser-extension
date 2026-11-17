import { clearContainer, makeText } from "../utils/domHelpers";
import {
  RL_AMBER,
  RL_AMBER_BORDER,
  RL_AMBER_SOFT_BG,
} from "../designTokens";
import type { BlockFlow } from "../restrictions";
import { createOtherRestrictionsNote } from "../components/otherRestrictionsNote";
import { createOverrideButton } from "../components/overrideButton";
import {
  makeCloseTabButton,
  makeDivider,
  makeHeading,
} from "../components/cardParts";
import { t } from "~/lib/i18n";

/**
 * Blocking screen shown when a schedule linked to the matched rule currently
 * forbids starting a session. Mirrors the daily-limit-elapsed screen: a clear
 * headline + the specific reason, with a toned-down override entry point.
 */
export function showScheduleBlockedScreen(
  container: HTMLDivElement,
  flow: BlockFlow,
): void {
  const { status } = flow;
  clearContainer(container);

  container.appendChild(
    makeHeading(t("session_scheduleRestrictionHeadlineFormat", status.ruleName)),
  );

  // Specific reason, e.g. "Blocked by 'Bedtime' until 7:00 AM".
  if (status.scheduleBlockReason) {
    container.appendChild(
      makeText(status.scheduleBlockReason, {
        padding: "12px 16px",
        borderRadius: "14px",
        background: RL_AMBER_SOFT_BG,
        border: `1px solid ${RL_AMBER_BORDER}`,
        fontSize: "15px",
        fontWeight: "600",
        lineHeight: "1.4",
        color: RL_AMBER,
        textAlign: "start",
      }),
    );
  }

  const otherRestrictions = createOtherRestrictionsNote(flow, "schedule");
  if (otherRestrictions) container.appendChild(otherRestrictions);

  container.appendChild(makeCloseTabButton("primary"));
  container.appendChild(makeDivider());
  container.appendChild(createOverrideButton(container, flow, t("session_overrideScheduleRestriction")));
}
