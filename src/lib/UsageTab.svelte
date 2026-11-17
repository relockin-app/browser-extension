<script lang="ts">
  import { onMount } from "svelte";
  import type { RelockrRule, DailyRuleUsage } from "~/types/models";
  import type { ReelockrStorage } from "~/storage";
  import { todayLocal } from "~/shared/dayBoundary";
  import {
    formatHoursMinutes,
    formatMinutesSeconds,
    uiLocale,
  } from "~/shared/overlayUI/utils/intlFormat";
  import TabHeader from "./TabHeader.svelte";
  import { t } from "./i18n";

  let { store }: { store: ReelockrStorage } = $props();

  // ── Date state ───────────────────────────────────────────────────

  function shiftDay(isoDate: string, delta: number): string {
    const d = new Date(isoDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  function formatDayLabel(isoDate: string): string {
    const today = todayLocal();
    if (isoDate === today) return t("usage_today");
    if (isoDate === shiftDay(today, -1)) return t("usage_yesterday");
    // e.g. "Mon, Jun 15"
    const d = new Date(isoDate + "T00:00:00Z");
    return d.toLocaleDateString(uiLocale(), {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  let selectedDay = $state(todayLocal());
  let isToday = $derived(selectedDay === todayLocal());

  // ── Data ─────────────────────────────────────────────────────────

  interface UsageRow {
    rule: RelockrRule;
    usage: DailyRuleUsage | null;
  }

  let rows = $state<UsageRow[]>([]);
  let loading = $state(true);

  async function loadData() {
    loading = true;
    const [rules, dayUsage] = await Promise.all([
      store.getAllRules(),
      store.getUsageForDay(selectedDay),
    ]);

    const usageByRule = new Map(dayUsage.map((u) => [u.ruleId, u]));

    rows = rules.map((rule) => ({
      rule,
      usage: usageByRule.get(rule.id) ?? null,
    }));
    loading = false;
  }

  onMount(loadData);

  // Reload when day changes
  $effect(() => {
    // Access selectedDay to create the dependency
    selectedDay;
    loadData();
  });

  // ── Helpers ──────────────────────────────────────────────────────

  function formatTime(totalSeconds: number): string {
    if (totalSeconds < 60) return formatMinutesSeconds(0, Math.round(totalSeconds));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.round(totalSeconds % 60);
    if (h > 0) return formatHoursMinutes(h, m);
    return formatMinutesSeconds(m, s);
  }

  // Splits the localized "used of allowed" string so the allowed part and
  // connecting text keep the dimmed style.
  function usedOfAllowedParts(
    used: number,
    allowed: number,
  ): { text: string; dim: boolean }[] {
    const USED = "\u0001";
    const ALLOWED = "\u0002";
    return t("usage_usedOfAllowedFormat", [USED, ALLOWED])
      .split(/(\u0001|\u0002)/)
      .filter((part) => part !== "")
      .map((part) =>
        part === USED
          ? { text: formatTime(used), dim: false }
          : { text: part === ALLOWED ? formatTime(allowed) : part, dim: true },
      );
  }

  function pct(used: number, allowed: number): number {
    if (allowed <= 0) return 0;
    return Math.min((used / allowed) * 100, 100);
  }

  function barColor(used: number, allowed: number): string {
    const ratio = allowed > 0 ? used / allowed : 0;
    if (ratio >= 1) return "#ef5350";
    if (ratio >= 0.75) return "#ffa726";
    return "#66bb6a";
  }
</script>

<TabHeader title={t("usage_title")} subtitle={t("usage_subtitle")} />

<section class="usage-page">
  <!-- Day picker -->
  <div class="day-picker">
    <button
      class="day-btn"
      aria-label={t("usage_previousPeriod")}
      onclick={() => (selectedDay = shiftDay(selectedDay, -1))}
    >
      &#8249;
    </button>
    <span class="day-label">{formatDayLabel(selectedDay)}</span>
    <button
      class="day-btn"
      disabled={isToday}
      aria-label={t("usage_nextPeriod")}
      onclick={() => (selectedDay = shiftDay(selectedDay, 1))}
    >
      &#8250;
    </button>
  </div>

  {#if loading}
    <p class="status-text">{t("common_loading")}</p>
  {:else if rows.length === 0}
    <p class="status-text">{t("usage_noRulesEmptyState")}</p>
  {:else}
    <div class="usage-list">
      {#each rows as { rule, usage } (rule.id)}
        {@const used = usage?.usedSeconds ?? 0}
        {@const allowed = rule.allowedSeconds}
        <div class="usage-card">
          <div class="usage-header">
            <span class="usage-name">{rule.name}</span>
            <span class="usage-time">
              {#each usedOfAllowedParts(used, allowed) as part}{#if part.dim}<span
                    class="usage-limit">{part.text}</span
                  >{:else}{part.text}{/if}{/each}
            </span>
          </div>
          <div class="bar-track">
            <div
              class="bar-fill"
              style="width: {pct(used, allowed)}%; background: {barColor(used, allowed)};"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .usage-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
  }

  /* ── Day picker ──────────────────────────────────────────────── */

  .day-picker {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .day-btn {
    all: unset;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .day-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }

  .day-btn:disabled {
    opacity: 0.2;
    cursor: default;
  }

  .day-label {
    font-family: var(--rl-font-title);
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    min-width: 120px;
    text-align: center;
  }

  /* ── Usage list ──────────────────────────────────────────────── */

  .usage-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .usage-card {
    background: var(--rl-card-bg);
    border: 1px solid var(--rl-card-border);
    border-radius: 14px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .usage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .usage-name {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .usage-time {
    font-family: var(--rl-font-title);
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    font-variant-numeric: tabular-nums;
  }

  .usage-limit {
    font-weight: 400;
    color: var(--rl-subtitle);
  }

  /* ── Progress bar ────────────────────────────────────────────── */

  .bar-track {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
    min-width: 0;
  }

  /* ── Status ──────────────────────────────────────────────────── */

  .status-text {
    margin: 8px 0;
    text-align: center;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.3);
  }
</style>
