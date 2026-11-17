<script lang="ts">
  import { onMount } from "svelte";
  import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
  import type { ChallengeDifficultySpec } from "~/types/challengeModels";
  import { BUILT_IN_DIFFICULTIES, ChallengeDifficulty, getDefaultSteps, difficultyDisplayName } from "~/shared/challenges/ChallengeTypes";
  import { ChallengeResolver } from "~/shared/challenges/ChallengeResolver";
  import {
    presentLevelChangeChallenge,
    presentStopRequiringChallenge,
  } from "~/shared/challenges/GuardrailLoosening";
  import {
    isLooseningChallengeRequired,
    setLooseningChallengeRequired,
    watchLooseningChallengeRequired,
  } from "~/shared/challenges/GuardrailLooseningSettings";
  import GuardrailLooseningGraceNote from "./GuardrailLooseningGraceNote.svelte";
  import { t } from "./i18n";

  let { onBack }: { onBack: () => void } = $props();

  const store = createWxtChallengeStorage();
  const resolver = new ChallengeResolver(store);

  interface TriggerEntry {
    triggerKey: string;
    displayName: string;
    hardcodedDifficulty: ChallengeDifficulty;
  }

  interface TriggerGroup {
    title: string;
    subtitle?: string;
    entries: TriggerEntry[];
  }

  const groups: TriggerGroup[] = [
    { title: t("challengeTriggers_extraTimeDailyLimitGroup"), entries: [
      { triggerKey: "overrideDailyLimit.small", displayName: t("challengeTriggers_triggerUpTo2Min"), hardcodedDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "overrideDailyLimit.medium", displayName: t("challengeTriggers_trigger2To10Min"), hardcodedDifficulty: ChallengeDifficulty.Medium },
      { triggerKey: "overrideDailyLimit.large", displayName: t("challengeTriggers_triggerOver10Min"), hardcodedDifficulty: ChallengeDifficulty.Hard },
    ]},
    { title: t("challengeTriggers_extraTimeScheduleGroup"), entries: [
      { triggerKey: "overrideSchedule.small", displayName: t("challengeTriggers_triggerUpTo2Min"), hardcodedDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "overrideSchedule.medium", displayName: t("challengeTriggers_trigger2To10Min"), hardcodedDifficulty: ChallengeDifficulty.Medium },
      { triggerKey: "overrideSchedule.large", displayName: t("challengeTriggers_triggerOver10Min"), hardcodedDifficulty: ChallengeDifficulty.Hard },
    ]},
    { title: t("challengeTriggers_bypassBreakGroup"), subtitle: t("challengeTriggers_bypassBreakGroupSubtitle"), entries: [
      { triggerKey: "rapidSessionStart.1", displayName: t("challengeTriggers_backToBack1"), hardcodedDifficulty: ChallengeDifficulty.None },
      { triggerKey: "rapidSessionStart.2to3", displayName: t("challengeTriggers_backToBack2To3"), hardcodedDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "rapidSessionStart.4plus", displayName: t("challengeTriggers_backToBack4Plus"), hardcodedDifficulty: ChallengeDifficulty.Medium },
    ]},
    { title: t("challengeTriggers_loosenRulesGroup"), entries: [
      { triggerKey: "deleteTarget", displayName: t("challengeTriggers_removeWebsite"), hardcodedDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "increaseAllowedMinutes", displayName: t("challengeTriggers_raiseDailyLimit"), hardcodedDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "deleteRule", displayName: t("challengeTriggers_deleteRule"), hardcodedDifficulty: ChallengeDifficulty.Hard },
    ]},
    { title: t("challengeTriggers_loosenSchedulesGroup"), entries: [
      { triggerKey: "modifySchedule.whileInactive", displayName: t("challengeTriggers_whileInactive"), hardcodedDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "modifySchedule.whileActive", displayName: t("challengeTriggers_whileActive"), hardcodedDifficulty: ChallengeDifficulty.Medium },
    ]},
  ];

  interface SpecOption { specName: string; displayName: string; }

  const BUILT_IN_NAMES = ["none", "easy", "medium", "hard", "impossible"];
  const defaultOptions: SpecOption[] = BUILT_IN_DIFFICULTIES.map((d) => ({
    specName: d,
    displayName: difficultyDisplayName(d),
  }));

  let specOptions = $state<SpecOption[]>([...defaultOptions]);
  let selections = $state<Record<string, string | null>>({});
  let allSpecs = $state<ChallengeDifficultySpec[]>([]);
  let isLooseningRequired = $state(true);

  onMount(() => {
    void load();
    void isLooseningChallengeRequired().then((isRequired) => {
      isLooseningRequired = isRequired;
    });
    return watchLooseningChallengeRequired((isRequired) => {
      isLooseningRequired = isRequired;
    });
  });

  async function load() {
    allSpecs = await store.getAllSpecs();
    specOptions = [
      ...defaultOptions,
      ...allSpecs.filter((s) => !BUILT_IN_NAMES.includes(s.name)).map((s) => ({ specName: s.name, displayName: s.name })),
    ];
    const tds = await store.getAllTriggerDefaults();
    const specById = Object.fromEntries(allSpecs.map((s) => [s.id, s.name]));
    const sel: Record<string, string | null> = {};
    for (const td of tds) {
      sel[td.trigger] = specById[td.specId] ?? null;
    }
    selections = sel;
  }

  /**
   * Making a default easier asks for the challenge it's set to now; anything
   * else applies straight away.
   */
  async function requestSelection(triggerKey: string, specName: string | null, select: HTMLSelectElement) {
    const proposed = specName
      ? await resolver.levelForSpecName(specName)
      : await resolver.fallbackLevel(triggerKey);
    try {
      await presentLevelChangeChallenge(
        await resolver.globalLevel(triggerKey),
        proposed,
        t("challengeGoals_loosenGuardrail"),
      );
    } catch {
      // Cancelled — put the picker back on what's saved.
      select.value = selections[triggerKey] ?? "";
      return;
    }
    await applySelection(triggerKey, specName);
  }

  async function applySelection(triggerKey: string, specName: string | null) {
    selections[triggerKey] = specName;

    const tds = await store.getAllTriggerDefaults();
    const existing = tds.find((td) => td.trigger === triggerKey);

    if (!specName) {
      if (existing) await store.deleteTriggerDefault(existing.id);
      return;
    }

    // Look up fresh rather than in the load-time `allSpecs`: another page may
    // have created this built-in spec since, and a second copy would split it.
    let spec = await store.getSpecByName(specName);
    if (!spec && BUILT_IN_NAMES.includes(specName)) {
      const diff = Object.values(ChallengeDifficulty).find((d) => d === specName);
      if (diff) {
        spec = await store.upsertSpec({ id: crypto.randomUUID(), name: specName, steps: getDefaultSteps(diff) });
        allSpecs = [...allSpecs, spec];
      }
    }
    if (!spec) return;

    await store.upsertTriggerDefault({
      id: existing?.id ?? crypto.randomUUID(),
      trigger: triggerKey,
      specId: spec.id,
    });
  }

  function difficultyLabel(d: ChallengeDifficulty): string {
    return difficultyDisplayName(d);
  }

  /**
   * Turning the requirement back on is immediate; turning it off is itself
   * loosening, so it asks for a challenge first.
   */
  async function onLooseningToggleChange(input: HTMLInputElement) {
    if (input.checked) {
      await setLooseningChallengeRequired(true);
      isLooseningRequired = true;
      return;
    }
    // Stays on until the challenge is passed.
    input.checked = true;
    try {
      await presentStopRequiringChallenge();
    } catch {
      return;
    }
    await setLooseningChallengeRequired(false);
    isLooseningRequired = false;
  }
</script>

<div class="sheet">
  <div class="header">
    <button class="back-btn" onclick={onBack}>← {t("common_done")}</button>
    <h1>{t("challenges_whenToChallengeMe")}</h1>
  </div>

  <GuardrailLooseningGraceNote />

  {#each groups as group (group.title)}
    <section class="group">
      <div class="group-header">
        <h2 class="group-title">{group.title}</h2>
        {#if group.subtitle}<p class="group-subtitle">{group.subtitle}</p>{/if}
      </div>
      <div class="trigger-card" class:selected={group.entries.some((e) => !!selections[e.triggerKey])}>
        {#each group.entries as entry, i (entry.triggerKey)}
          {#if i > 0}<div class="row-divider"></div>{/if}
          <div class="trigger-row">
            <div class="trigger-info">
              <span class="trigger-name">{entry.displayName}</span>
              <span class="trigger-default">{t("challengeUi_defaultDifficultyFormat", [difficultyLabel(entry.hardcodedDifficulty)])}</span>
            </div>
            <select class="trigger-select"
              value={selections[entry.triggerKey] ?? ""}
              onchange={(e) => { const sel = e.target as HTMLSelectElement; requestSelection(entry.triggerKey, sel.value || null, sel); }}>
              <option value="">{t("common_defaultOption")}</option>
              {#each specOptions as opt (opt.specName)}
                <option value={opt.specName}>{opt.displayName}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    </section>
  {/each}

  <!-- Lives here because assigning difficulties is where most loosening
       happens, though it covers the Customize Challenges sheet too. -->
  <label class="toggle-card">
    <span class="toggle-text">
      <span class="toggle-title">{t("challenges_looseningChallengeToggleTitle")}</span>
      <span class="toggle-subtitle">{t("challenges_looseningChallengeToggleSubtitle")}</span>
    </span>
    <input
      type="checkbox"
      checked={isLooseningRequired}
      onchange={(e) => onLooseningToggleChange(e.currentTarget)}
    />
    <span class="toggle"></span>
  </label>
</div>

<style>
  .sheet { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 16px; }
  .header { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 0 4px; }
  .back-btn { all: unset; font-size: 13px; font-weight: 600; color: var(--rl-accent-blue); cursor: pointer; }
  h1 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.25; color: rgba(255,255,255,0.95); }

  .trigger-card { background: var(--rl-card-bg); border: 1px solid var(--rl-card-border); border-radius: 12px; overflow: hidden; transition: border-color 0.15s ease; }
  .trigger-card.selected { border-color: var(--rl-accent-blue); }

  .group { display: flex; flex-direction: column; gap: 8px; }
  .group-header { display: flex; flex-direction: column; gap: 2px; }
  .group-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.3; color: rgba(255,255,255,0.95); }
  .group-subtitle { margin: 0; font-size: 11px; line-height: 1.4; color: var(--rl-subtitle); }

  .trigger-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; gap: 8px; }
  .trigger-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .trigger-name { font-size: 13px; color: rgba(255,255,255,0.85); }
  .trigger-default { font-size: 10px; color: rgba(255,255,255,0.35); }

  .trigger-select { padding: 4px 6px; font-size: 12px; flex-shrink: 0; }

  .row-divider { height: 1px; background: var(--rl-divider); margin: 0 12px; }

  .toggle-card { display: flex; align-items: center; gap: 10px; margin-top: 4px; padding: 10px 12px; background: var(--rl-card-bg); border: 1px solid var(--rl-card-border); border-radius: 12px; cursor: pointer; }
  .toggle-text { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  .toggle-title { font-size: 13px; color: rgba(255,255,255,0.85); }
  .toggle-subtitle { font-size: 11px; line-height: 1.4; color: var(--rl-subtitle); }

  .toggle-card input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; }
  .toggle { position: relative; width: 38px; height: 22px; border-radius: 11px; background: rgba(255,255,255,0.15); flex-shrink: 0; transition: background 0.2s ease; }
  .toggle::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: rgba(255,255,255,0.6); transition: left 0.2s ease, background 0.2s ease; }
  .toggle-card input:checked ~ .toggle { background: var(--rl-accent-blue); }
  .toggle-card input:checked ~ .toggle::after { left: 19px; background: #fff; }
</style>
