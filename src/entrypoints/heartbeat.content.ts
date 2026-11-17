import { rlog } from "~/shared/rlog";
import {
  showSessionOverlay,
  removeSessionOverlay,
  isSessionOverlayVisible,
} from "@/shared/overlayUI/overlay";
import {
  syncSessionTimer,
  removeSessionTimer,
  resetTimerDismissed,
} from "~/shared/overlayUI/sessionTimer";
import {
  ensureSettingsLoaded,
  getSetting,
  watchSettings,
} from "@/shared/settings/relockrSettings";
import type {
  SessionCheckResponse,
  HeartbeatResponse,
  StartSessionResponse,
  ClearQuickReturnBlockResponse,
  RuleSessionStatus,
} from "~/types/messages";
import { SettingsKey } from "@/shared/settings/settingsKey";
import { isCustomizedSite, loadOverlayFontsOnce } from "@/shared/overlayUI/overlayFonts";

const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_DURATION_S = HEARTBEAT_INTERVAL_MS / 1_000;

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",

  async main() {
    rlog("Heartbeat content script loaded", window.location.href);

    await ensureSettingsLoaded();
    watchSettings(() => {});

    // ── Initial session check on page load ─────────────────────────
    performSessionCheck();

    if (isCustomizedSite()) loadOverlayFontsOnce();

    // ── Periodic heartbeat ─────────────────────────────────────────
    setInterval(() => {
      if (!document.hasFocus()) return;

      // If the overlay is showing, don't send heartbeats (don't count blocked time).
      // But still re-check session status periodically so the overlay can refresh.
      if (isSessionOverlayVisible()) {
        performSessionCheck();
        return;
      }

      browser.runtime
        .sendMessage({
          type: "reelockr.heartbeat" as const,
          url: window.location.href,
          durationSeconds: HEARTBEAT_DURATION_S,
        })
        .then((response: HeartbeatResponse) => {
          handleStatusUpdate(response.matchedRules);
        })
        .catch((err) => {
          rlog("Heartbeat send failed (likely benign):", String(err));
        });
    }, HEARTBEAT_INTERVAL_MS);

    // ── Re-check on return ─────────────────────────────────────────
    // A tab left open can be stale when the user comes back (a schedule
    // window ended overnight, the daily allowance reset), and the heartbeat
    // above skips unfocused tabs. Refresh right away rather than on the next
    // tick.
    window.addEventListener("focus", () => performSessionCheck());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") performSessionCheck();
    });

    // ── Session check (read-only, no usage increment) ──────────────

    function performSessionCheck(): void {
      browser.runtime
        .sendMessage({
          type: "reelockr.sessionCheck" as const,
          url: window.location.href,
        })
        .then((response: SessionCheckResponse) => {
          handleStatusUpdate(response.matchedRules);
        })
        .catch((err) => {
          console.warn("[RELOCKR] Session check failed:", String(err));
        });
    }

    // ── Evaluate matched rules and show/hide overlay ───────────────

    function handleStatusUpdate(matchedRules: RuleSessionStatus[]): void {
      if (matchedRules.length === 0) {
        removeSessionOverlay();
        syncSessionTimer(null, false);
        return;
      }

      loadOverlayFontsOnce();

      // Find the first rule that needs a session
      const needsSession = matchedRules.find((r) => !r.hasActiveSession);

      if (needsSession) {
        // Keeps an existing overlay as-is (no flicker) unless the restrictions
        // it shows have changed since it was built.
        showSessionOverlay(needsSession, startSession, clearQuickReturnBlock);
        syncSessionTimer(null, false);
      } else {
        removeSessionOverlay();
        // Show timer for the active session with least remaining time
        const activeRule = matchedRules.reduce((a, b) =>
          a.sessionRemainingSeconds < b.sessionRemainingSeconds ? a : b,
        );
        const timerEnabled =
          getSetting<boolean>(SettingsKey.General.SessionTimer) !== false;
        syncSessionTimer(activeRule, timerEnabled, stopSession);
      }
    }

    // ── Stop a session via background ──────────────────────────────

    function stopSession(ruleId: string): void {
      browser.runtime
        .sendMessage({
          type: "reelockr.stopSession" as const,
          ruleId,
        })
        .then(() => {
          removeSessionTimer();
          rlog(`Session stopped for rule ${ruleId}`);
          performSessionCheck();
        })
        .catch((err) => {
          console.warn("[RELOCKR] Stop session failed:", String(err));
        });
    }

    // ── Lift the quick-return pause via background ─────────────────

    function clearQuickReturnBlock(): Promise<void> {
      return browser.runtime
        .sendMessage({ type: "reelockr.clearQuickReturnBlock" as const })
        .then((response: ClearQuickReturnBlockResponse) => {
          rlog(`Quick-return block cleared: ${response.success}`);
        })
        .catch((err) => {
          console.warn("[RELOCKR] Clear quick-return block failed:", String(err));
        });
    }

    // ── Start a session via background ─────────────────────────────

    function startSession(
      ruleId: string,
      durationSeconds: number,
      override?: boolean,
      scheduleOverride?: boolean,
    ): void {
      browser.runtime
        .sendMessage({
          type: "reelockr.startSession" as const,
          ruleId,
          durationSeconds,
          override,
          scheduleOverride,
        })
        .then((response: StartSessionResponse) => {
          if (response.success) {
            removeSessionOverlay();
            resetTimerDismissed();
            rlog(`Session started for rule ${ruleId}`);
          } else {
            console.warn(`[RELOCKR] Failed to start session: ${response.error}`);
            // Something still blocks the start the overlay thought it had
            // cleared. Tear the overlay down before re-checking so the fresh
            // status rebuilds it — leaving it up would just swallow the
            // refusal and look like a dead button.
            removeSessionOverlay();
            performSessionCheck();
          }
        })
        .catch((err) => {
          console.warn("[RELOCKR] Start session failed:", String(err));
        });
    }
  },
});
