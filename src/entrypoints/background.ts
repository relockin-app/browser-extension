import { createWxtStorage } from "~/storage/wxtStorage";
import { urlMatchesTarget } from "~/shared/urlMatcher";
import { rlog } from "~/shared/rlog";
import type {
  ContentToBackgroundMessage,
  HeartbeatMessage,
  SessionCheckMessage,
  StartSessionMessage,
  StopSessionMessage,
  RuleSessionStatus,
  SessionCheckResponse,
  HeartbeatResponse,
  StartSessionResponse,
  StopSessionResponse,
  ClearQuickReturnBlockResponse,
  OAuthSignInMessage,
} from "~/types/messages";
import {
  runAppleSignIn,
  runGoogleSignIn,
  signOutIfAccountConsentRemoved,
  type AuthResult,
} from "~/shared/relockrAuthHelper";
import type { RelockrRule } from "~/types/models";
import { t } from "~/lib/i18n";
import { todayLocal } from "~/shared/dayBoundary";
import { evaluate as evaluateSchedules } from "~/shared/schedules/RelockrScheduleConstraints";
import type { ScheduleConstraintResult } from "~/shared/schedules/RelockrScheduleConstraints";
import {
  computeQuickReturnBlock,
  clearQuickReturnBlock,
  isQuickReturnBlockActive,
} from "~/shared/quickReturn/quickReturnGuard";
import type { QuickReturnBlockState } from "~/shared/quickReturn/quickReturnGuard";
import { startYouTubeAiSync } from "~/shared/youtubeAiSync";
import { detectDevice } from "~/shared/pro/proAccess";

/**
 * Opens the popup's account screen in a new tab. Not the popup itself:
 * `action.openPopup()` can resolve without showing anything.
 */
async function openSignIn(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL("/popup.html#account") });
}

/**
 * WXT's dev server reloads every tab matching a content script whenever the
 * extension reloads, so every open YouTube video starts playing at once. In
 * dev, only the tab you're looking at is reloaded; refresh others yourself to
 * pick up content script changes.
 */
function limitDevTabReloads(): void {
  const reload = browser.tabs.reload.bind(browser.tabs) as (
    ...args: unknown[]
  ) => Promise<void>;
  const limited = async (...args: unknown[]): Promise<void> => {
    const tabId = typeof args[0] === "number" ? args[0] : undefined;
    const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabId !== undefined && tabId !== active?.id) {
      rlog("Dev: skipped WXT tab reload", tabId);
      return;
    }
    await reload(...args);
  };
  try {
    browser.tabs.reload = limited as typeof browser.tabs.reload;
  } catch (e) {
    console.warn("[RELOCKR] Dev: couldn't limit tab reloads", e);
  }
  if (browser.tabs.reload !== limited) {
    console.warn("[RELOCKR] Dev: couldn't limit tab reloads");
  }
}

export default defineBackground(() => {
  if (import.meta.env.DEV) limitDevTabReloads();

  const store = createWxtStorage();

  // Handlers read stored values, work out new ones and save them (usage + 5s,
  // end the active session). Two at once, such as heartbeats from two tabs or
  // a heartbeat and a stop, would each save over the other's result, so they
  // run one at a time.
  let handlerQueue: Promise<unknown> = Promise.resolve();
  function oneAtATime<T>(handler: () => Promise<T>): Promise<T> {
    const result = handlerQueue.then(handler, handler);
    handlerQueue = result.catch(() => {});
    return result;
  }

  rlog("Background started", { id: browser.runtime.id });

  startYouTubeAiSync();
  void detectDevice();

  if (import.meta.env.FIREFOX) {
    void signOutIfAccountConsentRemoved();
    browser.permissions.onRemoved.addListener(() => void signOutIfAccountConsentRemoved());
  }

  // Open the popup as a tab on first install so user sees onboarding
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      browser.tabs.create({
        url: browser.runtime.getURL("/popup.html"),
      });
    }
  });

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      const msg = message as ContentToBackgroundMessage | OAuthSignInMessage;

      if (msg.type === "reelockr.heartbeat") {
        oneAtATime(() => handleHeartbeat(msg))
          .then(sendResponse)
          .catch((err) => {
            console.error("[RELOCKR] heartbeat error:", err);
            sendResponse({
              type: "reelockr.heartbeatResponse",
              matchedRules: [],
            } satisfies HeartbeatResponse);
          });
        return true;
      }

      if (msg.type === "reelockr.sessionCheck") {
        oneAtATime(() => handleSessionCheck(msg))
          .then(sendResponse)
          .catch((err) => {
            console.error("[RELOCKR] sessionCheck error:", err);
            sendResponse({
              type: "reelockr.sessionCheckResponse",
              matchedRules: [],
            } satisfies SessionCheckResponse);
          });
        return true;
      }

      if (msg.type === "reelockr.startSession") {
        oneAtATime(() => handleStartSession(msg))
          .then(sendResponse)
          .catch((err) => {
            console.error("[RELOCKR] startSession error:", err);
            sendResponse({
              type: "reelockr.startSessionResponse",
              success: false,
              error: String(err),
            } satisfies StartSessionResponse);
          });
        return true;
      }

      if (msg.type === "reelockr.clearQuickReturnBlock") {
        oneAtATime(() => clearQuickReturnBlock())
          .then(() =>
            sendResponse({
              type: "reelockr.clearQuickReturnBlockResponse",
              success: true,
            } satisfies ClearQuickReturnBlockResponse),
          )
          .catch((err) => {
            console.error("[RELOCKR] clearQuickReturnBlock error:", err);
            sendResponse({
              type: "reelockr.clearQuickReturnBlockResponse",
              success: false,
            } satisfies ClearQuickReturnBlockResponse);
          });
        return true;
      }

      if (
        msg.type === "reelockr.signInWithGoogle" ||
        msg.type === "reelockr.signInWithApple"
      ) {
        // Only extension pages (popup, full-page tab) may start a sign-in, not
        // content scripts. Checked by URL: the full-page tab has `sender.tab` too.
        if (!sender.url?.startsWith(browser.runtime.getURL("/"))) {
          console.warn(`[RELOCKR] ${msg.type} rejected from`, sender.url);
          sendResponse({
            success: false,
            error: t("settings_accountSignInError"),
          } satisfies AuthResult);
          return;
        }
        const run =
          msg.type === "reelockr.signInWithGoogle"
            ? runGoogleSignIn
            : runAppleSignIn;
        run()
          .then(sendResponse)
          .catch((err) => {
            console.error(`[RELOCKR] ${msg.type} error:`, err);
            sendResponse({
              success: false,
              error: String(err),
            } satisfies AuthResult);
          });
        return true;
      }

      if (msg.type === "reelockr.openSignIn") {
        openSignIn()
          .then(() => sendResponse(true))
          .catch((err) => {
            console.error("[RELOCKR] openSignIn error:", err);
            sendResponse(false);
          });
        return true;
      }

      if (msg.type === "reelockr.closeTab") {
        const tabId = sender.tab?.id;
        if (tabId === undefined) return;
        browser.tabs.remove(tabId).catch((err) => {
          console.error("[RELOCKR] closeTab error:", err);
        });
        return;
      }

      if (msg.type === "reelockr.stopSession") {
        oneAtATime(() => handleStopSession(msg))
          .then(sendResponse)
          .catch((err) => {
            console.error("[RELOCKR] stopSession error:", err);
            sendResponse({
              type: "reelockr.stopSessionResponse",
              success: false,
              error: String(err),
            } satisfies StopSessionResponse);
          });
        return true;
      }
    },
  );

  // ── Build status snapshot for a single rule ─────────────────────

  async function buildRuleStatus(
    rule: RelockrRule,
    quickReturn: QuickReturnBlockState,
  ): Promise<RuleSessionStatus> {
    const today = todayLocal();
    const usage = await store.getUsage(rule.id, today);
    const dailyUsed = usage?.usedSeconds ?? 0;
    const dailyRemaining = Math.max(0, rule.allowedSeconds - dailyUsed);

    const schedule = await evaluateScheduleForRule(rule.id);
    const scheduleMaxContinuousSeconds =
      schedule.maxContinuousMinutes !== null
        ? schedule.maxContinuousMinutes * 60
        : null;

    const sessions = await store.getActiveSessions(rule.id);
    const activeSession = sessions[0] ?? null;
    const hasActive = activeSession !== null;
    const sessionRemaining = activeSession
      ? Math.max(0, activeSession.allowedSeconds - activeSession.usedSeconds)
      : 0;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      hasActiveSession: hasActive,
      sessionRemainingSeconds: sessionRemaining,
      dailyLimitSeconds: rule.allowedSeconds,
      dailyUsedSeconds: dailyUsed,
      dailyRemainingSeconds: dailyRemaining,
      scheduleBlocked: schedule.isBlocked,
      scheduleBlockReason: schedule.blockingInfo?.reason ?? "",
      scheduleMaxContinuousSeconds,
      quickReturnBlockedUntil: quickReturn.blockedUntil,
      quickReturnCount: quickReturn.count,
    };
  }

  /**
   * Ends any active session for `rule` whose allowance is used up. Runs before
   * the quick-return guard reads session history so a session that expires on
   * this very tick is already part of the back-to-back chain it counts.
   */
  async function expireFinishedSessions(rule: RelockrRule): Promise<void> {
    for (const session of await store.getActiveSessions(rule.id)) {
      if (session.usedSeconds < session.allowedSeconds) continue;
      await store.endSession(session.id, new Date(), session.usedSeconds);
      rlog(`Session ${session.id} expired for rule "${rule.name}"`);
    }
  }

  // ── Evaluate schedule constraints for a rule ────────────────────

  async function evaluateScheduleForRule(
    ruleId: string,
  ): Promise<ScheduleConstraintResult> {
    const schedules = await store.getSchedulesForRule(ruleId);
    return evaluateSchedules(new Date(), schedules);
  }

  // ── Handler: sessionCheck ───────────────────────────────────────

  async function handleSessionCheck(
    msg: SessionCheckMessage,
  ): Promise<SessionCheckResponse> {
    rlog(`Session check — url=${msg.url}`);
    const rules = await store.getAllRules();
    const matched = rules.filter((rule) =>
      rule.targets.some((t) => urlMatchesTarget(msg.url, t)),
    );
    for (const rule of matched) await expireFinishedSessions(rule);

    // Cross-rule, so computed once and shared by every matched rule.
    const quickReturn = await computeQuickReturnBlock(store);
    const statuses: RuleSessionStatus[] = [];
    for (const rule of matched) {
      statuses.push(await buildRuleStatus(rule, quickReturn));
    }

    return { type: "reelockr.sessionCheckResponse", matchedRules: statuses };
  }

  // ── Handler: heartbeat ──────────────────────────────────────────

  async function handleHeartbeat(
    hb: HeartbeatMessage,
  ): Promise<HeartbeatResponse> {
    rlog(`Heartbeat — url=${hb.url} duration=${hb.durationSeconds}s`);
    const rules = await store.getAllRules();
    const today = todayLocal();
    const matched: RelockrRule[] = [];

    for (const rule of rules) {
      if (!rule.targets.some((t) => urlMatchesTarget(hb.url, t))) continue;

      rlog(`Rule "${rule.name}" (${rule.id}) matched for ${hb.url}`);

      // ── Update daily usage ────────────────────────────────────
      const usage = await store.getUsage(rule.id, today);
      const newDailyUsed = (usage?.usedSeconds ?? 0) + hb.durationSeconds;
      await store.upsertUsage(rule.id, today, newDailyUsed);
      rlog(
        `  Usage updated — rule="${rule.name}" day=${today} usedSeconds=${newDailyUsed}`,
      );

      // ── Update active sessions & detect expiry ────────────────
      const sessions = await store.getActiveSessions(rule.id);
      for (const session of sessions) {
        const now = new Date();
        const updatedSeconds = session.usedSeconds + hb.durationSeconds;

        // A heartbeat covers the `durationSeconds` before it, so anything
        // beyond that since the last one is time the session sat unused.
        const lastActive = session.lastActiveTime ?? session.startTime;
        const idleSeconds = Math.max(
          0,
          (now.getTime() - lastActive.getTime()) / 1000 - hb.durationSeconds,
        );
        await store.recordSessionActivity(session.id, {
          usedSeconds: updatedSeconds,
          activeAt: now,
          longestIdleSeconds: Math.max(session.longestIdleSeconds, idleSeconds),
        });

        if (updatedSeconds >= session.allowedSeconds) {
          await store.endSession(session.id, now, updatedSeconds);
          rlog(
            `  Session ${session.id} expired — usedSeconds=${updatedSeconds}`,
          );
        } else {
          rlog(
            `  Session ${session.id} updated — usedSeconds=${updatedSeconds}`,
          );
        }
      }

      matched.push(rule);
    }

    // Built AFTER the usage/session updates above, so a session that expired
    // on this tick is already part of the chain the guard counts.
    const quickReturn = await computeQuickReturnBlock(store);
    const statuses: RuleSessionStatus[] = [];
    for (const rule of matched) {
      statuses.push(await buildRuleStatus(rule, quickReturn));
    }

    return { type: "reelockr.heartbeatResponse", matchedRules: statuses };
  }

  // ── Handler: startSession ───────────────────────────────────────

  async function handleStartSession(
    msg: StartSessionMessage,
  ): Promise<StartSessionResponse> {
    rlog(
      `Start session — ruleId=${msg.ruleId} duration=${msg.durationSeconds}s`,
    );

    const rule = await store.getRule(msg.ruleId);
    if (!rule) {
      return {
        type: "reelockr.startSessionResponse",
        success: false,
        error: `Rule ${msg.ruleId} not found`,
      };
    }

    // Check the quick-return guard. Unlike the schedule/daily overrides there
    // is no bypass flag: the content script clears the block outright once the
    // rapidSessionStart challenge is passed, so by the time the start request
    // lands the guard has already been lifted.
    const quickReturn = await computeQuickReturnBlock(store);
    if (isQuickReturnBlockActive(quickReturn)) {
      return {
        type: "reelockr.startSessionResponse",
        success: false,
        error: "Paused by the quick-return guard",
      };
    }

    // Check schedule constraints — bypassed when the caller has authorized a
    // schedule override (challenge-gated, capped client-side).
    const schedule = await evaluateScheduleForRule(rule.id);
    if (!msg.scheduleOverride && schedule.isBlocked) {
      return {
        type: "reelockr.startSessionResponse",
        success: false,
        error: schedule.blockingInfo?.reason ?? "Blocked by schedule",
      };
    }

    // Check daily remaining allowance — bypassed when the caller has
    // authorized an override (challenge-gated, capped client-side).
    const today = todayLocal();
    const usage = await store.getUsage(rule.id, today);
    const dailyUsed = usage?.usedSeconds ?? 0;
    const dailyRemaining = Math.max(0, rule.allowedSeconds - dailyUsed);

    if (!msg.override && dailyRemaining <= 0) {
      return {
        type: "reelockr.startSessionResponse",
        success: false,
        error: "No daily allowance remaining",
      };
    }

    // Clamp session duration to daily remaining (only when not overriding) and,
    // unless overriding the schedule, to the max continuous schedule window.
    let clampedDuration = msg.override
      ? msg.durationSeconds
      : Math.min(msg.durationSeconds, dailyRemaining);
    if (!msg.scheduleOverride && schedule.maxContinuousMinutes !== null) {
      clampedDuration = Math.min(
        clampedDuration,
        schedule.maxContinuousMinutes * 60,
      );
    }

    // End any existing active sessions for this rule
    const existingSessions = await store.getActiveSessions(rule.id);
    for (const s of existingSessions) {
      await store.endSession(s.id, new Date(), s.usedSeconds);
    }

    // Create new session
    await store.createSession({
      ruleId: rule.id,
      startTime: new Date(),
      endTime: null,
      allowedSeconds: clampedDuration,
      isActive: true,
      usedSeconds: 0,
      lastActiveTime: null,
      longestIdleSeconds: 0,
    });

    rlog(`Session created — rule="${rule.name}" duration=${clampedDuration}s`);

    return { type: "reelockr.startSessionResponse", success: true };
  }

  // ── Handler: stopSession ────────────────────────────────────────

  async function handleStopSession(
    msg: StopSessionMessage,
  ): Promise<StopSessionResponse> {
    rlog(`Stop session — ruleId=${msg.ruleId}`);

    const sessions = await store.getActiveSessions(msg.ruleId);
    for (const s of sessions) {
      await store.endSession(s.id, new Date(), s.usedSeconds);
    }

    return { type: "reelockr.stopSessionResponse", success: true };
  }
});
