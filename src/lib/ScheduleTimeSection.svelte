<script lang="ts">
  import { t } from "./i18n";

  /** Shared by the schedule card and the schedules tutorial's setup step, which each own their draft. */
  let {
    start = $bindable(),
    end = $bindable(),
  }: {
    /** "HH:MM", as an `<input type="time">` reads and writes it. */
    start: string;
    end: string;
  } = $props();
</script>

<div class="section">
  <span class="section-title">{t("scheduleCard_timeRangeSection")}</span>
  <div class="time-row">
    <label class="time-field">
      <span>{t("scheduleCard_startLabel")}</span>
      <input type="time" bind:value={start} />
    </label>
    <label class="time-field">
      <span>{t("scheduleCard_endLabel")}</span>
      <input type="time" bind:value={end} />
    </label>
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

  .time-row {
    display: flex;
    gap: 12px;
  }
  .time-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .time-field span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }
  .time-field input {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.92);
    font-size: 14px;
    padding: 7px 9px;
    color-scheme: dark;
  }
  .time-field input:focus {
    outline: none;
    border-color: var(--rl-accent-blue);
  }
</style>
