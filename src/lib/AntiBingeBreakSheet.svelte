<script lang="ts">
  import { onMount } from "svelte";
  import { SETTINGS_DEFAULTS } from "@/shared/settings/settingsDefaults";
  import { SettingsKey } from "@/shared/settings/settingsKey";
  import { t } from "./i18n";

  let { onBack }: { onBack: () => void } = $props();

  type Settings = Record<string, unknown>;
  const STORAGE_KEY = "local:reelockrSettings";

  let settings = $state<Settings>({});

  function get(key: string): unknown {
    const val = settings[key];
    return val !== undefined ? val : SETTINGS_DEFAULTS[key];
  }

  onMount(async () => {
    settings = (await storage.getItem<Settings>(STORAGE_KEY)) ?? {};
  });

  async function setNumber(key: string, value: number): Promise<void> {
    settings[key] = value;
    await storage.setItem(STORAGE_KEY, $state.snapshot(settings));
  }

  /**
   * Duration options for the two quick-return dropdowns. Mirrors iOS
   * RelockrQuickReturnDuration — the persisted value is raw seconds, so a
   * stored off-grid value still displays via closestDuration().
   */
  const QUICK_RETURN_DURATIONS = [
    { seconds: 30, label: () => t("protectionOnboarding_durationSeconds30") },
    { seconds: 60, label: () => t("protectionOnboarding_duration1Minute") },
    { seconds: 120, label: () => t("protectionOnboarding_duration2Minutes") },
    { seconds: 180, label: () => t("protectionOnboarding_duration3Minutes") },
    { seconds: 300, label: () => t("protectionOnboarding_duration5Minutes") },
    { seconds: 600, label: () => t("protectionOnboarding_duration10Minutes") },
  ];

  function closestDuration(seconds: number): number {
    return QUICK_RETURN_DURATIONS.reduce((best, o) =>
      Math.abs(o.seconds - seconds) < Math.abs(best.seconds - seconds)
        ? o
        : best,
    ).seconds;
  }
</script>

<div class="sheet">
  <div class="header">
    <button class="back-btn" onclick={onBack}>← {t("common_done")}</button>
    <h1>{t("protectionOnboarding_preventBingingLauncherLabel")}</h1>
  </div>

  <p class="description">{t("protectionOnboarding_quickReturnBody")}</p>

  <!-- Inline "If I start 2+ sessions in a row (with less than a [30s] gap),
       pause me for [1 minute]" sentence — wraps like prose. -->
  <div class="sentence-card">
    <span class="label">{t("protectionOnboarding_quickReturnLine1Prefix")}</span>
    <select
      class="duration-select"
      value={closestDuration(Number(get(SettingsKey.General.QuickReturnGapSeconds)))}
      onchange={(e) =>
        setNumber(
          SettingsKey.General.QuickReturnGapSeconds,
          Number((e.target as HTMLSelectElement).value),
        )}
    >
      {#each QUICK_RETURN_DURATIONS as option (option.seconds)}
        <option value={option.seconds}>{option.label()}</option>
      {/each}
    </select>
    <span class="label">{t("protectionOnboarding_quickReturnLine1Suffix")}</span>
    <span class="label">{t("protectionOnboarding_quickReturnLine2Prefix")}</span>
    <select
      class="duration-select"
      value={closestDuration(Number(get(SettingsKey.General.QuickReturnPauseSeconds)))}
      onchange={(e) =>
        setNumber(
          SettingsKey.General.QuickReturnPauseSeconds,
          Number((e.target as HTMLSelectElement).value),
        )}
    >
      {#each QUICK_RETURN_DURATIONS as option (option.seconds)}
        <option value={option.seconds}>{option.label()}</option>
      {/each}
    </select>
  </div>
</div>

<style>
  .sheet { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px; }
  .header { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 0 4px; }
  .back-btn { all: unset; font-size: 13px; font-weight: 600; color: var(--rl-accent-blue); cursor: pointer; }
  h1 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.25; color: rgba(255,255,255,0.95); }
  .description { margin: 0; font-size: 12px; color: rgba(255,255,255,0.45); line-height: 1.4; }

  .sentence-card { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; background: var(--rl-card-bg); border: 1px solid var(--rl-card-border); border-radius: 12px; }
  .label { font-size: 14px; color: rgba(255,255,255,0.85); }
  .duration-select { padding: 3px 6px; font-size: 13px; }
</style>
