import type { BlockFlow } from "../restrictions";
import { showScheduleBlockedScreen } from "./scheduleBlockedScreen";
import { showDailyLimitElapsedScreen } from "./dailyLimitElapsedScreen";
import { showQuickReturnBlockedScreen } from "./quickReturnBlockedScreen";
import { showInitialScreen } from "./initialScreen";

/**
 * Fronts the block screen for the highest-priority active restriction (the
 * others are listed on it). Every override path funnels through the same
 * strictest-challenge gate, so which screen fronts the set is presentation
 * only — it never decides how hard the unlock is.
 *
 * Also the "back" target for the override flow: cancelling anywhere in it
 * returns here.
 */
export function showBlockedScreen(
  container: HTMLDivElement,
  flow: BlockFlow,
): void {
  if (flow.active.includes("schedule")) {
    showScheduleBlockedScreen(container, flow);
    return;
  }
  if (flow.active.includes("daily")) {
    showDailyLimitElapsedScreen(container, flow);
    return;
  }
  if (flow.active.includes("quickReturn")) {
    showQuickReturnBlockedScreen(container, flow);
    return;
  }
  showInitialScreen(container, flow.status, flow.onStartSession);
}
