<script lang="ts">
  import { onMount } from "svelte";
  import { CircleMinus } from "@lucide/svelte";
  import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
  import type { ChallengeDifficultySpec } from "~/types/challengeModels";
  import {
    type ChallengeStep,
    type MathChallengeConfig,
    ChallengeDifficulty,
    MathDifficulty,
    DEFAULT_MATH_CONFIG,
    DEFAULT_WAIT_TIMER_SECONDS,
    WAIT_TIMER_ALLOWED_SECONDS,
    getDefaultSteps,
    difficultyDisplayName,
    isReservedSpecName,
  } from "~/shared/challenges/ChallengeTypes";
  import { ChallengeResolver } from "~/shared/challenges/ChallengeResolver";
  import { presentStepsEditChallenge } from "~/shared/challenges/GuardrailLoosening";
  import GuardrailLooseningGraceNote from "./GuardrailLooseningGraceNote.svelte";
  import { t, tp } from "./i18n";
  import { formatMinutesSeconds } from "~/shared/overlayUI/utils/intlFormat";

  let { onBack }: { onBack: () => void } = $props();

  const store = createWxtChallengeStorage();
  const resolver = new ChallengeResolver(store);

  type StepType =
    | "typingShort"
    | "typingLong"
    | "typingParagraph"
    | "math"
    | "accountabilityEmail"
    | "waitTimer";

  interface StepDraft {
    id: string;
    type: StepType;
    mathConfig: MathChallengeConfig;
    waitSeconds: number;
  }

  /**
   * Steps the Add Step menu offers. Leaves out accountabilityEmail for now —
   * its email sending is stubbed, so it would make a challenge that does
   * nothing. Mirrors iOS ChallengeStepDraft.StepType.userSelectable.
   */
  const USER_SELECTABLE_STEPS: StepType[] = [
    "typingShort",
    "typingLong",
    "typingParagraph",
    "math",
    "waitTimer",
  ];

  interface SpecCard {
    difficulty: ChallengeDifficulty;
    drafts: StepDraft[];
    lastSaved: ChallengeStep[] | null;
    saveSuccess: boolean;
  }

  interface CustomSpec {
    id: string;
    name: string;
    isInDB: boolean;
    drafts: StepDraft[];
    lastSaved: ChallengeStep[] | null;
    saveSuccess: boolean;
  }

  let builtIn = $state<SpecCard[]>([
    { difficulty: ChallengeDifficulty.Easy, drafts: [], lastSaved: null, saveSuccess: false },
    { difficulty: ChallengeDifficulty.Medium, drafts: [], lastSaved: null, saveSuccess: false },
    { difficulty: ChallengeDifficulty.Hard, drafts: [], lastSaved: null, saveSuccess: false },
  ]);
  let customs = $state<CustomSpec[]>([]);
  let newName = $state("");
  let showNewDialog = $state(false);

  function stepToDraft(s: ChallengeStep): StepDraft {
    if (s.type === "notAllowed") {
      // System-only step that should never appear in a user-editable spec —
      // the load path filters out the impossible row so we don't get here in
      // practice. If it ever does, fall back to a harmless short-typing draft
      // rather than breaking the sheet.
      console.warn("ChallengeSettingsSheet: unexpected notAllowed step in a user-editable spec; substituting typingShort");
      return { id: crypto.randomUUID(), type: "typingShort", mathConfig: DEFAULT_MATH_CONFIG, waitSeconds: DEFAULT_WAIT_TIMER_SECONDS };
    }
    return {
      id: crypto.randomUUID(),
      type: s.type,
      mathConfig: s.type === "math" ? s.config : DEFAULT_MATH_CONFIG,
      waitSeconds: s.type === "waitTimer" ? s.seconds : DEFAULT_WAIT_TIMER_SECONDS,
    };
  }

  function draftToStep(d: StepDraft): ChallengeStep {
    if (d.type === "math") return { type: "math", config: d.mathConfig };
    if (d.type === "waitTimer") return { type: "waitTimer", seconds: d.waitSeconds };
    return { type: d.type };
  }

  /** Round-trips steps through the draft shape so saved and edited steps compare like for like. */
  function normalizeSteps(steps: ChallengeStep[]): ChallengeStep[] {
    return steps.map(stepToDraft).map(draftToStep);
  }

  function isDirty(drafts: StepDraft[], lastSaved: ChallengeStep[] | null): boolean {
    if (!lastSaved) return drafts.length > 0;
    const current = drafts.map(draftToStep);
    return JSON.stringify(current) !== JSON.stringify(lastSaved);
  }

  const STEP_LABELS: Record<StepType, string> = {
    typingShort: t("challenges_stepNameTypingShort"),
    typingLong: t("challenges_stepNameTypingLong"),
    typingParagraph: t("challenges_stepNameTypingParagraph"),
    math: t("challenges_stepNameMath"),
    accountabilityEmail: t("challenges_stepNameAccountabilityEmail"),
    waitTimer: t("challenges_stepNameWaitTimer"),
  };

  const STEP_ICONS: Record<StepType, string> = {
    typingShort: "✎",
    typingLong: "📄",
    typingParagraph: "¶",
    math: "ƒ",
    accountabilityEmail: "✉",
    waitTimer: "⏳",
  };

  /** Slider position of a stored length; off-grid values snap to the nearest stop. */
  function waitStopIndex(seconds: number): number {
    let best = 0;
    WAIT_TIMER_ALLOWED_SECONDS.forEach((v, i) => {
      if (Math.abs(v - seconds) < Math.abs(WAIT_TIMER_ALLOWED_SECONDS[best] - seconds)) best = i;
    });
    return best;
  }

  /** Short form for the slider's end labels, e.g. "15s", "20m". */
  function shortDuration(totalSeconds: number): string {
    return formatMinutesSeconds(Math.floor(totalSeconds / 60), totalSeconds % 60);
  }

  onMount(async () => {
    const allSpecs = await store.getAllSpecs();
    const builtInNames = new Set(["none", "easy", "medium", "hard", "impossible"]);

    for (const card of builtIn) {
      const spec = allSpecs.find((s) => s.name === card.difficulty);
      const steps = spec?.steps ?? getDefaultSteps(card.difficulty);
      card.drafts = steps.map(stepToDraft);
      // An unsaved built-in shows its default steps, which count as saved.
      card.lastSaved = normalizeSteps(steps);
    }

    customs = allSpecs
      .filter((s) => !builtInNames.has(s.name))
      .map((s) => ({
        id: s.id,
        name: s.name,
        isInDB: true,
        drafts: s.steps.map(stepToDraft),
        lastSaved: normalizeSteps(s.steps),
        saveSuccess: false,
      }));
  });

  function difficultyName(d: ChallengeDifficulty): string {
    return difficultyDisplayName(d);
  }

  const isNewNameTaken = $derived.by(() => {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    return isReservedSpecName(trimmed) || customs.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  });

  /** Steps a custom difficulty has saved; one never saved has nothing to lose. */
  async function savedCustomSteps(spec: CustomSpec): Promise<ChallengeStep[]> {
    if (!spec.isInDB) return [];
    return (await store.getSpec(spec.id))?.steps ?? [];
  }

  /** An edit that leaves the difficulty easier asks for the steps it took out. */
  async function saveBuiltIn(index: number) {
    const card = builtIn[index];
    const steps = card.drafts.map(draftToStep);
    try {
      await presentStepsEditChallenge(
        (await resolver.levelForDifficulty(card.difficulty)).steps,
        steps,
        t("challengeGoals_loosenChallengeFormat", difficultyName(card.difficulty)),
      );
    } catch {
      return; // Cancelled — keep the unsaved edits so the user can adjust.
    }
    const existing = (await store.getAllSpecs()).find((s) => s.name === card.difficulty);
    await store.upsertSpec({
      id: existing?.id ?? crypto.randomUUID(),
      name: card.difficulty,
      steps: $state.snapshot(steps),
    });
    card.lastSaved = steps;
    card.saveSuccess = true;
    setTimeout(() => { builtIn[index].saveSuccess = false; }, 2000);
  }

  /** An edit that leaves the saved difficulty easier asks for the steps it took out. */
  async function saveCustom(index: number) {
    const spec = customs[index];
    const steps = spec.drafts.map(draftToStep);
    try {
      await presentStepsEditChallenge(
        await savedCustomSteps(spec),
        steps,
        t("challengeGoals_loosenChallengeFormat", spec.name),
      );
    } catch {
      return; // Cancelled — keep the unsaved edits so the user can adjust.
    }
    await store.upsertSpec({ id: spec.id, name: spec.name, steps: $state.snapshot(steps) });
    spec.isInDB = true;
    spec.lastSaved = steps;
    spec.saveSuccess = true;
    setTimeout(() => { customs[index].saveSuccess = false; }, 2000);
  }

  /**
   * Deleting a saved difficulty strips its steps from whatever uses it, so it
   * costs what the difficulty holds.
   */
  async function deleteCustom(index: number) {
    const spec = customs[index];
    try {
      await presentStepsEditChallenge(
        await savedCustomSteps(spec),
        [],
        t("challengeGoals_deleteChallengeFormat", spec.name),
      );
    } catch {
      return;
    }
    if (spec.isInDB) await store.deleteSpec(spec.id);
    customs = customs.filter((c) => c.id !== spec.id);
  }

  function addCustom() {
    const trimmed = newName.trim();
    if (!trimmed || isNewNameTaken) return;
    customs = [...customs, {
      id: crypto.randomUUID(),
      name: trimmed,
      isInDB: false,
      drafts: [],
      lastSaved: null,
      saveSuccess: false,
    }];
    newName = "";
    showNewDialog = false;
  }

  function addStep(drafts: StepDraft[], type: StepType): StepDraft[] {
    return [...drafts, { id: crypto.randomUUID(), type, mathConfig: { ...DEFAULT_MATH_CONFIG }, waitSeconds: DEFAULT_WAIT_TIMER_SECONDS }];
  }

  function removeStep(drafts: StepDraft[], idx: number): StepDraft[] {
    return drafts.filter((_, i) => i !== idx);
  }

  /** Throws away unsaved edits. */
  function revertedDrafts(lastSaved: ChallengeStep[] | null): StepDraft[] {
    return (lastSaved ?? []).map(stepToDraft);
  }
</script>

{#snippet stepList(owner: { drafts: StepDraft[] })}
  {#if owner.drafts.length === 0}
    <p class="no-steps">{t("challenges_noSteps")}</p>
  {:else}
    {#each owner.drafts as draft, si (draft.id)}
      <div class="step-row">
        <span class="step-icon">{STEP_ICONS[draft.type]}</span>
        <div class="step-content">
          <span class="step-label">{STEP_LABELS[draft.type]}</span>
          {#if draft.type === "math"}
            <div class="math-config">
              <label class="mini-field">
                <span class="mini-label">{t("challenges_difficultyLabel")}</span>
                <select class="mini-select" value={draft.mathConfig.difficulty}
                  onchange={(e) => { draft.mathConfig = { ...draft.mathConfig, difficulty: (e.target as HTMLSelectElement).value as MathDifficulty }; }}>
                  <option value="easy">{t("challengeUi_difficultyEasy")}</option>
                  <option value="medium">{t("challengeUi_difficultyMedium")}</option>
                  <option value="hard">{t("challengeUi_difficultyHard")}</option>
                  <option value="extraHard">{t("challengeUi_difficultyExtraHard")}</option>
                </select>
              </label>
              <label class="mini-field">
                <span class="mini-label">{t("challenges_problemsLabel")}</span>
                <input class="mini-number" type="number" min="1" max="10" value={draft.mathConfig.problemCount}
                  onchange={(e) => { draft.mathConfig = { ...draft.mathConfig, problemCount: Math.max(1, Math.min(10, Number((e.target as HTMLInputElement).value))) }; }} />
              </label>
              <div class="mini-field">
                <span class="mini-label">{t("challenges_operationsLabel")}</span>
                <div class="op-toggles">
                  {#each [["allowAddition", "+"], ["allowSubtraction", "−"], ["allowMultiplication", "×"], ["allowDivision", "÷"]] as [key, sym]}
                    <button class="op-chip" class:active={draft.mathConfig[key as keyof MathChallengeConfig]}
                      onclick={() => { draft.mathConfig = { ...draft.mathConfig, [key]: !draft.mathConfig[key as keyof MathChallengeConfig] }; }}>
                      {sym}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {:else if draft.type === "waitTimer"}
            <!-- Non-linear stops (15s to 20min), like iOS WaitTimerDurationSlider. -->
            <div class="wait-config">
              <span class="mini-label">{t("challenges_waitTimerDurationFormat", [String(Math.floor(draft.waitSeconds / 60)), String(draft.waitSeconds % 60)])}</span>
              <div class="wait-slider-row">
                <span class="wait-bound">{shortDuration(WAIT_TIMER_ALLOWED_SECONDS[0])}</span>
                <input class="wait-slider" type="range" min="0" max={WAIT_TIMER_ALLOWED_SECONDS.length - 1} step="1"
                  value={waitStopIndex(draft.waitSeconds)}
                  oninput={(e) => { draft.waitSeconds = WAIT_TIMER_ALLOWED_SECONDS[Number((e.target as HTMLInputElement).value)]; }} />
                <span class="wait-bound">{shortDuration(WAIT_TIMER_ALLOWED_SECONDS[WAIT_TIMER_ALLOWED_SECONDS.length - 1])}</span>
              </div>
            </div>
          {/if}
        </div>
        <button class="step-delete" aria-label={t("common_delete")} onclick={() => { owner.drafts = removeStep(owner.drafts, si); }}><CircleMinus size={18} /></button>
      </div>
    {/each}
  {/if}
{/snippet}

{#snippet addStepMenu(owner: { drafts: StepDraft[] })}
  <div class="add-step-menu">
    <select class="add-step-select"
      onchange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v) { owner.drafts = addStep(owner.drafts, v as StepType); (e.target as HTMLSelectElement).value = ""; }
      }}>
      <option value="" selected disabled hidden>+ {t("challenges_addStep")}</option>
      {#each USER_SELECTABLE_STEPS as type (type)}
        <option value={type}>{STEP_LABELS[type]}</option>
      {/each}
    </select>
  </div>
{/snippet}

<div class="sheet">
  <div class="header">
    <button class="back-btn" onclick={onBack}>← {t("common_done")}</button>
    <h1>{t("challenges_customizeChallenges")}</h1>
  </div>

  <p class="description">{t("challenges_customizeChallengesHeader")}</p>

  <GuardrailLooseningGraceNote />

  <!-- Built-in Difficulties -->
  <h2>{t("challenges_builtInChallengesSection")}</h2>
  {#each builtIn as card, i (card.difficulty)}
    <div class="spec-card">
      <div class="spec-header">
        <span class="spec-title">{difficultyName(card.difficulty)}</span>
        <span class="step-count">{tp("challenges_stepCount", card.drafts.length)}</span>
        {#if card.saveSuccess}
          <span class="saved-badge">✓ {t("challenges_savedBadge")}</span>
        {/if}
      </div>

      {@render stepList(card)}

      <div class="card-footer">
        {@render addStepMenu(card)}
        {#if isDirty(card.drafts, card.lastSaved)}
          <div class="edit-btns">
            <button class="cancel-btn" onclick={() => { card.drafts = revertedDrafts(card.lastSaved); }}>{t("common_cancel")}</button>
            <button class="save-btn" onclick={() => saveBuiltIn(i)}>{t("common_save")}</button>
          </div>
        {/if}
      </div>
    </div>
  {/each}

  <!-- Custom Difficulties -->
  <div class="custom-header">
    <h2>{t("challenges_customChallengesSection")}</h2>
    <button class="new-btn" onclick={() => { showNewDialog = true; }}>+ {t("challenges_newChallenge")}</button>
  </div>

  {#if showNewDialog}
    <div class="new-dialog">
      <input class="new-name-input" type="text" placeholder={t("challenges_newChallengeNamePlaceholder")} bind:value={newName} />
      {#if isNewNameTaken}
        <p class="name-error">{t("challenges_uniqueNameRequired")}</p>
      {/if}
      <div class="new-dialog-btns">
        <button class="cancel-btn" onclick={() => { showNewDialog = false; newName = ""; }}>{t("common_cancel")}</button>
        <button class="create-btn" disabled={!newName.trim() || isNewNameTaken} onclick={addCustom}>{t("common_create")}</button>
      </div>
    </div>
  {/if}

  {#if customs.length === 0 && !showNewDialog}
    <p class="empty">{t("challenges_noCustomChallenges")}</p>
  {/if}

  {#each customs as spec, i (spec.id)}
    <div class="spec-card">
      <div class="spec-header">
        <span class="spec-title">{spec.name}</span>
        <span class="step-count">{tp("challenges_stepCount", spec.drafts.length)}</span>
        {#if spec.saveSuccess}
          <span class="saved-badge">✓ {t("challenges_savedBadge")}</span>
        {/if}
        <button class="trash-btn" aria-label={t("common_delete")} onclick={() => deleteCustom(i)}>🗑</button>
      </div>

      {@render stepList(spec)}

      <div class="card-footer">
        {@render addStepMenu(spec)}
        {#if isDirty(spec.drafts, spec.lastSaved)}
          <div class="edit-btns">
            <button class="cancel-btn" onclick={() => { spec.drafts = revertedDrafts(spec.lastSaved); }}>{t("common_cancel")}</button>
            <button class="save-btn" onclick={() => saveCustom(i)}>{t("common_save")}</button>
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .sheet { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px; }

  .header { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 0 4px; }
  .back-btn { all: unset; font-size: 13px; font-weight: 600; color: var(--rl-accent-blue); cursor: pointer; }
  h1 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.25; color: rgba(255,255,255,0.95); }
  .description { margin: 0; font-size: 12px; color: rgba(255,255,255,0.45); line-height: 1.4; }

  h2 { margin: 8px 0 2px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--rl-subtitle); }

  .spec-card { background: var(--rl-card-bg); border: 1px solid var(--rl-card-border); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .spec-header { display: flex; align-items: center; gap: 6px; }
  .spec-title { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9); }
  .step-count { font-size: 11px; color: rgba(255,255,255,0.35); }
  .saved-badge { font-size: 11px; color: #4caf50; font-weight: 600; margin-left: auto; }
  .trash-btn { all: unset; font-size: 13px; cursor: pointer; margin-left: auto; opacity: 0.4; }
  .trash-btn:hover { opacity: 0.8; }

  .no-steps { margin: 2px 0; font-size: 12px; color: rgba(255,255,255,0.3); font-style: italic; }

  .step-row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-top: 1px solid var(--rl-divider); }
  .step-icon { font-size: 14px; padding-top: 1px; color: var(--rl-accent-blue); }
  .step-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .step-label { font-size: 13px; color: rgba(255,255,255,0.8); }
  .step-delete { all: unset; display: flex; color: #ef5350; cursor: pointer; padding: 0 2px; }
  .step-delete:hover { opacity: 0.8; }

  .math-config { display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
  .mini-field { display: flex; flex-direction: column; gap: 2px; }
  .mini-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: rgba(255,255,255,0.4); }
  .mini-select { align-self: flex-start; padding: 3px 6px; font-size: 12px; }
  .mini-number { padding: 3px 6px; font-size: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 5px; color: rgba(255,255,255,0.85); outline: none; }
  .mini-number:focus { border-color: var(--rl-accent-blue); }
  .mini-number { width: 48px; text-align: center; }

  .op-toggles { display: flex; gap: 4px; }
  .op-chip { all: unset; width: 28px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); transition: all 0.15s ease; }
  .op-chip.active { color: var(--rl-accent-blue); background: rgba(115,158,235,0.15); border-color: var(--rl-accent-blue); }

  .wait-config { display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
  .wait-slider-row { display: flex; align-items: center; gap: 6px; }
  .wait-slider { flex: 1; min-width: 0; accent-color: var(--rl-accent-blue); cursor: pointer; }
  .wait-bound { font-size: 10px; color: rgba(255,255,255,0.4); }

  .card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 4px; }
  .add-step-select { all: unset; font-size: 12px; font-weight: 600; color: var(--rl-accent-blue); cursor: pointer; }
  .save-btn { all: unset; font-size: 12px; font-weight: 600; color: #fff; background: var(--rl-accent-blue); padding: 4px 12px; border-radius: 6px; cursor: pointer; }
  .save-btn:hover { opacity: 0.85; }
  .edit-btns { display: flex; align-items: center; gap: 4px; }

  .custom-header { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
  .custom-header h2 { margin: 0; }
  .new-btn { all: unset; font-size: 11px; font-weight: 600; color: var(--rl-accent-blue); cursor: pointer; }

  .new-dialog { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: var(--rl-card-bg); border: 1px solid var(--rl-card-border); border-radius: 12px; }
  .new-name-input { padding: 6px 10px; font-size: 13px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: rgba(255,255,255,0.85); outline: none; }
  .new-name-input:focus { border-color: var(--rl-accent-blue); }
  .name-error { margin: 0; font-size: 12px; color: #ff9800; }
  .new-dialog-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .cancel-btn { all: unset; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); cursor: pointer; padding: 4px 10px; }
  .create-btn { all: unset; font-size: 12px; font-weight: 600; color: #fff; background: var(--rl-accent-blue); padding: 4px 12px; border-radius: 6px; cursor: pointer; }
  .create-btn:disabled { opacity: 0.4; cursor: default; }

  .empty { margin: 4px 0; font-size: 12px; color: rgba(255,255,255,0.3); font-style: italic; }
</style>
