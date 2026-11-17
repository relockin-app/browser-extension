<script lang="ts">
  import { onMount } from "svelte";
  import { createWxtStorage } from "~/storage";
  import GuardrailsTab from "~/lib/GuardrailsTab.svelte";
  import WebCustomizationsTab from "~/lib/WebCustomizationsTab.svelte";
  import LimitsTab from "~/lib/LimitsTab.svelte";
  import UsageTab from "~/lib/UsageTab.svelte";
  import SchedulesTab from "~/lib/SchedulesTab.svelte";
  import AccountTab from "~/lib/AccountTab.svelte";
  import InstallOnboarding from "~/lib/onboarding/InstallOnboarding.svelte";
  import OnboardingResumeCard from "~/lib/onboarding/OnboardingResumeCard.svelte";
  import RelockInLogo from "~/lib/RelockInLogo.svelte";
  import { Globe, Hourglass, BarChart3, CalendarClock, Shield, UserRound } from "@lucide/svelte";
  import { t } from "~/lib/i18n";
  import { setGuardrailsNavigator } from "~/shared/challenges/guardrailsNavigation";

  const ONBOARDING_KEY = "local:onboardingCompleted";

  type Tab = "web" | "limits" | "usage" | "schedules" | "guardrails" | "account";
  // Opened as a tab at #account to sign in, e.g. from a vote on YouTube (see openSignIn in the background).
  let activeTab = $state<Tab>(location.hash === "#account" ? "account" : "web");
  let showOnboarding = $state<boolean | null>(null);
  // Opened as a tab at #setup-limits from the Limits tab, for users who skipped limits at install.
  let showLimitsSetup = $state(location.hash === "#setup-limits");
  // Onboarding needs a whole tab; the toolbar popup only offers to open one.
  let isInTab = $state(false);
  // The schedules tutorial takes over the whole popup, so it fits without scrolling.
  let isSchedulesTutorialShown = $state(false);

  const store = createWxtStorage();

  // The toolbar popup on a computer sizes its window from our width, so only a
  // screen that sets the width for us (a phone, a tab, the setup tour's frame) can fit to it.
  // Going by the real screen, the dev device override still gets a full-size toolbar popup.
  let fitsScreen = $derived(isInTab || window.self !== window.top || Math.min(screen.width, screen.height) <= 417);

  const tabs: { id: Tab; label: string; icon: typeof Globe }[] = [
    { id: "web", label: t("main_tabSettings"), icon: Globe },
    { id: "limits", label: t("main_tabLimits"), icon: Hourglass },
    { id: "usage", label: t("usage_title"), icon: BarChart3 },
    { id: "schedules", label: t("schedules_title"), icon: CalendarClock },
    { id: "guardrails", label: t("main_protectionTitle"), icon: Shield },
  ];
  // Account isn't in the tab bar: like on mobile, it opens from the header icon.

  onMount(async () => {
    const completed = await storage.getItem<boolean>(ONBOARDING_KEY);
    isInTab = (await browser.tabs.getCurrent()) !== undefined;
    // #onboarding replays it even when finished: the dev-only relaunch button in the Limits tab.
    // A tab opened at #account is there to sign in, so it shows that even mid-setup.
    showOnboarding = (!completed && location.hash !== "#account") || (import.meta.env.DEV && location.hash === "#onboarding");
  });

  async function skipOnboarding(): Promise<void> {
    await storage.setItem(ONBOARDING_KEY, true);
    showOnboarding = false;
  }

  onMount(() =>
    setGuardrailsNavigator(() => {
      activeTab = "guardrails";
    }),
  );
</script>

<main class:fits-screen={fitsScreen}>
  {#if showOnboarding === null}
    <!-- Loading -->
  {:else if showLimitsSetup && isInTab && !showOnboarding}
    <InstallOnboarding
      {store}
      flow="limits"
      oncomplete={() => {
        showLimitsSetup = false;
        activeTab = "limits";
        history.replaceState(null, "", location.pathname);
      }}
    />
  {:else if showOnboarding && isInTab}
    <InstallOnboarding {store} oncomplete={() => (showOnboarding = false)} />
  {:else if showOnboarding}
    <OnboardingResumeCard onskip={skipOnboarding} />
  {:else}
    {#if !isSchedulesTutorialShown}
    <header>
      <button
        class="logoBtn"
        onclick={() => {
          browser.tabs.create({ url: browser.runtime.getURL("/popup.html") });
          window.close();
        }}
        title={t("main_openFullPage")}
      >
        <RelockInLogo size={28} />
      </button>
      <button
        class="accountBtn"
        class:active={activeTab === "account"}
        onclick={() => (activeTab = "account")}
        title={t("main_tabAccount")}
        aria-label={t("main_tabAccount")}
      >
        <UserRound size={20} strokeWidth={activeTab === "account" ? 2 : 1.6} />
      </button>
    </header>

    <nav class="tab-bar">
      {#each tabs as tab}
        <button
          class="tab-item"
          class:active={activeTab === tab.id}
          onclick={() => (activeTab = tab.id)}
        >
          <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2 : 1.6} />
          <span class="tab-label">{tab.label}</span>
        </button>
      {/each}
    </nav>
    {/if}

    <div class="tab-content">
      {#if activeTab === "web"}
        <WebCustomizationsTab />
      {:else if activeTab === "limits"}
        <LimitsTab {store} />
      {:else if activeTab === "usage"}
        <UsageTab {store} />
      {:else if activeTab === "schedules"}
        <SchedulesTab {store} onTutorialShownChange={(shown) => (isSchedulesTutorialShown = shown)} />
      {:else if activeTab === "guardrails"}
        <GuardrailsTab />
      {:else}
        <AccountTab />
      {/if}
    </div>
  {/if}
</main>

<style>
  .logoBtn {
    all: unset;
    cursor: pointer;
    margin-left: auto;
    margin-right: auto;
    display: flex;
    /* Mark and wordmark are dimmed like the unselected tabs so they don't compete with the page title, and turn blue on
       hover because the logo opens the full page. The mark is sized to the wordmark's capitals. */
    color: rgba(255, 255, 255, 0.4);
    --rl-logo-mark-color: currentColor;
    --rl-logo-mark-height: 1cap;
    transition: color 0.2s ease;
  }

  .logoBtn:hover {
    color: var(--rl-accent-blue);
  }

  main {
    width: 400px;
    padding: 12px 0 0;
    display: flex;
    flex-direction: column;
  }

  .accountBtn {
    all: unset;
    position: absolute;
    right: 12px;
    /* Centre on the logo, not the header's bottom padding. */
    top: calc(50% - 4px);
    transform: translateY(-50%);
    display: flex;
    padding: 6px;
    border-radius: 50%;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.55);
    transition: color 0.2s ease, background-color 0.2s ease;
  }

  .accountBtn:hover {
    color: rgba(255, 255, 255, 0.8);
    background-color: rgba(255, 255, 255, 0.06);
  }

  .accountBtn.active {
    color: var(--rl-accent-blue);
  }

  header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px 8px;
  }

  /* ── Tab Bar ──────────────────────────────────────────────── */

  .tab-bar {
    display: flex;
    padding: 0 8px;
    gap: 2px;
    border-bottom: 1px solid var(--rl-divider);
  }

  .tab-item {
    all: unset;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 0 7px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    color: rgba(255, 255, 255, 0.35);
    transition: color 0.2s ease, border-color 0.2s ease;
  }

  .tab-item:hover {
    color: rgba(255, 255, 255, 0.55);
  }

  .tab-item.active {
    color: var(--rl-accent-blue);
    border-bottom-color: var(--rl-accent-blue);
  }

  .tab-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.2px;
    line-height: 1;
  }

  /* ── Tab Content ──────────────────────────────────────────── */

  .tab-content {
    padding-bottom: 16px;
  }

  /* Narrower than the setup tour's frame on a computer, which keeps the full width. */
  @media (max-width: 417px) {
    :global(#app:has(> main.fits-screen)) {
      display: block;
      width: 100%;
      min-width: 0;
    }

    main.fits-screen {
      width: 100%;
      box-sizing: border-box;
    }
  }

  @media (min-width: 480px) {
    main {
      width: 420px;
    }
  }
</style>
