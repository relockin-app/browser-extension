<script lang="ts">
  import { onMount } from "svelte";
  import { Hourglass, Wrench } from "@lucide/svelte";
  import type { RelockrRule, OnboardingState } from "~/types/models";
  import type { ReelockrStorage } from "~/storage";
  import RuleCard from "./RuleCard.svelte";
  import RuleChallengeOverridesSheet from "./RuleChallengeOverridesSheet.svelte";
  import CoachMark from "./CoachMark.svelte";
  import TabHeader from "./TabHeader.svelte";
  import AppUpsellCard from "./AppUpsellCard.svelte";
  import DevDeviceToggle from "./DevDeviceToggle.svelte";
  import { FREE_RULE_LIMIT, useProAccess } from "./proAccess.svelte";
  import { t } from "./i18n";

  const ONBOARDING_STATE_KEY = "local:onboardingState";

  let { store }: { store: ReelockrStorage } = $props();

  let rules = $state<RelockrRule[]>([]);
  let overrideTarget = $state<{ ruleId: string; ruleName: string } | null>(null);
  let ready = $state(false);
  /** No rules yet and the guided setup never finished: offer it in a full tab. */
  let showSetupCard = $state(false);
  const pro = useProAccess();
  // Rules made beyond it (say, before a dev override) keep applying; only adding is stopped.
  const atRuleLimit = $derived(pro.limited && rules.length >= FREE_RULE_LIMIT);

  onMount(async () => {
    rules = await store.getAllRules();
    const state = await storage.getItem<OnboardingState>(ONBOARDING_STATE_KEY);
    const ruleOnboardingDone = state?.ruleOnboardingCompleted === true;
    showSetupCard = rules.length === 0 && !ruleOnboardingDone;
    ready = true;
  });

  async function openLimitsSetup(): Promise<void> {
    await browser.tabs.create({ url: browser.runtime.getURL("/popup.html#setup-limits") });
    // Close the toolbar popup, but not a full-page tab the user opened themselves.
    if ((await browser.tabs.getCurrent()) === undefined) window.close();
  }

  async function addRule(): Promise<void> {
    const rule = await store.createRule({
      name: t("rule_defaultRuleName"),
      allowedSeconds: 60 * 60,
    });
    rules = [...rules, rule];
  }

  function handleRuleUpdated(index: number, updated: RelockrRule) {
    rules[index] = updated;
    rules = rules;
  }

  function handleRuleDeleted(index: number) {
    rules = rules.filter((_, i) => i !== index);
  }
</script>

{#if !ready || !pro.ready}
  <!-- Loading -->
{:else if overrideTarget}
  <RuleChallengeOverridesSheet
    ruleId={overrideTarget.ruleId}
    ruleName={overrideTarget.ruleName}
    onBack={() => overrideTarget = null}
  />
{:else}
  <TabHeader
    title={t("limits_webextRulesTitle")}
    subtitle={t("limits_webextRulesDescription")}
  />
  <section class="limits-page">
    <!-- It explains rule cards, so it waits until there are some. -->
    {#if rules.length > 0}
      <CoachMark
        id="limitsTab"
        title={t("onboardingWebext_coachMarkLimitsTabTitle")}
        body={t("onboardingWebext_coachMarkLimitsTabBody")}
        tail="bottom"
      />
    {/if}

    {#each rules as rule, i (rule.id)}
      <RuleCard
        {rule}
        {store}
        onDeleted={() => handleRuleDeleted(i)}
        onUpdated={(r) => handleRuleUpdated(i, r)}
        onCustomizeChallenges={() => overrideTarget = { ruleId: rule.id, ruleName: rule.name }}
      />
    {/each}

    {#if showSetupCard && rules.length === 0}
      <div class="setup-card">
        <span class="setup-icon"><Hourglass size={22} strokeWidth={2} /></span>
        <p class="setup-title">{t("onboardingWebext_limitsSetupTitle")}</p>
        <p class="setup-body">{t("onboardingWebext_limitsSetupBody")}</p>
        <button class="add-rule-btn" onclick={openLimitsSetup}>{t("onboardingWebext_limitsSetupCta")}</button>
      </div>
    {:else if rules.length === 0}
      <p class="empty-state">{t("limits_noRulesEmptyState")}</p>
    {/if}

    <!-- Until the guided setup is done, it's the one way in: a blank rule
         would only raise the question of what to put in it. -->
    {#if atRuleLimit}
      <AppUpsellCard title={t("phoneWebext_ruleLimitTitle")} />
    {:else if !(showSetupCard && rules.length === 0)}
      <button class="add-rule-btn" onclick={addRule}>{t("limits_addRule")}</button>
    {/if}

    {#if import.meta.env.DEV}
      <!-- Dev builds only, so not translated. -->
      <div class="dev-row">
        <button
          class="dev-btn"
          onclick={() => browser.tabs.create({ url: browser.runtime.getURL("/popup.html#onboarding") })}
        >
          Relaunch onboarding
        </button>
        <DevDeviceToggle />
        <!-- Same badge as dev-only settings in WebCustomizationsTab. -->
        <span class="dev-badge" title="DEV-ONLY" aria-label="DEV-ONLY">
          <Wrench size={12} strokeWidth={2.5} aria-hidden="true" />
        </span>
      </div>
    {/if}
  </section>
{/if}

<style>
  .limits-page {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px 12px;
  }

  .empty-state {
    margin: 8px 0;
    text-align: center;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.3);
  }

  .setup-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 24px 20px 20px;
    border-radius: 16px;
    background: rgba(115, 158, 235, 0.08);
    border: 1px solid rgba(115, 158, 235, 0.25);
    text-align: center;
  }

  .setup-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    margin-bottom: 6px;
    border-radius: 50%;
    background: var(--rl-gradient);
    color: #1a1a1a;
  }

  .setup-title {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
  }

  .setup-body {
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--rl-subtitle);
  }

  .setup-card .add-rule-btn {
    align-self: stretch;
  }

  .add-rule-btn {
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

  .add-rule-btn:hover {
    opacity: 0.9;
  }

  .dev-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  }

  .dev-btn {
    all: unset;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
  }

  .dev-btn:hover {
    color: #fff;
  }

  .dev-badge {
    display: inline-flex;
    color: #f5c542;
    cursor: help;
  }

  .add-rule-btn:active {
    opacity: 0.85;
    transform: scale(0.98);
  }
</style>
