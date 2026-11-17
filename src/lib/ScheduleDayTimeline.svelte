<script lang="ts">
  import { t } from "./i18n";
  import { uiLocale } from "~/shared/overlayUI/utils/intlFormat";

  /**
   * A compact 24-hour bar for "Allow only during" schedules, showing the part
   * of the day sites can be unlocked, so the mode is visible rather than only
   * explained. Windows that cross midnight wrap around the bar. Mirrors the
   * Android/iOS schedule card timeline.
   */
  let { startMinute, endMinute }: { startMinute: number; endMinute: number } = $props();

  /** Quarter-day ticks: the bar's ends already read as midnight, and labelling them would show the same time three times on a 12-hour clock. */
  const AXIS_HOURS = [6, 12, 18];

  /** The window as fractions of the day, split in two when it crosses midnight. */
  const segments = $derived.by((): [number, number][] => {
    const start = startMinute / 1440;
    const end = endMinute / 1440;
    if (startMinute === endMinute) return [];
    if (startMinute < endMinute) return [[start, end]];
    return [
      [0, end],
      [start, 1],
    ];
  });

  /** Hour only ("6 AM", or "06" on a 24-hour clock), following the UI language. */
  function formatHour(hour: number): string {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.toLocaleTimeString(uiLocale(), { hour: "numeric" });
  }
</script>

<!-- The description above already says this, so screen readers skip the picture. -->
<div class="timeline" aria-hidden="true">
  <div class="bar">
    {#each segments as [from, to]}
      <div class="window" style:left="{from * 100}%" style:width="{(to - from) * 100}%"></div>
    {/each}
  </div>
  <div class="axis">
    {#each AXIS_HOURS as hour}
      <div class="tick" style:left="{(hour / 24) * 100}%">
        <span class="tick-mark"></span>
        <span class="tick-label">{formatHour(hour)}</span>
      </div>
    {/each}
  </div>
  <div class="legend">
    <span class="legend-item"><span class="dot can"></span>{t("scheduleCard_timelineCanUnlock")}</span>
    <span class="legend-item"><span class="dot cant"></span>{t("scheduleCard_timelineCantUnlock")}</span>
  </div>
</div>

<style>
  .timeline {
    --timeline-cant-unlock: #4d4d4d;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
  }

  .bar {
    position: relative;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--timeline-cant-unlock);
  }
  .window {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--rl-accent-blue);
  }

  .axis {
    position: relative;
    height: 18px;
  }
  .tick {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }
  .tick-mark {
    width: 1px;
    height: 3px;
    background: var(--rl-subtitle);
    opacity: 0.6;
  }
  .tick-label {
    font-size: 11px;
    line-height: 1.1;
    color: var(--rl-subtitle);
    white-space: nowrap;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 2px;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--rl-subtitle);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .dot.can {
    background: var(--rl-accent-blue);
  }
  .dot.cant {
    background: var(--timeline-cant-unlock);
  }
</style>
