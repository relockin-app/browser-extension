<script lang="ts">
  /*
   * The introduction to schedules, shown in place of the Schedules tab the
   * first time someone without a schedule opens it, and replayed from "How it
   * works". Mirrors Android `RelockrSchedulesTutorialDialog` / iOS
   * `RelockrSchedulesTutorialView`.
   *
   * Three concept slides, one idea each: sites stay locked until you unlock
   * them, some hours you want them to stay locked, and a schedule is what
   * takes the unlock button away. Then the user sets up a Sleep schedule,
   * which isn't saved until they confirm, so backing out leaves nothing to
   * delete.
   *
   * "Allow only during" mode is deliberately left out: it inverts the idea the
   * slides just taught, and the schedule card explains it for anyone who looks.
   */
  import { fade } from "svelte/transition";
  import { ChevronLeft, X } from "@lucide/svelte";
  import type { RelockrSchedule } from "~/types/models";
  import { t } from "./i18n";
  import MoonGlyph from "./MoonGlyph.svelte";
  import ScheduleCard from "./ScheduleCard.svelte";
  import ScheduleTimeSection from "./ScheduleTimeSection.svelte";
  import ScheduleWeekdaySection from "./ScheduleWeekdaySection.svelte";
  import SchedulesTutorialDemo from "./SchedulesTutorialDemo.svelte";
  import SchedulesTutorialNightClock from "./SchedulesTutorialNightClock.svelte";
  import TypingTitle from "./TypingTitle.svelte";
  import { formatScheduleMinute, sleepScheduleDraft } from "./schedulesTutorial";

  type Step = "unlock" | "lateNight" | "scheduleBlocks" | "setup" | "done";

  let {
    includesSetup,
    createSchedule,
    onFinish,
  }: {
    /** False when replayed by someone who already has a schedule: they get the concept slides only. */
    includesSetup: boolean;
    /** Saves the schedule and links it to every rule. Resolves to null on failure. */
    createSchedule: (input: ReturnType<typeof sleepScheduleDraft>) => Promise<RelockrSchedule | null>;
    onFinish: () => void;
  } = $props();

  const steps: Step[] = $derived(
    includesSetup
      ? ["unlock", "lateNight", "scheduleBlocks", "setup", "done"]
      : ["unlock", "lateNight", "scheduleBlocks"],
  );
  let stepIndex = $state(0);
  const step = $derived(steps[stepIndex]!);
  const canGoBack = $derived(stepIndex > 0 && step !== "done");

  const sleepName = t("schedules_firstScheduleDefaultName");
  const sleepDefaults = sleepScheduleDraft(sleepName);
  let draftName = $state(sleepDefaults.name);
  let draftStart = $state(minuteToTimeStr(sleepDefaults.startMinute));
  let draftEnd = $state(minuteToTimeStr(sleepDefaults.endMinute));
  let draftWeekdayMask = $state(sleepDefaults.weekdayMask);
  let savedSchedule = $state<RelockrSchedule | null>(null);
  let isSaving = $state(false);
  const canConfirm = $derived(draftWeekdayMask !== 0 && !isSaving);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function minuteToTimeStr(minute: number): string {
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  }
  function timeStrToMinute(value: string): number {
    const [h, m] = value.split(":").map((n) => parseInt(n, 10));
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  }

  function advance() {
    if (stepIndex + 1 < steps.length) stepIndex += 1;
    else onFinish();
  }

  function goBack() {
    if (canGoBack) stepIndex -= 1;
    else onFinish();
  }

  async function saveSleepSchedule() {
    if (!canConfirm) return;
    isSaving = true;
    const saved = await createSchedule({
      ...sleepDefaults,
      name: draftName.trim() || sleepName,
      startMinute: timeStrToMinute(draftStart),
      endMinute: timeStrToMinute(draftEnd),
      weekdayMask: draftWeekdayMask,
    });
    isSaving = false;
    // On failure the tab says why; the user lands back on it to see it.
    if (!saved) {
      onFinish();
      return;
    }
    savedSchedule = saved;
    stepIndex = steps.indexOf("done");
  }

  function onKeydown(event: KeyboardEvent) {
    // Escape steps back through the slides, and only leaves from the first one.
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      goBack();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="tutorial">
  <div class="top-bar">
    <button
      class="icon-btn"
      class:hidden={!canGoBack}
      disabled={!canGoBack}
      aria-label={t("common_back")}
      onclick={() => (stepIndex -= 1)}
    >
      <ChevronLeft size={20} strokeWidth={2.25} />
    </button>
    <!-- Between back and close, so it costs no height in the popup. -->
    <div class="progress" aria-hidden="true">
      {#each steps as _, index}
        <span class="progress-segment" class:filled={index <= stepIndex}></span>
      {/each}
    </div>
    <button
      class="icon-btn subtle"
      class:hidden={step === "done"}
      disabled={step === "done"}
      aria-label={t("common_close")}
      onclick={onFinish}
    >
      <X size={18} strokeWidth={2.25} />
    </button>
  </div>

  <div class="pages">
    {#key step}
      <div class="page" transition:fade={{ duration: reduceMotion ? 0 : 250 }}>
        {#if step === "unlock" || step === "lateNight" || step === "scheduleBlocks"}
          <!-- Text first, then the illustration in the space left over, then the CTA. -->
          <div class="page-top">
            <TypingTitle
              text={step === "unlock"
                ? t("schedules_tutorialUnlockTitleWeb")
                : step === "lateNight"
                  ? t("schedules_tutorialLateNightTitleWeb")
                  : t("schedules_tutorialScheduleTitle")}
            />
            {#if step === "scheduleBlocks"}
              <p class="body appear" style:animation-delay="100ms">{t("schedules_tutorialScheduleBodyWeb")}</p>
            {/if}
          </div>
          <div class="page-middle appear" style:animation-delay="200ms">
            {#if step === "unlock"}
              <SchedulesTutorialDemo variant="unlock" />
            {:else if step === "lateNight"}
              <SchedulesTutorialNightClock />
            {:else}
              <SchedulesTutorialDemo variant="scheduleBlocks" />
            {/if}
          </div>
          <div class="page-footer">
            <button class="cta" onclick={advance}>
              {step === "scheduleBlocks" && !includesSetup ? t("common_done") : t("common_next")}
            </button>
          </div>
        {:else if step === "setup"}
          <!-- The schedule card's own time and day editors, without mode or rule linking: a Sleep schedule blocks during its window and covers every rule. -->
          <div class="page-top">
            <TypingTitle text={t("schedules_tutorialSetupTitle")} />
            <p class="body appear" style:animation-delay="100ms">{t("schedules_tutorialSetupBody")}</p>
            <div class="setup-card appear" style:animation-delay="200ms">
              <div class="name-row">
                <MoonGlyph size={18} color="#8b80e8" />
                <input
                  class="name-input"
                  bind:value={draftName}
                  aria-label={t("scheduleCard_scheduleNamePlaceholder")}
                  placeholder={t("scheduleCard_scheduleNamePlaceholder")}
                />
              </div>
              <div class="divider"></div>
              <ScheduleTimeSection bind:start={draftStart} bind:end={draftEnd} />
              <div class="divider"></div>
              <ScheduleWeekdaySection bind:mask={draftWeekdayMask} />
            </div>
          </div>
          <div class="page-footer">
            <button class="cta" disabled={!canConfirm} onclick={saveSleepSchedule}>
              {t("schedules_tutorialSetupConfirm")}
            </button>
            <button class="not-now" onclick={onFinish}>{t("common_notNow")}</button>
          </div>
        {:else}
          <div class="page-top">
            <TypingTitle text={t("schedules_tutorialDoneTitle")} />
            {#if savedSchedule}
              <p class="body appear" style:animation-delay="100ms">
                {t("schedules_tutorialDoneBodyFormat", [
                  formatScheduleMinute(savedSchedule.startMinute),
                  formatScheduleMinute(savedSchedule.endMinute),
                ])}
              </p>
              <!-- A picture of the saved schedule, not a control. -->
              <div class="saved-card appear" style:animation-delay="300ms" inert>
                <ScheduleCard
                  schedule={savedSchedule}
                  linkedRuleIds={[]}
                  allRules={[]}
                  isExpanded={false}
                  onToggleExpanded={() => {}}
                  onUpdate={() => {}}
                  onSetLinkedRules={() => {}}
                  onDelete={() => {}}
                  showsEditButton={false}
                />
              </div>
            {/if}
          </div>
          <div class="page-footer">
            <button class="cta" onclick={onFinish}>{t("common_done")}</button>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</section>

<style>
  .tutorial {
    display: flex;
    flex-direction: column;
    /*
     * Fills the popup (the header and tab bar are hidden while it shows), and
     * holds it at one height across slides instead of resizing it on every
     * step. The popup tops out at 600px, less main's 12px top padding.
     */
    min-height: 572px;
    box-sizing: border-box;
    padding: 0 16px 16px;
  }

  .top-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: -4px -8px 0;
  }
  .icon-btn {
    all: unset;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.92);
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .icon-btn.subtle {
    color: var(--rl-subtitle);
  }
  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .icon-btn:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
  }
  .icon-btn.hidden {
    visibility: hidden;
  }

  .pages {
    flex: 1;
    display: grid;
  }
  .page {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
  }
  .page-top {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .page-middle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
  }
  .page-footer {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .body {
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
    color: var(--rl-subtitle);
  }

  .appear {
    animation: appear 400ms ease both;
  }
  @keyframes appear {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .appear {
      animation: none;
    }
  }

  .cta {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 13px;
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    background: var(--rl-gradient);
    border-radius: 14px;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.12s ease;
  }
  .cta:hover {
    opacity: 0.9;
  }
  .cta:active {
    transform: scale(0.98);
  }
  .cta:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .cta:disabled {
    opacity: 0.5;
    cursor: default;
    transform: none;
  }
  .not-now {
    all: unset;
    padding: 9px;
    text-align: center;
    font-size: 14px;
    color: var(--rl-subtitle);
    border-radius: 12px;
    cursor: pointer;
  }
  .not-now:hover {
    color: rgba(255, 255, 255, 0.85);
  }

  .setup-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 4px;
    padding: 14px;
    background: var(--rl-card-bg);
    border: 1px solid var(--rl-card-border);
    border-radius: 16px;
  }
  .name-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .name-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    color: rgba(255, 255, 255, 0.95);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    padding: 2px 0;
  }
  .name-input:focus {
    outline: none;
    border-bottom-color: var(--rl-accent-blue);
  }
  .divider {
    height: 1px;
    background: var(--rl-divider);
  }

  .saved-card {
    margin-top: 4px;
  }

  .progress {
    flex: 1;
    display: flex;
    gap: 5px;
  }
  .progress-segment {
    flex: 1;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    transition: background 0.25s ease;
  }
  .progress-segment.filled {
    background: var(--rl-gradient);
  }
</style>
