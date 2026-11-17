<script lang="ts">
  import { onMount } from "svelte";
  import { SETTINGS_DEFAULTS } from "@/shared/settings/settingsDefaults";
  import { SettingsKey } from "@/shared/settings/settingsKey";
  import { t } from "./i18n";
  import AntiBingeBreakSheet from "./AntiBingeBreakSheet.svelte";
  import ChallengeSettingsSheet from "./ChallengeSettingsSheet.svelte";
  import TriggerDefaultDifficultySheet from "./TriggerDefaultDifficultySheet.svelte";
  import TabHeader from "./TabHeader.svelte";

  type SubView = "main" | "whenToChallengeMe" | "customizeChallenges" | "antiBinge";
  let subView = $state<SubView>("main");

  const guardrailRows: { view: SubView; title: string; subtitle: string }[] = [
    { view: "whenToChallengeMe", title: t("challenges_whenToChallengeMe"), subtitle: t("challenges_whenToChallengeMeSubtitle") },
    { view: "customizeChallenges", title: t("challenges_customizeChallenges"), subtitle: t("challenges_customizeChallengesSubtitle") },
    { view: "antiBinge", title: t("protectionOnboarding_preventBingingLauncherLabel"), subtitle: t("protectionOnboarding_preventBingingLauncherSubtitle") },
  ];

  type Settings = Record<string, unknown>;
  const STORAGE_KEY = "local:reelockrSettings";

  let settings = $state<Settings>({});

  function get(key: string): unknown {
    const val = settings[key];
    return val !== undefined ? val : SETTINGS_DEFAULTS[key];
  }

  onMount(async () => {
    const stored = await storage.getItem<Settings>(STORAGE_KEY);
    settings = stored ?? {};
  });

  async function persist(): Promise<void> {
    await storage.setItem(STORAGE_KEY, $state.snapshot(settings));
  }

  async function toggle(key: string): Promise<void> {
    settings[key] = !get(key);
    await persist();
  }

  async function setNumber(key: string, value: number): Promise<void> {
    settings[key] = value;
    await persist();
  }

  /** The breath screen skips itself at 0 seconds, so 0 doubles as "off". */
  const isBreathOn = $derived(Number(get(SettingsKey.General.BreathDuration)) > 0);

  function toggleBreath(): Promise<void> {
    const key = SettingsKey.General.BreathDuration;
    return setNumber(key, isBreathOn ? 0 : Number(SETTINGS_DEFAULTS[key]));
  }
</script>

{#if subView === "antiBinge"}
  <AntiBingeBreakSheet onBack={() => subView = "main"} />
{:else if subView === "customizeChallenges"}
  <ChallengeSettingsSheet onBack={() => subView = "main"} />
{:else if subView === "whenToChallengeMe"}
  <TriggerDefaultDifficultySheet onBack={() => subView = "main"} />
{:else}

<TabHeader title={t("main_protectionTitle")} subtitle={t("main_protectionSubtitle")} />

<section>
  {#each guardrailRows as row (row.view)}
    <button class="row-btn guardrail" onclick={() => subView = row.view}>
      <span class="title-line">
        <span class="label">{row.title}</span>
        <span class="chevron">›</span>
      </span>
      <span class="subtitle">{row.subtitle}</span>
    </button>
  {/each}
</section>

<section>
  <h2>{t("settings_generalSection")}</h2>
  <label class="row">
    <span class="label">{t("settings_showSessionTimer")}</span>
    <input
      type="checkbox"
      checked={!!get(SettingsKey.General.SessionTimer)}
      onchange={() => toggle(SettingsKey.General.SessionTimer)}
    />
    <span class="toggle"></span>
  </label>
  <label class="row">
    <span class="label">{t("settings_breathBeforeUnlockToggle")}</span>
    <input type="checkbox" checked={isBreathOn} onchange={toggleBreath} />
    <span class="toggle"></span>
  </label>
  {#if isBreathOn}
    <label class="row sub-row">
      <span class="label">{t("settings_breathLengthLabel")}</span>
      <input
        class="number-input"
        type="number"
        min="1"
        max="60"
        value={get(SettingsKey.General.BreathDuration)}
        onchange={(e) => {
          const v = Math.max(1, Math.min(60, Math.round(Number((e.target as HTMLInputElement).value))));
          setNumber(SettingsKey.General.BreathDuration, v);
        }}
      />
    </label>
  {/if}
</section>

{/if}

<style>
  section {
    padding: 10px 16px 4px;
  }

  h2 {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--rl-subtitle);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 0;
    cursor: pointer;
    border-bottom: 1px solid var(--rl-divider);
  }

  .row:last-child,
  .row:has(+ .sub-row) {
    border-bottom: none;
  }

  /* Only shown while its parent toggle is on; indented to read as part of it. */
  .sub-row {
    padding: 0 0 9px 16px;
  }

  .sub-row .label {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.65);
  }

  .label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
    user-select: none;
  }

  input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle {
    position: relative;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
    transition: background 0.2s ease;
  }

  .toggle::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    transition:
      left 0.2s ease,
      background 0.2s ease;
  }

  input:checked ~ .toggle {
    background: var(--rl-accent-blue);
  }

  input:checked ~ .toggle::after {
    left: 19px;
    background: #fff;
  }

  .number-input {
    width: 52px;
    padding: 4px 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    text-align: center;
    outline: none;
  }

  .number-input:focus {
    border-color: var(--rl-accent-blue);
  }

  .row-btn {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 9px 0;
    cursor: pointer;
    border-bottom: 1px solid var(--rl-divider);
    box-sizing: border-box;
  }

  .row-btn:last-child {
    border-bottom: none;
  }

  .row-btn:hover {
    opacity: 0.8;
  }

  .chevron {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.3);
  }

  /* Guardrail rows: chevron sits next to the label and uses the accent
     color so it reads as clearly tappable. */
  .row-btn.guardrail {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .subtitle {
    font-size: 12px;
    line-height: 1.4;
    color: var(--rl-subtitle);
  }

  .row-btn.guardrail .label {
    color: var(--rl-accent-blue);
    font-weight: 600;
  }

  .row-btn.guardrail .chevron {
    font-size: 22px;
    line-height: 1;
    color: var(--rl-accent-blue);
  }
</style>
