import type {
  ReelockrStorage,
  CreateRuleInput,
  CreateTargetInput,
  CreateScheduleInput,
  SessionActivity,
} from "./interface";
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
  ScheduleRuleLink,
  RelockrScheduleWithLinks,
} from "~/types/models";
import { RuleTargetType } from "~/types/models";
import { withKeyLock } from "./keyLock";

// ── Storage keys ────────────────────────────────────────────────────

const RULES_KEY = "local:reelockrRules";
const USAGE_KEY = "local:reelockrDailyUsage";
const SESSIONS_KEY = "local:reelockrSessions";
const SCHEDULES_KEY = "local:relockrSchedules";
const SCHEDULE_LINKS_KEY = "local:relockrScheduleLinks";

// ── Serialisation helpers (Date ↔ string for JSON storage) ──────────

interface StoredRuleSession
  extends Omit<
    RuleSession,
    "startTime" | "endTime" | "lastActiveTime" | "longestIdleSeconds"
  > {
  startTime: string;
  endTime: string | null;
  // Optional: sessions stored before idle tracking don't have them.
  lastActiveTime?: string | null;
  longestIdleSeconds?: number;
}

function serialiseSession(s: RuleSession): StoredRuleSession {
  return {
    ...s,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime?.toISOString() ?? null,
    lastActiveTime: s.lastActiveTime?.toISOString() ?? null,
  };
}

function deserialiseSession(s: StoredRuleSession): RuleSession {
  return {
    ...s,
    startTime: new Date(s.startTime),
    endTime: s.endTime ? new Date(s.endTime) : null,
    lastActiveTime: s.lastActiveTime ? new Date(s.lastActiveTime) : null,
    longestIdleSeconds: s.longestIdleSeconds ?? 0,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

// ── History limits ──────────────────────────────────────────────────

/** Completed sessions kept. The quick-return guard reads the latest 20. */
const COMPLETED_SESSIONS_KEPT = 100;

/** Days of usage history kept for the Usage tab. */
const USAGE_DAYS_KEPT = 400;

/** The day `days` before `day`, both as YYYY-MM-DD. */
function daysBefore(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** Drops all but the newest COMPLETED_SESSIONS_KEPT completed sessions. */
function pruneCompletedSessions(sessions: StoredRuleSession[]): StoredRuleSession[] {
  const completed = sessions
    .filter((s) => !s.isActive)
    .sort((a, b) =>
      (b.endTime ?? b.startTime).localeCompare(a.endTime ?? a.startTime),
    );
  if (completed.length <= COMPLETED_SESSIONS_KEPT) return sessions;
  const dropped = new Set(completed.slice(COMPLETED_SESSIONS_KEPT).map((s) => s.id));
  return sessions.filter((s) => !dropped.has(s.id));
}

async function loadRules(): Promise<RelockrRule[]> {
  return (await storage.getItem<RelockrRule[]>(RULES_KEY)) ?? [];
}

async function saveRules(rules: RelockrRule[]): Promise<void> {
  await storage.setItem(RULES_KEY, rules);
}

async function loadUsage(): Promise<DailyRuleUsage[]> {
  return (await storage.getItem<DailyRuleUsage[]>(USAGE_KEY)) ?? [];
}

async function saveUsage(usage: DailyRuleUsage[]): Promise<void> {
  await storage.setItem(USAGE_KEY, usage);
}

async function loadSessions(): Promise<StoredRuleSession[]> {
  return (await storage.getItem<StoredRuleSession[]>(SESSIONS_KEY)) ?? [];
}

async function saveSessions(sessions: StoredRuleSession[]): Promise<void> {
  await storage.setItem(SESSIONS_KEY, sessions);
}

async function loadSchedules(): Promise<RelockrSchedule[]> {
  return (await storage.getItem<RelockrSchedule[]>(SCHEDULES_KEY)) ?? [];
}

async function saveSchedules(schedules: RelockrSchedule[]): Promise<void> {
  await storage.setItem(SCHEDULES_KEY, schedules);
}

async function loadScheduleLinks(): Promise<ScheduleRuleLink[]> {
  return (await storage.getItem<ScheduleRuleLink[]>(SCHEDULE_LINKS_KEY)) ?? [];
}

async function saveScheduleLinks(links: ScheduleRuleLink[]): Promise<void> {
  await storage.setItem(SCHEDULE_LINKS_KEY, links);
}

/** Link a freshly-created rule to every schedule flagged shouldAutoApplyToNewRules. */
async function linkSchedulesToNewRule(ruleId: RuleId): Promise<void> {
  const schedules = await loadSchedules();
  const autoApply = schedules.filter((s) => s.shouldAutoApplyToNewRules);
  if (autoApply.length === 0) return;
  await withKeyLock(SCHEDULE_LINKS_KEY, async () => {
    const links = await loadScheduleLinks();
    for (const sched of autoApply) {
      if (links.some((l) => l.scheduleId === sched.id && l.ruleId === ruleId)) {
        continue;
      }
      links.push({ id: uid(), scheduleId: sched.id, ruleId });
    }
    await saveScheduleLinks(links);
  });
}

// ── Implementation ──────────────────────────────────────────────────

export function createWxtStorage(): ReelockrStorage {
  return {
    // ── Rules ─────────────────────────────────────────────────────

    async getAllRules() {
      return loadRules();
    },

    async getRule(id: RuleId) {
      const rules = await loadRules();
      return rules.find((r) => r.id === id) ?? null;
    },

    async createRule(input: CreateRuleInput) {
      const ruleId = uid();
      const rule: RelockrRule = {
        id: ruleId,
        name: input.name,
        allowedSeconds: input.allowedSeconds,
        createdAt: Date.now(),
        targets: (input.targets ?? []).map((t) => ({
          id: uid(),
          ruleId,
          targetType: t.targetType ?? RuleTargetType.Domain,
          pattern: t.pattern ?? "",
          enabled: t.enabled ?? true,
        })),
      };
      await withKeyLock(RULES_KEY, async () => {
        const rules = await loadRules();
        rules.push(rule);
        await saveRules(rules);
      });
      // Auto-apply any "applies to new rules" schedules to this rule.
      await linkSchedulesToNewRule(ruleId);
      return rule;
    },

    async updateRule(id, updates) {
      return withKeyLock(RULES_KEY, async () => {
        const rules = await loadRules();
        const idx = rules.findIndex((r) => r.id === id);
        if (idx === -1) throw new Error(`Rule ${id} not found`);
        Object.assign(rules[idx], updates);
        await saveRules(rules);
        return rules[idx];
      });
    },

    async deleteRule(id) {
      await withKeyLock(RULES_KEY, async () => {
        const rules = await loadRules();
        await saveRules(rules.filter((r) => r.id !== id));
      });

      // Cascade: remove related usage & sessions
      await withKeyLock(USAGE_KEY, async () => {
        const usage = await loadUsage();
        await saveUsage(usage.filter((u) => u.ruleId !== id));
      });

      await withKeyLock(SESSIONS_KEY, async () => {
        const sessions = await loadSessions();
        await saveSessions(sessions.filter((s) => s.ruleId !== id));
      });

      await withKeyLock(SCHEDULE_LINKS_KEY, async () => {
        const links = await loadScheduleLinks();
        await saveScheduleLinks(links.filter((l) => l.ruleId !== id));
      });
    },

    // ── Rule Targets ──────────────────────────────────────────────

    async addTarget(ruleId: RuleId, input: CreateTargetInput) {
      return withKeyLock(RULES_KEY, async () => {
        const rules = await loadRules();
        const rule = rules.find((r) => r.id === ruleId);
        if (!rule) throw new Error(`Rule ${ruleId} not found`);
        const target: RuleTarget = {
          id: uid(),
          ruleId,
          ...input,
        };
        rule.targets.push(target);
        await saveRules(rules);
        return target;
      });
    },

    async updateTarget(id: RuleTargetId, updates) {
      return withKeyLock(RULES_KEY, async () => {
        const rules = await loadRules();
        for (const rule of rules) {
          const target = rule.targets.find((t) => t.id === id);
          if (target) {
            Object.assign(target, updates);
            await saveRules(rules);
            return target;
          }
        }
        throw new Error(`Target ${id} not found`);
      });
    },

    async removeTarget(id: RuleTargetId) {
      await withKeyLock(RULES_KEY, async () => {
        const rules = await loadRules();
        for (const rule of rules) {
          const idx = rule.targets.findIndex((t) => t.id === id);
          if (idx !== -1) {
            rule.targets.splice(idx, 1);
            await saveRules(rules);
            return;
          }
        }
      });
    },

    // ── Daily Usage ───────────────────────────────────────────────

    async getUsage(ruleId, canonicalDayUtc) {
      const usage = await loadUsage();
      return (
        usage.find(
          (u) => u.ruleId === ruleId && u.canonicalDayUtc === canonicalDayUtc,
        ) ?? null
      );
    },

    async getUsageForDay(canonicalDayUtc) {
      const usage = await loadUsage();
      return usage.filter((u) => u.canonicalDayUtc === canonicalDayUtc);
    },

    async upsertUsage(ruleId, canonicalDayUtc, usedSeconds) {
      return withKeyLock(USAGE_KEY, async () => {
        const usage = await loadUsage();
        const existing = usage.find(
          (u) => u.ruleId === ruleId && u.canonicalDayUtc === canonicalDayUtc,
        );
        if (existing) {
          existing.usedSeconds = usedSeconds;
          await saveUsage(usage);
          return existing;
        }
        const entry: DailyRuleUsage = {
          id: uid(),
          ruleId,
          canonicalDayUtc,
          usedSeconds,
        };
        // A new row starts each day, so old days are dropped here.
        const oldestKept = daysBefore(canonicalDayUtc, USAGE_DAYS_KEPT);
        const kept = usage.filter((u) => u.canonicalDayUtc >= oldestKept);
        kept.push(entry);
        await saveUsage(kept);
        return entry;
      });
    },

    // ── Sessions ──────────────────────────────────────────────────

    async getActiveSessions(ruleId) {
      const sessions = await loadSessions();
      return sessions
        .filter((s) => s.ruleId === ruleId && s.isActive)
        .map(deserialiseSession);
    },

    async getRecentCompletedSessions(limit: number) {
      const sessions = await loadSessions();
      return sessions
        .filter((s) => !s.isActive && s.endTime !== null)
        .map(deserialiseSession)
        .sort((a, b) => b.endTime!.getTime() - a.endTime!.getTime())
        .slice(0, limit);
    },

    async createSession(input) {
      const session: RuleSession = { id: uid(), ...input };
      await withKeyLock(SESSIONS_KEY, async () => {
        const sessions = await loadSessions();
        sessions.push(serialiseSession(session));
        await saveSessions(sessions);
      });
      return session;
    },

    async recordSessionActivity(id: RuleSessionId, activity: SessionActivity) {
      return withKeyLock(SESSIONS_KEY, async () => {
        const sessions = await loadSessions();
        const session = sessions.find((s) => s.id === id);
        if (!session) throw new Error(`Session ${id} not found`);
        session.usedSeconds = activity.usedSeconds;
        session.lastActiveTime = activity.activeAt.toISOString();
        session.longestIdleSeconds = activity.longestIdleSeconds;
        await saveSessions(sessions);
        return deserialiseSession(session);
      });
    },

    async endSession(id: RuleSessionId, endTime: Date, usedSeconds: number) {
      return withKeyLock(SESSIONS_KEY, async () => {
        const sessions = await loadSessions();
        const session = sessions.find((s) => s.id === id);
        if (!session) throw new Error(`Session ${id} not found`);
        session.endTime = endTime.toISOString();
        session.isActive = false;
        session.usedSeconds = usedSeconds;
        await saveSessions(pruneCompletedSessions(sessions));
        return deserialiseSession(session);
      });
    },

    // ── Schedules ─────────────────────────────────────────────────

    async getAllSchedules() {
      return loadSchedules();
    },

    async getSchedulesWithLinks() {
      const schedules = await loadSchedules();
      const links = await loadScheduleLinks();
      const bySchedule = new Map<string, Set<string>>();
      for (const link of links) {
        if (!bySchedule.has(link.scheduleId)) {
          bySchedule.set(link.scheduleId, new Set());
        }
        bySchedule.get(link.scheduleId)!.add(link.ruleId);
      }
      return schedules
        .slice()
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((schedule) => ({
          schedule,
          linkedRuleIds: bySchedule.get(schedule.id) ?? new Set<string>(),
        })) satisfies RelockrScheduleWithLinks[];
    },

    async getSchedulesForRule(ruleId) {
      const links = await loadScheduleLinks();
      const linkedIds = new Set(
        links.filter((l) => l.ruleId === ruleId).map((l) => l.scheduleId),
      );
      const schedules = await loadSchedules();
      return schedules.filter((s) => linkedIds.has(s.id));
    },

    async createSchedule(input: CreateScheduleInput) {
      const schedule: RelockrSchedule = {
        id: uid(),
        createdAt: Date.now(),
        ...input,
      };
      await withKeyLock(SCHEDULES_KEY, async () => {
        const schedules = await loadSchedules();
        schedules.push(schedule);
        await saveSchedules(schedules);
      });
      return schedule;
    },

    async updateSchedule(schedule: RelockrSchedule) {
      return withKeyLock(SCHEDULES_KEY, async () => {
        const schedules = await loadSchedules();
        const idx = schedules.findIndex((s) => s.id === schedule.id);
        if (idx === -1) throw new Error(`Schedule ${schedule.id} not found`);
        schedules[idx] = schedule;
        await saveSchedules(schedules);
        return schedule;
      });
    },

    async deleteSchedule(id: RelockrScheduleId) {
      await withKeyLock(SCHEDULES_KEY, async () => {
        const schedules = await loadSchedules();
        await saveSchedules(schedules.filter((s) => s.id !== id));
      });

      // Cascade: drop all links to this schedule.
      await withKeyLock(SCHEDULE_LINKS_KEY, async () => {
        const links = await loadScheduleLinks();
        await saveScheduleLinks(links.filter((l) => l.scheduleId !== id));
      });
    },

    async setLinkedRules(scheduleId, ruleIds) {
      await withKeyLock(SCHEDULE_LINKS_KEY, async () => {
        const links = (await loadScheduleLinks()).filter(
          (l) => l.scheduleId !== scheduleId,
        );
        for (const ruleId of ruleIds) {
          links.push({ id: uid(), scheduleId, ruleId });
        }
        await saveScheduleLinks(links);
      });
    },

    // ── Watch ─────────────────────────────────────────────────────

    watchRules(callback) {
      return storage.watch<RelockrRule[]>(RULES_KEY, (newValue) => {
        callback(newValue ?? []);
      });
    },

    watchSchedules(callback) {
      return storage.watch<RelockrSchedule[]>(SCHEDULES_KEY, (newValue) => {
        callback(newValue ?? []);
      });
    },

    watchScheduleLinks(callback) {
      return storage.watch<ScheduleRuleLink[]>(SCHEDULE_LINKS_KEY, () => {
        callback();
      });
    },
  };
}
