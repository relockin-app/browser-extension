<script lang="ts">
  import { onMount } from "svelte";
  import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
  import type { ChallengeDifficultySpec } from "~/types/challengeModels";
  import { BUILT_IN_DIFFICULTIES, ChallengeDifficulty, getDefaultSteps, difficultyDisplayName, specDisplayName } from "~/shared/challenges/ChallengeTypes";
  import { ChallengeResolver } from "~/shared/challenges/ChallengeResolver";
  import { presentLevelChangeChallenge } from "~/shared/challenges/GuardrailLoosening";
  import { getGuardrailsNavigator } from "~/shared/challenges/guardrailsNavigation";
  import { Shield } from "@lucide/svelte";
  import { t } from "./i18n";

  let { ruleId, ruleName, onBack }: { ruleId: string; ruleName: string; onBack: () => void } = $props();

  const store = createWxtChallengeStorage();
  const resolver = new ChallengeResolver(store);

  interface TriggerEntry {
    triggerKey: string;
    displayName: string;
    defaultDifficulty: ChallengeDifficulty;
  }

  interface TriggerGroup {
    title: string;
    subtitle?: string;
    entries: TriggerEntry[];
  }

  const groups: TriggerGroup[] = [
    { title: t("challengeTriggers_extraTimeDailyLimitGroup"), entries: [
      { triggerKey: "overrideDailyLimit.small", displayName: t("challengeTriggers_triggerUpTo2Min"), defaultDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "overrideDailyLimit.medium", displayName: t("challengeTriggers_trigger2To10Min"), defaultDifficulty: ChallengeDifficulty.Medium },
      { triggerKey: "overrideDailyLimit.large", displayName: t("challengeTriggers_triggerOver10Min"), defaultDifficulty: ChallengeDifficulty.Hard },
    ]},
    { title: t("challengeTriggers_extraTimeScheduleGroup"), entries: [
      { triggerKey: "overrideSchedule.small", displayName: t("challengeTriggers_triggerUpTo2Min"), defaultDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "overrideSchedule.medium", displayName: t("challengeTriggers_trigger2To10Min"), defaultDifficulty: ChallengeDifficulty.Medium },
      { triggerKey: "overrideSchedule.large", displayName: t("challengeTriggers_triggerOver10Min"), defaultDifficulty: ChallengeDifficulty.Hard },
    ]},
    { title: t("challengeTriggers_bypassBreakGroup"), subtitle: t("challengeTriggers_bypassBreakGroupSubtitle"), entries: [
      { triggerKey: "rapidSessionStart.1", displayName: t("challengeTriggers_backToBack1"), defaultDifficulty: ChallengeDifficulty.None },
      { triggerKey: "rapidSessionStart.2to3", displayName: t("challengeTriggers_backToBack2To3"), defaultDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "rapidSessionStart.4plus", displayName: t("challengeTriggers_backToBack4Plus"), defaultDifficulty: ChallengeDifficulty.Medium },
    ]},
    { title: t("challengeTriggers_loosenRulesGroup"), entries: [
      { triggerKey: "deleteTarget", displayName: t("challengeTriggers_removeWebsite"), defaultDifficulty: ChallengeDifficulty.Easy },
      { triggerKey: "deleteRule", displayName: t("challengeTriggers_deleteRule"), defaultDifficulty: ChallengeDifficulty.Hard },
    ]},
  ];

  const navigateToGuardrails = getGuardrailsNavigator();

  function goToGuardrailsTab() {
    onBack();
    navigateToGuardrails?.();
  }

  interface SpecOption { specName: string; displayName: string; }

  const BUILT_IN_NAMES = ["none", "easy", "medium", "hard", "impossible"];
  const defaultOptions: SpecOption[] = BUILT_IN_DIFFICULTIES.map((d) => ({
    specName: d,
    displayName: difficultyDisplayName(d),
  }));

  let specOptions = $state<SpecOption[]>([...defaultOptions]);
  let selections = $state<Record<string, string | null>>({});
  let globalDefaults = $state<Record<string, string>>({});
  let allSpecs = $state<ChallengeDifficultySpec[]>([]);

  onMount(load);

  async function load() {
    allSpecs = await store.getAllSpecs();
    specOptions = [
      ...defaultOptions,
      ...allSpecs.filter((s) => !BUILT_IN_NAMES.includes(s.name)).map((s) => ({ specName: s.name, displayName: s.name })),
    ];

    // Load per-rule overrides
    const overrides = await store.getOverridesForRule(ruleId);
    const specById = Object.fromEntries(allSpecs.map((s) => [s.id, s.name]));
    const sel: Record<string, string | null> = {};
    for (const o of overrides) {
      if (o.trigger) sel[o.trigger] = specById[o.specId] ?? null;
    }
    selections = sel;

    // Load global defaults for display
    const tds = await store.getAllTriggerDefaults();
    const gd: Record<string, string> = {};
    for (const td of tds) {
      const name = specById[td.specId];
      if (name) gd[td.trigger] = name;
    }
    globalDefaults = gd;
  }

  function effectiveDefaultName(entry: TriggerEntry): string {
    if (globalDefaults[entry.triggerKey]) {
      return specDisplayName(globalDefaults[entry.triggerKey]);
    }
    return difficultyLabel(entry.defaultDifficulty);
  }

  /**
   * Making this rule's setting easier asks for the challenge it's set to now;
   * anything else applies straight away. Going back to Default means taking
   * whatever the global setting is.
   */
  async function requestSelection(triggerKey: string, specName: string | null, select: HTMLSelectElement) {
    const proposed = specName
      ? await resolver.levelForSpecName(specName)
      : await resolver.globalLevel(triggerKey);
    try {
      await presentLevelChangeChallenge(
        await resolver.levelForTriggerKey(triggerKey, ruleId),
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

    const overrides = await store.getOverridesForRule(ruleId);
    const existing = overrides.find((o) => o.trigger === triggerKey);

    if (!specName) {
      if (existing) await store.deleteOverride(existing.id);
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

    await store.upsertOverride({
      id: existing?.id ?? crypto.randomUUID(),
      ruleId,
      trigger: triggerKey,
      specId: spec.id,
    });
  }

  function difficultyLabel(d: ChallengeDifficulty): string {
    return difficultyDisplayName(d);
  }
</script>

<div class="sheet">
  <div class="header">
    <button class="back-btn" onclick={onBack}>← {t("common_done")}</button>
    <h1>{t("challenges_ruleChallengesTitle")}</h1>
  </div>

  <div class="intro">
    <p class="description">{t("challenges_ruleChallengesHeaderFormat", ruleName)}</p>
    <p class="hint">{t("challenges_allRulesGuardrailsHint")}</p>
    {#if navigateToGuardrails}
      <button class="guardrails-btn" onclick={goToGuardrailsTab}>
        <Shield size={16} strokeWidth={1.8} />
        <span>{t("challenges_goToGuardrailsTab")}</span>
      </button>
    {/if}
  </div>

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
              <span class="trigger-default">{t("challengeUi_defaultDifficultyFormat", [effectiveDefaultName(entry)])}</span>
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
</div>

<style>
  .sheet { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 16px; }
  .header { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 0 4px; }
  .back-btn { all: unset; font-size: 13px; font-weight: 600; color: var(--rl-accent-blue); cursor: pointer; }
  h1 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.25; color: rgba(255,255,255,0.95); }
  .intro { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .description { margin: 0; font-size: 12px; color: rgba(255,255,255,0.45); line-height: 1.4; }
  .hint { margin: 0; font-size: 11px; line-height: 1.4; color: var(--rl-subtitle); }
  .guardrails-btn { all: unset; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.08); color: var(--rl-accent-blue); font-size: 13px; font-weight: 600; cursor: pointer; }
  .guardrails-btn:hover { opacity: 0.8; }

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
</style>
