import type {
  RelockrRule,
  RuleId,
  RuleTarget,
  RuleTargetId,
  DailyRuleUsage,
  RuleSession,
  RuleSessionId,
  RelockrSchedule,
  RelockrScheduleId,
  RelockrScheduleWithLinks,
} from "~/types/models";

/** Input type for creating a new rule (id and createdAt auto-generated). */
export type CreateRuleInput = Omit<RelockrRule, "id" | "targets" | "createdAt"> & {
  targets?: Omit<RuleTarget, "id" | "ruleId">[];
};

/** Input type for creating a new target on an existing rule. */
export type CreateTargetInput = Omit<RuleTarget, "id" | "ruleId">;

/** Input type for creating a new schedule (id and createdAt auto-generated). */
export type CreateScheduleInput = Omit<RelockrSchedule, "id" | "createdAt">;

/** A heartbeat's worth of use recorded against an active session. */
export type SessionActivity = {
  usedSeconds: number;
  activeAt: Date;
  longestIdleSeconds: number;
};

/**
 * Abstract storage interface for Reelockr data.
 *
 * Implement with WXT local storage for the default offline experience,
 * or with a Supabase client for cloud-sync opt-in.
 */
export interface ReelockrStorage {
  // ── Rules ──────────────────────────────────────────────────────────

  getAllRules(): Promise<RelockrRule[]>;
  getRule(id: RuleId): Promise<RelockrRule | null>;
  createRule(input: CreateRuleInput): Promise<RelockrRule>;
  updateRule(
    id: RuleId,
    updates: Partial<Pick<RelockrRule, "name" | "allowedSeconds">>,
  ): Promise<RelockrRule>;
  deleteRule(id: RuleId): Promise<void>;

  // ── Rule Targets ───────────────────────────────────────────────────

  addTarget(ruleId: RuleId, input: CreateTargetInput): Promise<RuleTarget>;
  updateTarget(
    id: RuleTargetId,
    updates: Partial<Pick<RuleTarget, "targetType" | "pattern" | "enabled">>,
  ): Promise<RuleTarget>;
  removeTarget(id: RuleTargetId): Promise<void>;

  // ── Daily Usage ────────────────────────────────────────────────────

  getUsage(
    ruleId: RuleId,
    canonicalDayUtc: string,
  ): Promise<DailyRuleUsage | null>;
  getUsageForDay(canonicalDayUtc: string): Promise<DailyRuleUsage[]>;
  upsertUsage(
    ruleId: RuleId,
    canonicalDayUtc: string,
    usedSeconds: number,
  ): Promise<DailyRuleUsage>;

  // ── Sessions ───────────────────────────────────────────────────────

  getActiveSessions(ruleId: RuleId): Promise<RuleSession[]>;
  /**
   * The most recently ended sessions across every rule, newest end time
   * first. Drives the quick-return guard, which is deliberately cross-rule.
   */
  getRecentCompletedSessions(limit: number): Promise<RuleSession[]>;
  createSession(session: Omit<RuleSession, "id">): Promise<RuleSession>;
  recordSessionActivity(
    id: RuleSessionId,
    activity: SessionActivity,
  ): Promise<RuleSession>;
  endSession(
    id: RuleSessionId,
    endTime: Date,
    usedSeconds: number,
  ): Promise<RuleSession>;

  // ── Schedules ──────────────────────────────────────────────────────

  getAllSchedules(): Promise<RelockrSchedule[]>;
  /** All schedules, each paired with the set of rule ids it applies to. */
  getSchedulesWithLinks(): Promise<RelockrScheduleWithLinks[]>;
  /** Enabled-or-not schedules currently linked to a given rule. */
  getSchedulesForRule(ruleId: RuleId): Promise<RelockrSchedule[]>;
  createSchedule(input: CreateScheduleInput): Promise<RelockrSchedule>;
  updateSchedule(schedule: RelockrSchedule): Promise<RelockrSchedule>;
  deleteSchedule(id: RelockrScheduleId): Promise<void>;
  /** Replace the full set of rules a schedule applies to. */
  setLinkedRules(
    scheduleId: RelockrScheduleId,
    ruleIds: Set<string>,
  ): Promise<void>;

  // ── Lifecycle ──────────────────────────────────────────────────────

  /** Subscribe to changes in the rule list. Returns an unsubscribe fn. */
  watchRules(callback: (rules: RelockrRule[]) => void): () => void;
  /** Subscribe to changes in the schedule list. Returns an unsubscribe fn. */
  watchSchedules(callback: (schedules: RelockrSchedule[]) => void): () => void;
  /** Subscribe to changes in schedule↔rule links. Returns an unsubscribe fn. */
  watchScheduleLinks(callback: () => void): () => void;
}
