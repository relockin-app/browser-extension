<script lang="ts">
  import { t } from "./i18n";

  /** Shared by the schedule card and the schedules tutorial's setup step. */
  let { mask = $bindable() }: { mask: number } = $props();

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

  function toggleWeekday(bit: number) {
    if ((mask & (1 << bit)) !== 0) {
      mask &= ~(1 << bit);
    } else {
      mask |= 1 << bit;
    }
  }
</script>

<div class="section">
  <span class="section-title">{t("scheduleCard_activeDaysSection")}</span>
  <div class="weekday-row">
    {#each WEEKDAYS as day (day.bit)}
      <button
        class="weekday-btn"
        class:active={(mask & (1 << day.bit)) !== 0}
        aria-label={day.full}
        aria-pressed={(mask & (1 << day.bit)) !== 0}
        onclick={() => toggleWeekday(day.bit)}
      >{day.short}</button>
    {/each}
  </div>
</div>

<style>
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

  /*
   * The toggles must read as circles at any card width. Capping the row keeps
   * them from stretching into ovals in the wider full-page view, and sizing
   * each button by aspect-ratio off its own width — rather than a fixed
   * height — keeps them round when the row does have to shrink.
   */
  .weekday-row {
    display: flex;
    gap: 6px;
    max-width: 322px; /* 7 x 40px + 6 x 6px gap */
  }
  .weekday-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 0;
    min-width: 0;
    aspect-ratio: 1 / 1;
    box-sizing: border-box;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .weekday-btn.active {
    background: var(--rl-accent-blue);
    color: #fff;
  }
</style>
