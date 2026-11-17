import type { RuleId } from "./models";

// ── Content → Background ──────────────────────────────────────────

export interface HeartbeatMessage {
  type: "reelockr.heartbeat";
  url: string;
  durationSeconds: number;
}

export interface SessionCheckMessage {
  type: "reelockr.sessionCheck";
  url: string;
}

export interface StartSessionMessage {
  type: "reelockr.startSession";
  ruleId: RuleId;
  durationSeconds: number;
  /** True when the user authorized a daily-limit override via challenge. */
  override?: boolean;
  /** True when the user authorized a schedule override via challenge. */
  scheduleOverride?: boolean;
}

/**
 * Records that the user completed the `rapidSessionStart` challenge, lifting
 * the quick-return pause for the current back-to-back chain.
 */
export interface ClearQuickReturnBlockMessage {
  type: "reelockr.clearQuickReturnBlock";
}

export interface StopSessionMessage {
  type: "reelockr.stopSession";
  ruleId: RuleId;
}

/** Asks for the account screen, e.g. after voting signed out. */
export interface OpenSignInMessage {
  type: "reelockr.openSignIn";
}

/** Closes the sending tab, from the block overlay's "Close this tab". */
export interface CloseTabMessage {
  type: "reelockr.closeTab";
}

export type ContentToBackgroundMessage =
  | HeartbeatMessage
  | SessionCheckMessage
  | StartSessionMessage
  | StopSessionMessage
  | ClearQuickReturnBlockMessage
  | OpenSignInMessage
  | CloseTabMessage;

// ── Popup → Background ────────────────────────────────────────────

/** Runs an OAuth sign-in flow; the response is an `AuthResult`. */
export interface OAuthSignInMessage {
  type: "reelockr.signInWithGoogle" | "reelockr.signInWithApple";
}

// ── Background → Content (responses) ──────────────────────────────

export interface RuleSessionStatus {
  ruleId: RuleId;
  ruleName: string;
  hasActiveSession: boolean;
  sessionRemainingSeconds: number;
  dailyLimitSeconds: number;
  dailyUsedSeconds: number;
  dailyRemainingSeconds: number;
  /** True when a linked schedule is currently blocking session start. */
  scheduleBlocked: boolean;
  /** Human-readable reason for the schedule block (empty when not blocked). */
  scheduleBlockReason: string;
  /**
   * Max continuous seconds a new session may run before a schedule would block
   * it. `null` means schedules impose no duration limit.
   */
  scheduleMaxContinuousSeconds: number | null;
  /**
   * Epoch ms at which the quick-return ("take a break") pause lifts, or null
   * when no pause is in effect. Cross-rule: the same value on every matched
   * rule.
   */
  quickReturnBlockedUntil: number | null;
  /** Back-to-back session count behind the pause (0 when not paused). */
  quickReturnCount: number;
}

export interface SessionCheckResponse {
  type: "reelockr.sessionCheckResponse";
  matchedRules: RuleSessionStatus[];
}

export interface HeartbeatResponse {
  type: "reelockr.heartbeatResponse";
  matchedRules: RuleSessionStatus[];
}

export interface StartSessionResponse {
  type: "reelockr.startSessionResponse";
  success: boolean;
  error?: string;
}

export interface StopSessionResponse {
  type: "reelockr.stopSessionResponse";
  success: boolean;
  error?: string;
}

export interface ClearQuickReturnBlockResponse {
  type: "reelockr.clearQuickReturnBlockResponse";
  success: boolean;
}
