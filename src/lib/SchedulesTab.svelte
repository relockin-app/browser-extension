<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type {
    RelockrRule,
    RelockrSchedule,
    OnboardingState,
  } from "~/types/models";
  import type { ReelockrStorage } from "~/storage";
  import ScheduleCard from "./ScheduleCard.svelte";
  import TabHeader from "./TabHeader.svelte";
  import CoachMark from "./CoachMark.svelte";
  import SchedulesTutorial from "./SchedulesTutorial.svelte";
  import {
    hasSeenSchedulesTutorial,
    isMoreSchedulesTipPending,
    setHasSeenSchedulesTutorial,
    setMoreSchedulesTipPending,
    sleepScheduleDraft,
  } from "./schedulesTutorial";
  import { CalendarClock } from "@lucide/svelte";
  import AppUpsellCard from "./AppUpsellCard.svelte";
  import { FREE_SCHEDULE_LIMIT, useProAccess } from "./proAccess.svelte";
  import { t } from "./i18n";

  const ONBOARDING_STATE_KEY = "local:onboardingState";

  let {
    store,
    onTutorialShownChange,
  }: {
    store: ReelockrStorage;
    /** Lets the popup hide its header and tab bar while the tutorial fills it. */
    onTutorialShownChange?: (shown: boolean) => void;
  } = $props();

  interface ScheduleItem {
    schedule: RelockrSchedule;
    linkedRuleIds: string[];
  }

  let items = $state<ScheduleItem[]>([]);
  let rules = $state<RelockrRule[]>([]);
  let ruleOnboardingDone = $state(false);
  let expandedScheduleId = $state<string | null>(null);
  let ready = $state(false);

  // Schedules tutorial: opens on the first visit once rules are set up.
  let isTutorialPresented = $state(false);
  let tutorialIncludesSetup = $state(true);
  // The automatic first showing, as opposed to a replay from "How it works".
  let isInitialTutorialRun = false;
  let moreSchedulesTipPending = $state(false);

  const unsubscribers: Array<() => void> = [];
  const pro = useProAccess();
  const atScheduleLimit = $derived(pro.limited && items.length >= FREE_SCHEDULE_LIMIT);

  const limitsCompleted = $derived(ruleOnboardingDone || rules.length > 0);
  const showHowItWorks = $derived(limitsCompleted);
  // Only once the tutorial is out of the way, so it greets the user on the tab.
  // It suggests adding another, which the free version on a phone can't.
  const showMoreSchedulesTip = $derived(moreSchedulesTipPending && !isTutorialPresented && !atScheduleLimit);

  onMount(async () => {
    moreSchedulesTipPending = await isMoreSchedulesTipPending();
    await reload();
    ready = true;

    // Anyone who already has a schedule clearly knows what they're for, so
    // they're marked as having seen it instead.
    if (limitsCompleted && !(await hasSeenSchedulesTutorial())) {
      if (items.length > 0) {
        await setHasSeenSchedulesTutorial(true);
      } else {
        presentTutorial();
        isInitialTutorialRun = true;
      }
    }

    unsubscribers.push(store.watchSchedules(() => reload()));
    unsubscribers.push(store.watchScheduleLinks(() => reload()));
    unsubscribers.push(store.watchRules((r) => (rules = r)));
  });

  $effect(() => {
    onTutorialShownChange?.(isTutorialPresented);
  });

  onDestroy(() => {
    for (const unsub of unsubscribers) unsub();
    onTutorialShownChange?.(false);
  });

  async function reload() {
    rules = await store.getAllRules();
    const state = await storage.getItem<OnboardingState>(ONBOARDING_STATE_KEY);
    ruleOnboardingDone = state?.ruleOnboardingCompleted === true;
    const withLinks = await store.getSchedulesWithLinks();
    items = withLinks.map((w) => ({
      schedule: w.schedule,
      linkedRuleIds: [...w.linkedRuleIds],
    }));
  }

  function toggleExpanded(scheduleId: string) {
    expandedScheduleId =
      expandedScheduleId === scheduleId ? null : scheduleId;
  }

  async function updateSchedule(updated: RelockrSchedule) {
    await store.updateSchedule(updated);
    await reload();
  }

  async function setLinkedRules(scheduleId: string, ruleIds: string[]) {
    await store.setLinkedRules(scheduleId, new Set(ruleIds));
    await reload();
  }

  async function deleteSchedule(scheduleId: string) {
    await store.deleteSchedule(scheduleId);
    if (expandedScheduleId === scheduleId) expandedScheduleId = null;
    await reload();
  }

  /**
   * The first schedule defaults to a Sleep window (11PM–6AM, every day); later
   * schedules default to a 9–5 weekday focus block. Mirrors the iOS defaults.
   */
  async function addSchedule() {
    if (moreSchedulesTipPending) dismissMoreSchedulesTip();
    const isFirst = items.length === 0;
    const input = isFirst
      ? sleepScheduleDraft(t("schedules_firstScheduleDefaultName"))
      : {
          name: t("scheduleCard_defaultScheduleName"),
          startMinute: 9 * 60,
          endMinute: 17 * 60,
          isEnabled: true,
          mode: 0,
          weekdayMask: 0b0111110, // Mon–Fri
          shouldAutoApplyToNewRules: true,
        };

    const created = await createSchedule(input);
    expandedScheduleId = created.id;
  }

  /** Saves a new schedule and links it to every existing rule. */
  async function createSchedule(input: ReturnType<typeof sleepScheduleDraft>): Promise<RelockrSchedule> {
    const created = await store.createSchedule(input);
    const ruleIds = rules.map((r) => r.id);
    if (ruleIds.length > 0) {
      await store.setLinkedRules(created.id, new Set(ruleIds));
    }
    await reload();
    return created;
  }

  function presentTutorial() {
    tutorialIncludesSetup = items.length === 0;
    isTutorialPresented = true;
  }

  async function finishTutorial() {
    isTutorialPresented = false;
    await setHasSeenSchedulesTutorial(true);
    // After the first run-through the tip always follows, whether or not they saved a Sleep schedule.
    if (isInitialTutorialRun) {
      isInitialTutorialRun = false;
      moreSchedulesTipPending = true;
      await setMoreSchedulesTipPending(true);
    }
  }

  function dismissMoreSchedulesTip() {
    moreSchedulesTipPending = false;
    void setMoreSchedulesTipPending(false);
  }
</script>

{#if isTutorialPresented}
  <SchedulesTutorial
    includesSetup={tutorialIncludesSetup}
    createSchedule={async (input) => {
      try {
        return await createSchedule(input);
      } catch (e) {
        console.error("Schedules tutorial: failed to save the Sleep schedule", e);
        return null;
      }
    }}
    onFinish={finishTutorial}
  />
{:else}
<TabHeader title={t("schedules_title")} subtitle={t("schedules_subtitle")}>
  {#if showHowItWorks}
    <button class="how-it-works" onclick={presentTutorial}>{t("common_howItWorks")}</button>
  {/if}
</TabHeader>

<section class="schedules-page">
  {#if !ready || !pro.ready}
    <!-- Loading -->
  {:else}
    {#if !limitsCompleted}
      <div class="empty">
        <div class="empty-icon"><CalendarClock size={40} strokeWidth={1.5} /></div>
        <h2>{t("schedules_limitsNotReadyHeadline")}</h2>
        <p>{t("schedules_limitsNotReadyBody")}</p>
      </div>
    {:else if items.length === 0}
      <div class="empty">
        <div class="empty-icon"><CalendarClock size={40} strokeWidth={1.5} /></div>
        <h2>{t("schedules_noSchedulesHeadline")}</h2>
        <p>{t("schedules_noSchedulesBody")}</p>
      </div>
    {:else}
      <div class="card-list">
        {#each items as item (item.schedule.id)}
          <ScheduleCard
            schedule={item.schedule}
            linkedRuleIds={item.linkedRuleIds}
            allRules={rules}
            isExpanded={expandedScheduleId === item.schedule.id}
            onToggleExpanded={() => toggleExpanded(item.schedule.id)}
            onUpdate={(s) => updateSchedule(s)}
            onSetLinkedRules={(ids) => setLinkedRules(item.schedule.id, ids)}
            onDelete={() => deleteSchedule(item.schedule.id)}
          />
        {/each}
      </div>
    {/if}

    {#if limitsCompleted}
      {#if showMoreSchedulesTip}
        <div class="tip">
          <CoachMark
            id="moreSchedules"
            title={t("schedules_moreSchedulesTipTitle")}
            body={t("schedules_moreSchedulesTipBody")}
            tail="bottom"
            variant="muted"
            ondismiss={dismissMoreSchedulesTip}
          />
        </div>
      {/if}
      {#if atScheduleLimit}
        <AppUpsellCard title={t("phoneWebext_scheduleLimitTitle")} />
      {:else}
        <button class="add-btn" onclick={addSchedule}>{t("schedules_addSchedule")}</button>
      {/if}
    {/if}
  {/if}
</section>
{/if}
<style>
  .schedules-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0 16px 12px;
  }

  .how-it-works {
    all: unset;
    align-self: flex-start;
    margin-top: 2px;
    font-size: 12px;
    font-weight: 600;
    color: var(--rl-accent-blue);
    cursor: pointer;
  }

  .tip :global(.coach-mark) {
    margin: 0 0 6px;
  }
  .card-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
    padding: 40px 24px;
  }
  .empty-icon {
    color: rgba(255, 255, 255, 0.3);
  }
  .empty h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8);
  }
  .empty p {
    margin: 0;
    font-size: 13px;
    color: var(--rl-subtitle);
    max-width: 260px;
    line-height: 1.45;
  }

  .add-btn {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    background: var(--rl-gradient);
    border-radius: 14px;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.12s ease;
  }
  .add-btn:hover {
    opacity: 0.9;
  }
  .add-btn:active {
    opacity: 0.85;
    transform: scale(0.98);
  }
</style>
