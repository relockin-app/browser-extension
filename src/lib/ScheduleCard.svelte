<script lang="ts">
  import type { RelockrRule, RelockrSchedule } from "~/types/models";
  import { presentChallenge } from "~/shared/challenges/ui/ChallengeModal";
  import { isTimeInWindow, minuteOfDay, weekdayIndex } from "~/shared/schedules/RelockrScheduleConstraints";
  import { t } from "./i18n";
  import { formatList, uiLocale } from "~/shared/overlayUI/utils/intlFormat";
  import ScheduleTimeSection from "./ScheduleTimeSection.svelte";
  import ScheduleWeekdaySection from "./ScheduleWeekdaySection.svelte";
  import ScheduleDayTimeline from "./ScheduleDayTimeline.svelte";

  let {
    schedule,
    linkedRuleIds,
    allRules,
    isExpanded,
    onToggleExpanded,
    onUpdate,
    onSetLinkedRules,
    onDelete,
    showsEditButton = true,
  }: {
    schedule: RelockrSchedule;
    linkedRuleIds: string[];
    allRules: RelockrRule[];
    isExpanded: boolean;
    onToggleExpanded: () => void;
    onUpdate: (schedule: RelockrSchedule) => void;
    onSetLinkedRules: (ruleIds: string[]) => void;
    onDelete: () => void;
    /** Off where the card is only a picture of a schedule, like the tutorial's last screen. */
    showsEditButton?: boolean;
  } = $props();

  const GRACE_PERIOD_MS = 30 * 60 * 1000;

  // ── Weekday metadata (bit 0 = Sunday, matching the bitmask) ────────
  const WEEKDAYS_BY_BIT: { bit: number; short: string; full: string }[] = [
    { bit: 0, short: t("scheduleCard_sundayShort"), full: t("scheduleCard_sundayFull") },
    { bit: 1, short: t("scheduleCard_mondayShort"), full: t("scheduleCard_mondayFull") },
    { bit: 2, short: t("scheduleCard_tuesdayShort"), full: t("scheduleCard_tuesdayFull") },
    { bit: 3, short: t("scheduleCard_wednesdayShort"), full: t("scheduleCard_wednesdayFull") },
    { bit: 4, short: t("scheduleCard_thursdayShort"), full: t("scheduleCard_thursdayFull") },
    { bit: 5, short: t("scheduleCard_fridayShort"), full: t("scheduleCard_fridayFull") },
    { bit: 6, short: t("scheduleCard_saturdayShort"), full: t("scheduleCard_saturdayFull") },
  ];
  // Display order starts on the UI language's first day; the bits don't change.
  const firstWeekday = Number(t("locale_firstWeekday")) || 0;
  const WEEKDAYS = WEEKDAYS_BY_BIT.map((_, i) => WEEKDAYS_BY_BIT[(firstWeekday + i) % 7]!);

  // ── Draft state (committed only on Save) ──────────────────────────
  let draftName = $state(schedule.name);
  let isEditingName = $state(false);
  let draftStart = $state(minuteToTimeStr(schedule.startMinute));
  let draftEnd = $state(minuteToTimeStr(schedule.endMinute));
  let draftWeekdayMask = $state(schedule.weekdayMask);
  let draftMode = $state(schedule.mode);
  let draftAutoApply = $state(schedule.shouldAutoApplyToNewRules);
  let draftLinkedRuleIds = $state<string[]>([...linkedRuleIds]);
  let showDeleteConfirm = $state(false);

  // Re-sync the draft whenever the card (re)expands or the saved schedule changes.
  let lastSyncKey = $state("");
  $effect(() => {
    const key = `${isExpanded}|${schedule.id}`;
    if (isExpanded && key !== lastSyncKey) {
      syncDraft();
      lastSyncKey = key;
    }
    if (!isExpanded) lastSyncKey = "";
  });

  function syncDraft() {
    isEditingName = false;
    draftName = schedule.name;
    draftStart = minuteToTimeStr(schedule.startMinute);
    draftEnd = minuteToTimeStr(schedule.endMinute);
    draftWeekdayMask = schedule.weekdayMask;
    draftMode = schedule.mode;
    draftAutoApply = schedule.shouldAutoApplyToNewRules;
    draftLinkedRuleIds = [...linkedRuleIds];
    showDeleteConfirm = false;
  }

  // ── Time helpers ──────────────────────────────────────────────────
  function minuteToTimeStr(minute: number): string {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function timeStrToMinute(value: string): number {
    const [h, m] = value.split(":").map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  }
  function formatMinuteLabel(minute: number): string {
    const d = new Date();
    d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    return d.toLocaleTimeString(uiLocale(), { hour: "numeric", minute: "2-digit" });
  }

  // ── Derived ───────────────────────────────────────────────────────
  const draftStartMinute = $derived(timeStrToMinute(draftStart));
  const draftEndMinute = $derived(timeStrToMinute(draftEnd));

  const hasPendingChanges = $derived(
    draftName !== schedule.name ||
      draftStartMinute !== schedule.startMinute ||
      draftEndMinute !== schedule.endMinute ||
      draftWeekdayMask !== schedule.weekdayMask ||
      draftMode !== schedule.mode ||
      draftAutoApply !== schedule.shouldAutoApplyToNewRules ||
      !sameIds(draftLinkedRuleIds, linkedRuleIds),
  );

  const weekdaySummary = $derived(buildWeekdaySummary(schedule.weekdayMask));

  function sameIds(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const setB = new Set(b);
    return a.every((id) => setB.has(id));
  }

  function buildWeekdaySummary(mask: number): string {
    const active = WEEKDAYS.filter((d) => (mask & (1 << d.bit)) !== 0);
    if (active.length === 7) return t("scheduleCard_everyDaySummary");
    if (active.length === 0) return t("scheduleCard_noDaysSummary");
    const weekdayBits = [1, 2, 3, 4, 5];
    const weekendBits = [0, 6];
    const activeBits = active.map((d) => d.bit).sort();
    if (sameNums(activeBits, weekdayBits)) return t("scheduleCard_weekdaysSummary");
    if (sameNums(activeBits, weekendBits)) return t("scheduleCard_weekendsSummary");
    return formatList(active.map((d) => d.full));
  }
  function sameNums(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((v, i) => v === [...b].sort()[i]);
  }

  /** Splits `*emphasis*` markers out of a translated string; odd-indexed parts are emphasized. */
  function emphasisParts(text: string): string[] {
    return text.split("*");
  }

  // ── Floating commit bar ───────────────────────────────────────────
  // While there are unsaved changes and the inline Save row is scrolled below
  // the popup, it sticks to the bottom so it's obvious the changes still need
  // saving, and docks back into place as the user scrolls down to it. Sticky
  // positioning keeps it inside the card body, so it never covers the header.
  const COMMIT_BAR_BOTTOM_MARGIN = 12;
  let isCommitBarFloating = $state(false);

  /** Watches a marker just after the inline Save row; when that spot is below the viewport, the row is floating. */
  function trackCommitBarFloating(marker: HTMLElement) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const rootBottom = entry.rootBounds?.bottom ?? window.innerHeight;
        isCommitBarFloating = !entry.isIntersecting && entry.boundingClientRect.top >= rootBottom;
      },
      { rootMargin: `0px 0px -${COMMIT_BAR_BOTTOM_MARGIN}px 0px` },
    );
    observer.observe(marker);
    return {
      destroy() {
        observer.disconnect();
        isCommitBarFloating = false;
      },
    };
  }

  // ── Linked rules ──────────────────────────────────────────────────
  function toggleRuleLink(ruleId: string) {
    if (draftLinkedRuleIds.includes(ruleId)) {
      draftLinkedRuleIds = draftLinkedRuleIds.filter((id) => id !== ruleId);
    } else {
      draftLinkedRuleIds = [...draftLinkedRuleIds, ruleId];
    }
  }

  // ── Commit / cancel ───────────────────────────────────────────────
  function buildUpdatedSchedule(): RelockrSchedule {
    const name = draftName.trim() || t("scheduleCard_defaultScheduleName");
    return {
      ...schedule,
      name,
      startMinute: draftStartMinute,
      endMinute: draftEndMinute,
      weekdayMask: draftWeekdayMask,
      mode: draftMode,
      shouldAutoApplyToNewRules: draftAutoApply,
    };
  }

  async function commitChanges() {
    const doCommit = () => {
      onUpdate(buildUpdatedSchedule());
      if (!sameIds(draftLinkedRuleIds, linkedRuleIds)) {
        onSetLinkedRules([...draftLinkedRuleIds]);
      }
    };

    if (isDraftLessRestrictive()) {
      const ok = await runChallenge(t("challengeGoals_makeScheduleLessRestrictive"));
      if (!ok) return;
    }
    doCommit();
  }

  function cancelChanges() {
    syncDraft();
  }

  // ── Delete ────────────────────────────────────────────────────────
  async function confirmDelete() {
    const ok = await runChallenge(t("challengeGoals_deleteSchedule"));
    if (!ok) return;
    onDelete();
  }

  // ── Challenge plumbing ────────────────────────────────────────────
  function isWithinGracePeriod(): boolean {
    return Date.now() - schedule.createdAt < GRACE_PERIOD_MS;
  }

  /** Whether the schedule's *saved* window currently covers now. */
  function isScheduleCurrentlyActive(): boolean {
    if (!schedule.isEnabled) return false;
    const now = new Date();
    return isTimeInWindow(minuteOfDay(now), weekdayIndex(now), schedule);
  }

  async function runChallenge(goalText: string): Promise<boolean> {
    if (isWithinGracePeriod()) return true;
    const context = isScheduleCurrentlyActive()
      ? { type: "modifyScheduleLessRestrictiveWhileActive" as const }
      : { type: "modifyScheduleLessRestrictive" as const };
    try {
      await presentChallenge({ context, goalText });
      return true;
    } catch {
      return false;
    }
  }

  // ── Less-restrictive detection (mirrors iOS) ──────────────────────
  function weeklyCoverageMinutes(start: number, end: number, mask: number): number {
    if (start === end) return 0;
    const daily = start < end ? end - start : 1440 - start + end;
    let days = 0;
    for (let i = 0; i < 7; i++) if ((mask & (1 << i)) !== 0) days++;
    return daily * days;
  }

  function isDraftLessRestrictive(): boolean {
    // Unlinking rules from a blacklist schedule is less restrictive.
    if (schedule.mode === 0 || draftMode === 0) {
      const removed = linkedRuleIds.filter((id) => !draftLinkedRuleIds.includes(id));
      if (removed.length > 0) return true;
    }

    // Mode change: blacklist→whitelist is more restrictive; the reverse is less.
    if (schedule.mode !== draftMode) {
      return schedule.mode === 0;
    }

    const oldCoverage = weeklyCoverageMinutes(
      schedule.startMinute,
      schedule.endMinute,
      schedule.weekdayMask,
    );
    const newCoverage = weeklyCoverageMinutes(
      draftStartMinute,
      draftEndMinute,
      draftWeekdayMask,
    );

    if (schedule.mode === 0) {
      // Blacklist: less coverage = less restrictive.
      return newCoverage < oldCoverage;
    }
    // Whitelist: more coverage = less restrictive.
    return newCoverage > oldCoverage;
  }
</script>

<!-- Same layout as the rule card on mobile: when collapsed, the Edit pill straddles the card's bottom edge. -->
<div class="card-wrap" class:with-edit-pill={!isExpanded && showsEditButton}>
<div class="card" class:pending={hasPendingChanges && isExpanded}>
  <div
    class="card-header"
    role="button"
    tabindex="0"
    aria-expanded={isExpanded}
    onclick={onToggleExpanded}
    onkeydown={(e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggleExpanded();
      }
    }}
  >
    <span class="status-dot" class:on={schedule.isEnabled}></span>

    <div class="header-text">
      <div class="name-row">
        {#if isEditingName}
          <input
            class="name-input"
            bind:value={draftName}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") isEditingName = false;
            }}
            placeholder={t("scheduleCard_scheduleNamePlaceholder")}
          />
          <button
            class="text-btn"
            onclick={(e) => { e.stopPropagation(); isEditingName = false; }}
          >{t("common_done")}</button>
        {:else}
          <span class="schedule-name">{draftName}</span>
          {#if isExpanded}
            <button
              class="icon-btn"
              title={t("common_edit")}
              aria-label={t("common_edit")}
              onclick={(e) => { e.stopPropagation(); isEditingName = true; }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
          {/if}
        {/if}
      </div>
      <span class="subtitle">
        {t("scheduleCard_summaryFormat", [formatMinuteLabel(schedule.startMinute), formatMinuteLabel(schedule.endMinute), weekdaySummary])}
      </span>
    </div>

    {#if hasPendingChanges && isExpanded}
      <span class="unsaved">{t("scheduleCard_unsaved")}</span>
    {/if}

    <span class="chevron" class:open={isExpanded} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </span>
  </div>

  {#if isExpanded}
    <div class="card-body">
      <ScheduleTimeSection bind:start={draftStart} bind:end={draftEnd} />

      <div class="divider"></div>

      <ScheduleWeekdaySection bind:mask={draftWeekdayMask} />

      <div class="divider"></div>

      <!-- Mode -->
      <div class="section">
        <span class="section-title">{t("scheduleCard_modeSection")}</span>
        <!-- Styled like a segmented control (shared track, raised thumb) so it reads as one binary choice. -->
        <div class="segmented" role="radiogroup">
          {#each [{ mode: 0, label: t("scheduleCard_blockDuring") }, { mode: 1, label: t("scheduleCard_allowOnlyDuring") }] as option (option.mode)}
            <button
              role="radio"
              aria-checked={draftMode === option.mode}
              class:active={draftMode === option.mode}
              onclick={() => (draftMode = option.mode)}
            >
              {#if draftMode === option.mode}<span class="check" aria-hidden="true">✓</span>{/if}
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
        <p class="mode-desc">
          {#each emphasisParts(draftMode === 0
            ? t("scheduleCard_blockDuringModeDescription")
            : t("scheduleCard_allowOnlyDuringModeDescription")) as part, i}{#if i % 2 === 1}<em>{part}</em>{:else}{part}{/if}{/each}
        </p>
        <!-- "Block during" is covered by the schedules tutorial; "Allow only during" is discovered later, so it gets a visual. -->
        {#if draftMode === 1}
          <ScheduleDayTimeline startMinute={draftStartMinute} endMinute={draftEndMinute} />
        {/if}
      </div>

      <div class="divider"></div>

      <!-- Applies to rules -->
      <div class="section">
        <span class="section-title">{t("scheduleCard_appliesToRulesSection")}</span>
        {#if allRules.length === 0}
          <p class="empty-hint">{t("scheduleCard_noRulesCreated")}</p>
        {:else}
          <div class="rule-list">
            {#each allRules as rule (rule.id)}
              <label class="toggle-row">
                <span>{rule.name}</span>
                <input
                  type="checkbox"
                  checked={draftLinkedRuleIds.includes(rule.id)}
                  onchange={() => toggleRuleLink(rule.id)}
                />
              </label>
            {/each}
          </div>
        {/if}
        <label class="toggle-row">
          <span>{t("scheduleCard_autoApplyToNewRules")}</span>
          <input type="checkbox" bind:checked={draftAutoApply} />
        </label>
      </div>

      {#if hasPendingChanges}
        <div class="divider"></div>
        <div class="commit-bar" class:floating={isCommitBarFloating}>
          <button class="secondary-btn" onclick={cancelChanges}>{t("common_cancel")}</button>
          <button class="primary-btn" onclick={commitChanges}>{t("scheduleCard_saveChanges")}</button>
        </div>
        <div class="commit-bar-marker" use:trackCommitBarFloating></div>
      {/if}

      <div class="divider"></div>

      <!-- Delete -->
      <div class="section">
        {#if showDeleteConfirm}
          <div class="delete-confirm">
            <span>{t("scheduleCard_deleteScheduleConfirm")}</span>
            <div class="delete-actions">
              <button class="text-btn" onclick={() => (showDeleteConfirm = false)}>{t("common_cancel")}</button>
              <button class="text-btn danger" onclick={confirmDelete}>{t("common_delete")}</button>
            </div>
          </div>
        {:else}
          <button class="delete-btn" onclick={() => (showDeleteConfirm = true)}>
            {t("scheduleCard_deleteSchedule")}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#if !isExpanded && showsEditButton}
  <button class="edit-pill" onclick={onToggleExpanded}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
    {t("scheduleCard_editSchedule")}
  </button>
{/if}
</div>

<style>
  .card-wrap {
    position: relative;
  }
  .card-wrap.with-edit-pill {
    padding-bottom: 14px;
  }
  /* The Edit pill reaches up into a collapsed card; keep the summary clear of it. */
  .card-wrap.with-edit-pill .card-header {
    padding-bottom: 22px;
  }

  .edit-pill {
    all: unset;
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--rl-accent-blue);
    background: var(--rl-card-bg);
    border: 1px solid var(--rl-card-border);
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .edit-pill:hover {
    background: #34343a;
  }
  .edit-pill:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 2px;
  }
  .edit-pill svg {
    width: 12px;
    height: 12px;
  }

  .card {
    background: var(--rl-card-bg);
    border: 1px solid var(--rl-card-border);
    border-radius: 16px;
    /* clip rather than hidden, so the sticky Save row can still float. */
    overflow: clip;
    transition: border-color 0.15s ease;
  }
  .card.pending {
    border-color: var(--rl-accent-blue);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    cursor: pointer;
    box-sizing: border-box;
  }
  .card-header:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: -2px;
  }
  .card-header:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .status-dot {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
  }
  .status-dot.on {
    background: #4caf50;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .schedule-name {
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    line-height: 1.2;
  }
  .name-input {
    flex: 1;
    min-width: 0;
    max-width: 160px;
    background: rgba(115, 158, 235, 0.08);
    border: 1px solid var(--rl-accent-blue);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.95);
    font-size: 15px;
    font-weight: 600;
    padding: 2px 8px;
  }
  .name-input:focus {
    outline: none;
  }

  .subtitle {
    font-size: 12px;
    color: var(--rl-subtitle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .unsaved {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--rl-accent-blue);
  }

  .chevron {
    display: inline-flex;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.5);
    transition: transform 0.2s ease;
  }
  .chevron svg {
    width: 18px;
    height: 18px;
  }
  .chevron.open {
    transform: rotate(180deg);
  }

  .card-body {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-top: 1px solid var(--rl-divider);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--rl-subtitle);
  }

  .divider {
    height: 1px;
    background: var(--rl-divider);
  }

  .segmented {
    display: flex;
    background: #141414;
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }
  .segmented button {
    all: unset;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    padding: 8px 6px;
    font-size: 13px;
    color: var(--rl-subtitle);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }
  .segmented button:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: -2px;
  }
  .segmented button.active {
    background: #48484a;
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }
  .segmented .check {
    font-size: 12px;
    font-weight: 700;
    color: var(--rl-accent-blue);
  }  .mode-desc {
    margin: 0;
    font-size: 12px;
    color: var(--rl-subtitle);
    line-height: 1.4;
  }

  .rule-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
  }
  .toggle-row input {
    accent-color: var(--rl-accent-blue);
    width: 16px;
    height: 16px;
  }

  .empty-hint {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    font-style: italic;
  }

  .commit-bar {
    position: sticky;
    bottom: 12px;
    z-index: 1;
    display: flex;
    gap: 10px;
    /* The same box whether docked or floating, so it doesn't shift as it docks. */
    margin: -6px;
    padding: 6px;
    border: 1.5px solid transparent;
    border-radius: 14px;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .commit-bar.floating {
    background: var(--rl-card-bg);
    border-color: rgba(115, 158, 235, 0.6);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  }
  .commit-bar-marker {
    height: 0;
    margin-top: -16px; /* cancel the card body's gap so the marker sits right under the row */
  }
  .secondary-btn,
  .primary-btn {
    all: unset;
    flex: 1;
    text-align: center;
    padding: 10px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 10px;
    cursor: pointer;
    box-sizing: border-box;
  }
  .secondary-btn {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }
  .primary-btn {
    background: var(--rl-gradient);
    color: #1a1a1a;
  }

  .text-btn {
    all: unset;
    font-size: 13px;
    font-weight: 600;
    color: var(--rl-accent-blue);
    cursor: pointer;
    padding: 4px 6px;
  }
  .text-btn.danger {
    color: #ef5350;
  }

  .delete-confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }
  .delete-actions {
    display: flex;
    gap: 4px;
  }
  .delete-btn {
    all: unset;
    font-size: 13px;
    font-weight: 600;
    color: #ef5350;
    cursor: pointer;
    padding: 6px;
    text-align: center;
    border-radius: 6px;
    transition: background 0.15s ease;
  }
  .delete-btn:hover {
    background: rgba(239, 83, 80, 0.12);
  }

  .icon-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.5);
    flex-shrink: 0;
  }
  .icon-btn svg {
    width: 14px;
    height: 14px;
  }
  .icon-btn:hover {
    color: var(--rl-accent-blue);
    background: rgba(115, 158, 235, 0.15);
  }
</style>
