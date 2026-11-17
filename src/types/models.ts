// Domain models for Reelockr — resolved types (no SQLite conventions).

export type RuleId = string;
export type RuleTargetId = string;
export type DailyRuleUsageId = string;
export type RuleSessionId = string;
export type RelockrScheduleId = string;
export type ScheduleRuleLinkId = string;

export enum RuleTargetType {
  Domain = "domain",
  UrlPattern = "url_pattern",
}

export enum SettingValueType {
  Bool = 0,
  String = 1,
  Json = 2,
}

export enum SettingScopeType {
  Global = 0,
  Session = 1,
  Rule = 2,
}

export interface RelockrRule {
  id: RuleId;
  name: string;
  allowedSeconds: number;
  targets: RuleTarget[];
  /** Epoch ms when the rule was first created. Optional for backwards
   * compatibility — rules persisted before this field was added will be
   * missing it, and callers should treat that as "old enough" to ignore
   * grace-period gating (e.g. the increase-allowed-minutes challenge).
   */
  createdAt?: number;
}

export interface RuleTarget {
  id: RuleTargetId;
  ruleId: RuleId;
  targetType: RuleTargetType;
  pattern: string;
  enabled: boolean;
}

export interface DailyRuleUsage {
  id: DailyRuleUsageId;
  ruleId: RuleId;
  /** Logical day string, e.g. "2025-06-15" (local timezone, with 3 AM day boundary) */
  canonicalDayUtc: string;
  usedSeconds: number;
}

export interface RuleSession {
  id: RuleSessionId;
  ruleId: RuleId;
  startTime: Date;
  endTime: Date | null;
  allowedSeconds: number;
  isActive: boolean;
  usedSeconds: number;
  /**
   * When usage was last counted against this session (its latest heartbeat).
   * Null until the first one, and for sessions stored before it was tracked.
   */
  lastActiveTime: Date | null;
  /**
   * Longest stretch, in seconds, the session sat open without being used.
   * Lets the quick-return guard tell a walk-away break from steady scrolling,
   * since a session's wall-clock span includes any time the user was away.
   */
  longestIdleSeconds: number;
}

/** Block-during (blacklist) vs allow-only-during (whitelist) mode for a schedule. */
export enum ScheduleMode {
  /** mode 0: block sessions while inside the window. */
  BlockDuring = 0,
  /** mode 1: allow sessions only while inside the window. */
  AllowOnlyDuring = 1,
}

/**
 * A time-of-day / weekday window that constrains when sessions may start.
 * Fields mirror the iOS `RelockrSchedule` struct exactly.
 */
export interface RelockrSchedule {
  id: RelockrScheduleId;
  name: string;
  /** 0–1439, minute of day the window opens. */
  startMinute: number;
  /** 0–1439, minute of day the window closes (may be < startMinute to wrap midnight). */
  endMinute: number;
  isEnabled: boolean;
  /** 0 = block during schedule, 1 = allow only during schedule. See {@link ScheduleMode}. */
  mode: number;
  /** Bitmask: bit 0 = Sunday … bit 6 = Saturday. */
  weekdayMask: number;
  shouldAutoApplyToNewRules: boolean;
  /** Epoch ms when the schedule was created (drives the challenge grace period). */
  createdAt: number;
}

/** Join-table row linking a schedule to a rule (mirrors iOS `ScheduleRuleLink`). */
export interface ScheduleRuleLink {
  id: ScheduleRuleLinkId;
  scheduleId: RelockrScheduleId;
  ruleId: RuleId;
}

/** A schedule together with the set of rule ids it applies to. */
export interface RelockrScheduleWithLinks {
  schedule: RelockrSchedule;
  linkedRuleIds: Set<string>;
}

export interface RelockrSettingValue {
  key: string;
  type: SettingValueType;
  boolValue: boolean;
  stringValue: string;
  jsonValue: unknown;
  scopeType: SettingScopeType;
  scopeId: string;
}

export type OnboardingMotivation =
  | "customizeWebsites"
  | "screentimeRules"
  | "stayFocused";

export type OnboardingSiteKey =
  | "youtube"
  | "x"
  | "instagram"
  | "reddit"
  | "tiktok"
  | "facebook"
  | "linkedin"
  | "pinterest";

/** A goal the user said yes to in the install onboarding's questions. */
export type OnboardingGoal = "aiContent" | "customizeSites" | "screenTime";

export type CoachMarkId = "limitsTab" | "moreSchedules";

export interface OnboardingState {
  motivations: OnboardingMotivation[];
  /** Absent for users who onboarded before the goal questions existed. */
  goals?: OnboardingGoal[];
  selectedSites: OnboardingSiteKey[];
  ruleOnboardingCompleted: boolean;
  dismissedCoachMarks: CoachMarkId[];
  /**
   * Epoch ms the install onboarding finished. Starts
   * GuardrailLoosening's grace period. Absent for users who finished before
   * this was recorded — they get no grace period.
   */
  completedAt?: number;
}
