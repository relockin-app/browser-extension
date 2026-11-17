<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade, fly, scale, slide } from "svelte/transition";
  import {
    Sparkles,
    Hourglass,
    Check,
    ArrowLeft,
    ArrowRight,
    ChevronDown,
    Minus,
    Plus,
    SlidersHorizontal,
    Moon,
    X,
    Vote,
  } from "@lucide/svelte";
  import { requestAccountConsent } from "@/shared/dataConsent";
  import AuthProviderButton from "../AuthProviderButton.svelte";
  import EmailAuthDialog from "../EmailAuthDialog.svelte";
  import LegalNotice from "../LegalNotice.svelte";
  import { SOURCE_CODE_URL } from "~/shared/sourceCode";

  // Marker substituted into the translated sentence, so the link can sit wherever the language puts it.
  const SOURCE_LINK = "\u0001";
  const sourceNoteParts = t("onboardingWebext_welcomeSourceNote", [SOURCE_LINK]).split(/(\u0001)/).filter(Boolean);
  import type { User } from "@supabase/supabase-js";
  import type { ReelockrStorage } from "~/storage";
  import type { OnboardingGoal, OnboardingSiteKey, OnboardingState } from "~/types/models";
  import { AiContentTreatment } from "~/types/enums";
  import { SettingsKey } from "~/shared/settings/settingsKey";
  import { SETTINGS_DEFAULTS } from "~/shared/settings/settingsDefaults";
  import {
    createRulesFromSurvey,
    DEFAULT_ALLOWED_SECONDS,
    planRulesFromSurvey,
  } from "~/shared/createRulesFromSurvey";
  import { APP_STORE_URL, PLAY_STORE_URL, phoneStore } from "~/shared/upsell/storeUrls";
  import {
    getCurrentUser,
    isAppleSignInSupported,
    isGoogleSignInSupported,
    onAuthStateChange,
    signInWithApple,
    signInWithGoogle,
  } from "~/shared/relockrAuthHelper";
  import { t, tp } from "../i18n";
  import ProBadge from "../ProBadge.svelte";
  import DevDeviceToggle from "../DevDeviceToggle.svelte";
  import { useProAccess } from "../proAccess.svelte";
  import { requiresPro, withoutProSettings } from "~/shared/pro/proSettings";
  import {
    buildOnboardingSteps,
    GOAL_QUESTIONS,
    type OnboardingFlowKind,
    type OnboardingStepId,
  } from "./onboardingSteps";
  import Slide from "./Slide.svelte";
  import AiFeedMock from "./visuals/AiFeedMock.svelte";
  import RobotIcon from "./visuals/RobotIcon.svelte";
  import ShortsMock from "./visuals/ShortsMock.svelte";
  import VoteMock from "./visuals/VoteMock.svelte";
  import LimitsDemo from "./visuals/LimitsDemo.svelte";
  import SiteTweaks, { countTweaksOn, SITES } from "./visuals/SiteTweaks.svelte";
  import AiThumbColumns from "./visuals/AiThumbColumns.svelte";
  import { AI_THUMB_COLUMNS_HIDDEN_QUERY } from "./visuals/aiThumbnails";
  import PhoneMock from "./visuals/PhoneMock.svelte";
  import PinMock from "./visuals/PinMock.svelte";
  import RelockInLogo from "../RelockInLogo.svelte";

  interface Props {
    store: ReelockrStorage;
    flow?: OnboardingFlowKind;
    /** Leaves onboarding for the main extension UI in this tab. */
    oncomplete: () => void;
  }

  let { store, flow = "install", oncomplete }: Props = $props();

  const SETTINGS_KEY = "local:reelockrSettings";
  const ONBOARDING_KEY = "local:onboardingCompleted";
  const ONBOARDING_STATE_KEY = "local:onboardingState";
  const YOUTUBE_URL = "https://www.youtube.com/";
  const MAX_LIMIT_MINUTES = 24 * 60;
  const LIMIT_STEP_MINUTES = 5;

  const AI_OPTIONS: { value: AiContentTreatment; label: string; desc: string }[] = [
    { value: AiContentTreatment.Cover, label: t("settings_ytAiContentCover"), desc: t("settings_ytAiContentCoverDesc") },
    { value: AiContentTreatment.Badge, label: t("settings_ytAiContentBadge"), desc: t("settings_ytAiContentBadgeDesc") },
    { value: AiContentTreatment.Hide, label: t("settings_ytAiContentHide"), desc: t("settings_ytAiContentHideDesc") },
    { value: AiContentTreatment.Off, label: t("settings_ytAiContentOff"), desc: t("settings_ytAiContentOffDesc") },
  ];

  /**
   * Each question's hero: `sites` shows those sites' icons, `iconSrc` a white
   * PNG drawn as a mask, otherwise `icon` is a Lucide icon.
   */
  const GOAL_COPY: Record<
    OnboardingGoal,
    { title: string; body: string; icon?: typeof Sparkles; iconSrc?: string; sites?: string[] }
  > = {
    aiContent: { title: t("onboardingWebext_goalAiTitle"), body: t("onboardingWebext_goalAiBody"), icon: Sparkles },
    customizeSites: {
      title: t("onboardingWebext_goalCustomizeTitle"),
      body: t("onboardingWebext_goalCustomizeBody"),
      // The sites RelockIn can customize, so the question says what it covers.
      sites: SITES.map((site) => site.icon),
    },
    screenTime: { title: t("onboardingWebext_goalLimitsTitle"), body: t("onboardingWebext_goalLimitsBody"), icon: Hourglass },
  };

  /** How long the AI thumbnails show as zapped before moving on. */
  const AI_ZAP_MS = 950;
  /** How long the acknowledgement after the questions stays before moving on. */
  const ACK_MS = 2600;
  /** Where the main progress bar starts: the questions already count for something. */
  const PROGRESS_HEAD_START = 0.15;


  const SITE_OPTIONS: { key: OnboardingSiteKey; label: string; icon: string; domain: string }[] = [
    { key: "youtube", label: "YouTube", icon: "/images/apps/youtube.png", domain: "youtube.com" },
    { key: "instagram", label: "Instagram", icon: "/images/apps/instagram.png", domain: "instagram.com" },
    { key: "tiktok", label: "TikTok", icon: "/images/apps/tiktok.png", domain: "tiktok.com" },
    { key: "reddit", label: "Reddit", icon: "/images/apps/reddit.png", domain: "reddit.com" },
    { key: "x", label: "X", icon: "/images/apps/x.png", domain: "x.com" },
    { key: "facebook", label: "Facebook", icon: "/images/apps/facebook.png", domain: "facebook.com" },
    { key: "linkedin", label: "LinkedIn", icon: "/images/apps/linkedin.png", domain: "linkedin.com" },
    { key: "pinterest", label: "Pinterest", icon: "/images/apps/pinterest.svg", domain: "pinterest.com" },
  ];

  // ── Flow state ────────────────────────────────────────────────
  let goals = $state(new Set<OnboardingGoal>());
  /** Opted in on the time limits introduction, which adds the site picker. */
  let limitsOptIn = $state(false);
  const pro = useProAccess();
  const appStore = phoneStore();
  let steps = $derived(buildOnboardingSteps(flow, goals, limitsOptIn, pro.access.isPhone));
  let index = $state(0);
  let stepId = $derived<OnboardingStepId>(steps[index]);
  /** -1 going back, so slides enter from the other side. */
  let direction = $state(1);

  // ── Choices ───────────────────────────────────────────────────
  let aiTreatment = $state<AiContentTreatment>(
    SETTINGS_DEFAULTS[SettingsKey.YouTube.AiContent] as AiContentTreatment,
  );
  let hideShorts = $state(true);
  let selectedSites = $state<OnboardingSiteKey[]>(["youtube"]);
  /** Daily minutes per planned rule, keyed by rule name; absent means the default. */
  let limitMinutes = $state<Record<string, number>>({});
  let rulesCreatedFor = $state<OnboardingSiteKey[] | null>(null);
  let user = $state<User | null>(null);
  let signingIn = $state<"google" | "apple" | null>(null);
  let signInError = $state("");
  let showEmailDialog = $state(false);
  let showWhyAccount = $state(false);
  let pinned = $state(false);
  let busy = $state(false);
  /** A yes on the AI question, while its thumbnails get zapped. */
  let aiZapped = $state(false);
  /** Tweaks on at the summary, read when it shows since SiteTweaks saves its own. */
  let tweaksOn = $state(0);
  /** Which beat of the limits demo is showing, to highlight its caption. */
  let limitsDemoPhase = $state(0);

  let plannedRules = $derived(planRulesFromSurvey(rulesCreatedFor ?? selectedSites, pro.limited));
  /** The AI choice as it applies: a Pro one is labelled instead in the free version on a phone. */
  let aiShown = $derived(
    pro.limited && requiresPro(SettingsKey.YouTube.AiContent, aiTreatment) ? AiContentTreatment.Badge : aiTreatment,
  );

  let unsubscribeAuth: (() => void) | null = null;
  let pinPoll: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    const stored = (await storage.getItem<Record<string, unknown>>(SETTINGS_KEY)) ?? {};
    const storedAi = stored[SettingsKey.YouTube.AiContent];
    if (storedAi) aiTreatment = storedAi as AiContentTreatment;
    user = await getCurrentUser();
    unsubscribeAuth = onAuthStateChange((_event, session) => {
      user = session?.user ?? null;
    });
  });

  onDestroy(() => {
    unsubscribeAuth?.();
    stopPinPoll();
  });

  // The page behind keeps its own height and padding; without this it adds a
  // second scrollbar beside the onboarding's.
  $effect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  });

  // Watch for the real pin while its step shows, so the slide can celebrate it.
  $effect(() => {
    // The summary says where to find settings, which depends on the pin too.
    if (stepId === "done") void checkPinned();
    if (stepId !== "pin") return;
    void checkPinned();
    pinPoll = setInterval(checkPinned, 1000);
    return stopPinPoll;
  });

  function stopPinPoll(): void {
    if (pinPoll) clearInterval(pinPoll);
    pinPoll = null;
  }

  async function checkPinned(): Promise<void> {
    try {
      const settings = await (browser.action as any)?.getUserSettings?.();
      pinned = settings?.isOnToolbar === true;
    } catch {
      // Not supported in this browser: the slide just keeps its instructions.
    }
  }

  // ── Navigation ────────────────────────────────────────────────
  function next(): void {
    direction = 1;
    if (index < steps.length - 1) index += 1;
    if (steps[index] === "done") void markCompleted();
  }

  function back(): void {
    direction = -1;
    if (index > 0) index -= 1;
    // The acknowledgement moves itself on, so going back steps over it.
    if (steps[index] === "ack" && index > 0) index -= 1;
  }

  // The acknowledgement after the questions is a beat, not a step to act on.
  $effect(() => {
    if (stepId !== "ack") return;
    const timer = setTimeout(next, ACK_MS);
    return () => clearTimeout(timer);
  });

  function chooseLimits(optIn: boolean): void {
    limitsOptIn = optIn;
    if (!optIn && flow === "limits") {
      oncomplete();
      return;
    }
    next();
  }

  async function answer(goal: OnboardingGoal, yes: boolean): Promise<void> {
    if (aiZapped) return;
    const updated = new Set(goals);
    if (yes) updated.add(goal);
    else updated.delete(goal);
    goals = updated;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // No point waiting on a zap that's off screen.
    const thumbsHidden = window.matchMedia(AI_THUMB_COLUMNS_HIDDEN_QUERY).matches;
    if (goal === "aiContent" && yes && !reduceMotion && !thumbsHidden) {
      aiZapped = true;
      await new Promise((resolve) => setTimeout(resolve, AI_ZAP_MS));
    }
    next();
    aiZapped = false;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const question = GOAL_QUESTIONS.find((q) => q.step === stepId);
    if (!question) return;
    const key = e.key.toLowerCase();
    if (key === "y") void answer(question.goal, true);
    else if (key === "n") void answer(question.goal, false);
  }

  // ── Persistence ───────────────────────────────────────────────
  async function saveSettings(values: Record<string, unknown>): Promise<void> {
    const stored = (await storage.getItem<Record<string, unknown>>(SETTINGS_KEY)) ?? {};
    await storage.setItem(SETTINGS_KEY, { ...stored, ...values });
  }

  async function chooseAi(value: AiContentTreatment): Promise<void> {
    aiTreatment = value;
    await saveSettings({ [SettingsKey.YouTube.AiContent]: value });
  }

  async function continueFromShorts(): Promise<void> {
    await saveSettings({
      [SettingsKey.YouTube.Shorts]: hideShorts,
      [SettingsKey.YouTube.ShortsTab]: hideShorts,
      [SettingsKey.Instagram.ReelsTab]: hideShorts,
    });
    next();
  }

  function limitFor(ruleName: string): number {
    return limitMinutes[ruleName] ?? DEFAULT_ALLOWED_SECONDS / 60;
  }

  /** ± a step, snapping to its multiples so 32 goes to 35 rather than 37. */
  function stepLimit(ruleName: string, delta: number): void {
    const current = limitFor(ruleName);
    const snapped = delta > 0 ? Math.floor(current / delta) * delta : Math.ceil(current / -delta) * -delta;
    const minutes = Math.min(MAX_LIMIT_MINUTES, Math.max(LIMIT_STEP_MINUTES, snapped + delta));
    limitMinutes = { ...limitMinutes, [ruleName]: minutes };
  }

  function setLimitMinutes(ruleName: string, raw: string): void {
    const minutes = Math.round(Number(raw));
    if (!Number.isFinite(minutes) || minutes < 1) return;
    limitMinutes = { ...limitMinutes, [ruleName]: Math.min(minutes, MAX_LIMIT_MINUTES) };
  }

  function toggleSite(key: OnboardingSiteKey): void {
    selectedSites = selectedSites.includes(key)
      ? selectedSites.filter((s) => s !== key)
      : [...selectedSites, key];
  }

  async function continueFromSites(): Promise<void> {
    // Going back and forth shouldn't create the same rules twice.
    if (rulesCreatedFor === null && selectedSites.length > 0) {
      busy = true;
      const seconds = Object.fromEntries(
        Object.entries(limitMinutes).map(([name, minutes]) => [name, minutes * 60]),
      );
      await createRulesFromSurvey(store, selectedSites, seconds, pro.limited);
      rulesCreatedFor = [...selectedSites];
      busy = false;
    }
    if (flow === "limits") {
      await markLimitsCompleted();
      oncomplete();
      return;
    }
    next();
  }

  async function signIn(provider: "google" | "apple"): Promise<void> {
    signInError = "";
    if (!(await requestAccountConsent())) {
      signInError = t("settings_accountDataConsentDeclined");
      return;
    }
    signingIn = provider;
    const result = provider === "google" ? await signInWithGoogle() : await signInWithApple();
    signingIn = null;
    if (result.success) {
      user = await getCurrentUser();
    } else if (result.error) {
      signInError = result.error;
    }
  }

  async function handleEmailSignedIn(): Promise<void> {
    showEmailDialog = false;
    user = await getCurrentUser();
  }

  async function markCompleted(): Promise<void> {
    const goalList = [...goals];
    const onboardingState: OnboardingState = {
      // The goals replace the old motivations survey; keep its closest meaning.
      motivations: goalList.includes("screenTime") ? ["screentimeRules"] : [],
      goals: goalList,
      // A snapshot: Firefox can't store the proxy $state wraps arrays in.
      selectedSites: $state.snapshot(rulesCreatedFor) ?? [],
      ruleOnboardingCompleted: rulesCreatedFor !== null,
      dismissedCoachMarks: [],
      completedAt: Date.now(),
    };
    await storage.setItem(ONBOARDING_KEY, true);
    await storage.setItem(ONBOARDING_STATE_KEY, onboardingState);
  }

  async function markLimitsCompleted(): Promise<void> {
    const existing = (await storage.getItem<OnboardingState>(ONBOARDING_STATE_KEY)) ?? {
      motivations: [],
      selectedSites: [],
      ruleOnboardingCompleted: false,
      dismissedCoachMarks: [],
    };
    await storage.setItem(ONBOARDING_STATE_KEY, {
      ...existing,
      selectedSites: $state.snapshot(rulesCreatedFor) ?? [],
      ruleOnboardingCompleted: true,
    });
  }

  function openYouTube(): void {
    void browser.tabs.create({ url: YOUTUBE_URL });
  }

  function siteIcon(domain: string): string | undefined {
    return SITE_OPTIONS.find((s) => s.domain === domain)?.icon;
  }

  // ── Done summary ──────────────────────────────────────────────
  // Every main feature gets a tile, on or off, so the summary is never empty
  // and also shows what's still there to turn on.
  $effect(() => {
    if (stepId !== "done") return;
    void storage
      .getItem<Record<string, unknown>>(SETTINGS_KEY)
      .then((stored) => {
        const values = { ...SETTINGS_DEFAULTS, ...(stored ?? {}) };
        tweaksOn = countTweaksOn(pro.limited ? withoutProSettings(values) : values);
      });
  });

  let summary = $derived.by(() => {
    const ruleCount = rulesCreatedFor ? planRulesFromSurvey(rulesCreatedFor, pro.limited).length : 0;
    const aiStatus = {
      [AiContentTreatment.Cover]: t("onboardingWebext_doneStatusCovered"),
      [AiContentTreatment.Badge]: t("onboardingWebext_doneStatusLabeled"),
      [AiContentTreatment.Hide]: t("onboardingWebext_doneStatusHidden"),
      [AiContentTreatment.Off]: t("onboardingWebext_doneStatusShowing"),
    }[aiShown];
    const shortsHidden = goals.has("customizeSites") && hideShorts;
    return [
      { icon: RobotIcon, label: t("onboardingWebext_doneTileAi"), status: aiStatus, on: aiShown !== AiContentTreatment.Off },
      {
        iconSrc: "/images/onboarding/shorts-icon.png",
        label: t("onboardingWebext_doneTileShorts"),
        status: shortsHidden ? t("onboardingWebext_doneStatusHidden") : t("onboardingWebext_doneStatusShowing"),
        on: shortsHidden,
      },
      {
        icon: SlidersHorizontal,
        label: t("onboardingWebext_doneTileTweaks"),
        status: tweaksOn > 0 ? tp("onboardingWebext_doneStatusTweaksOn", tweaksOn, String(tweaksOn)) : t("onboardingWebext_doneStatusOff"),
        on: tweaksOn > 0,
      },
      {
        icon: Hourglass,
        label: t("onboardingWebext_doneTileLimits"),
        status: ruleCount > 0 ? tp("onboardingWebext_doneStatusLimits", ruleCount, String(ruleCount)) : t("onboardingWebext_doneStatusOff"),
        on: ruleCount > 0,
      },
      {
        icon: Vote,
        label: t("onboardingWebext_doneTileVotes"),
        status: user ? t("onboardingWebext_doneStatusShared") : t("onboardingWebext_doneStatusJustYou"),
        on: !!user,
      },
    ];
  });

  let questionNumber = $derived(GOAL_QUESTIONS.findIndex((q) => q.step === stepId) + 1);
  // The questions have their own stepped meter, so answering them feels light.
  // The main bar then starts after them, already part full.
  let firstMainIndex = $derived(Math.max(0, steps.indexOf("ack") + 1));
  let headStart = $derived(firstMainIndex > 0 ? PROGRESS_HEAD_START : 0);
  let progress = $derived(
    headStart +
      (1 - headStart) * (Math.max(0, index - firstMainIndex) / Math.max(1, steps.length - 1 - firstMainIndex)),
  );
  // The page itself is the main UI once onboarding is complete, so the tour embeds it.
  const tourSrc = location.pathname;
</script>

<svelte:window onkeydown={onKeydown} />

<div class="ob">
  <div class="backdrop" aria-hidden="true">
    <div class="orb one"></div>
    <div class="orb two"></div>
  </div>

  {#if stepId === "goalAi"}
    <div class="thumb-layer" out:fade={{ duration: 250 }}>
      <AiThumbColumns zapped={aiZapped} />
    </div>
  {/if}

  <header>
    <span class="logo"><RelockInLogo size={20} /></span>
    <div class="header-center">
    <!-- Its slot stays when it's hidden, so the meter beside it never changes width. -->
    <span class="back-slot">
      {#if index > 0 && stepId !== "ack" && stepId !== "tour"}
        <button class="back-btn" onclick={back} aria-label={t("common_back")} transition:fade={{ duration: 200 }}>
          <ArrowLeft size={18} />
        </button>
      {/if}
    </span>
    {#if questionNumber > 0 || stepId === "ack"}
      <div class="survey-meter" aria-hidden="true">
        {#each GOAL_QUESTIONS as _, i}
          <span class="survey-segment" class:filled={stepId === "ack" || i < questionNumber}></span>
        {/each}
      </div>
    {:else if stepId !== "welcome" && stepId !== "tour"}
      <div class="progress" in:fade={{ duration: 300 }}>
        <div class="progress-fill" style:transform="scaleX({progress})"></div>
      </div>
    {/if}
    </div>
    <span class="header-spacer"></span>
  </header>

  <main class="stage">
    {#key stepId}
      <div
        class="slide-wrap"
        in:fly={{ x: 40 * direction, duration: 420, delay: 160, opacity: 0 }}
        out:fly={{ x: -40 * direction, duration: 160, opacity: 0 }}
      >
        {#if stepId === "welcome"}
          <Slide layout="center" title={t("onboardingWebext_welcomeTitle")} body={t("onboardingWebext_welcomeBody")}>
            {#snippet actions()}
              <!-- svelte-ignore a11y_autofocus -->
              <button class="btn primary large" autofocus onclick={next}>
                {t("common_getStarted")}
                <ArrowRight size={20} strokeWidth={2.2} />
              </button>
              <p class="hint">{t("onboardingWebext_welcomeDuration")}</p>
              <p class="source-note">
                {#each sourceNoteParts as part}
                  {#if part === SOURCE_LINK}
                    <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer">{t("onboardingWebext_welcomeSourceNoteLink")}</a>
                  {:else}
                    {part}
                  {/if}
                {/each}
              </p>
              {#if import.meta.env.DEV}
                <!-- A fresh install opens here, so try the phone version before anything else. -->
                <DevDeviceToggle />
              {/if}
            {/snippet}
          </Slide>

        {:else if stepId === "phoneApp"}
          <!-- Introduces the mobile app and what it adds. -->
          <Slide title={t("phoneWebext_onboardingTitle")}>
            <ul class="phone-points">
              <li><SlidersHorizontal size={20} strokeWidth={2} />{t("phoneWebext_onboardingBenefitTweaks")}</li>
              <li><Hourglass size={20} strokeWidth={2} />{t("phoneWebext_onboardingBenefitLimits")}</li>
              <li><Moon size={20} strokeWidth={2} />{t("phoneWebext_onboardingBenefitSchedules")}</li>
            </ul>
            {#snippet actions()}
              <a class="btn primary large" href={appStore.url} target="_blank" rel="noopener noreferrer">
                {t("phoneWebext_getApp")}
                <ArrowRight size={20} strokeWidth={2.2} />
              </a>
              <button class="btn ghost" onclick={next}>{t("phoneWebext_continueHere")}</button>
            {/snippet}
            {#snippet visual()}
              <div class="phone-peek"><PhoneMock /></div>
            {/snippet}
          </Slide>

        {:else if stepId === "phoneLimits"}
          <Slide layout="center" title={t("phoneWebext_onboardingLimitsTitle")}>
            <ul class="phone-points missing">
              <li><X size={20} strokeWidth={2.2} />{t("phoneWebext_onboardingLimitsNoApps")}</li>
              <li><X size={20} strokeWidth={2.2} />{t("phoneWebext_onboardingLimitsOneRule")}</li>
              <li><X size={20} strokeWidth={2.2} />{t("phoneWebext_onboardingLimitsAiLabelOnly")}</li>
            </ul>
            {#snippet actions()}
              <p class="store-lead">{t("phoneWebext_onboardingLimitsBody")}</p>
              <a class="store-badge" href={appStore.url} target="_blank" rel="noopener noreferrer">
                <img src={appStore.badge} alt={appStore.name} />
              </a>
              <button class="btn ghost" onclick={next}>{t("phoneWebext_continueLimited")}</button>
            {/snippet}
          </Slide>

        {:else if questionNumber > 0}
          {@const question = GOAL_QUESTIONS[questionNumber - 1]}
          {@const copy = GOAL_COPY[question.goal]}
          <Slide layout="center" typing title={copy.title} body={copy.body}>
            {#snippet hero()}
              {#if copy.sites}
                <span class="goal-sites">
                  {#each copy.sites as icon, i}
                    <img src={icon} alt="" style:--i={i} />
                  {/each}
                </span>
              {:else}
              <span class="goal-icon">
                {#if copy.iconSrc}
                  <span class="mask-icon" style:--src="url({copy.iconSrc})"></span>
                {:else if copy.icon}
                  <copy.icon size={30} strokeWidth={1.8} />
                {/if}
              </span>
              {/if}
            {/snippet}
            {#snippet actions()}
              <!-- Y and N answer from the keyboard too (see onKeydown). -->
              <div class="answers">
                <button class="answer" class:chosen={goals.has(question.goal)} onclick={() => answer(question.goal, true)}>
                  {t("common_yes")}
                </button>
                <button class="answer" onclick={() => answer(question.goal, false)}>
                  {t("onboardingWebext_goalNo")}
                </button>
              </div>
            {/snippet}
          </Slide>

        {:else if stepId === "ack"}
          {@const said = GOAL_QUESTIONS.filter((q) => goals.has(q.goal))}
          <button class="ack" onclick={next} aria-label={t("common_continue")}>
            <Slide
              layout="center"
              typing
              title={said.length > 0 ? t("onboardingWebext_ackTitle") : t("onboardingWebext_ackTitleNone")}
            >
            </Slide>
            <span class="ack-timer" style:--ack="{ACK_MS}ms"></span>
          </button>
          <div class="ack-actions">
            <!-- svelte-ignore a11y_autofocus -->
            <button class="btn primary" autofocus onclick={next}>
              {t("common_continue")}
              <ArrowRight size={18} strokeWidth={2.2} />
            </button>
          </div>

        {:else if stepId === "aiContent"}
          <Slide
            eyebrow={t("onboardingWebext_aiEyebrow")}
            title={t("onboardingWebext_aiTitle")}
            body={t("onboardingWebext_aiBody")}
          >
            <div class="choices" role="radiogroup">
              {#each AI_OPTIONS as option}
                {@const locked = pro.limited && requiresPro(SettingsKey.YouTube.AiContent, option.value)}
                <button
                  class="choice"
                  class:selected={aiShown === option.value}
                  role="radio"
                  aria-checked={aiShown === option.value}
                  disabled={locked}
                  onclick={() => chooseAi(option.value)}
                >
                  <span class="radio"></span>
                  <span class="choice-text">
                    <span class="choice-label">{option.label}{#if locked}<ProBadge />{/if}</span>
                    <span class="choice-desc">{option.desc}</span>
                  </span>
                </button>
              {/each}
            </div>
            {#snippet actions()}
              {@render nav()}
            {/snippet}
            {#snippet visual()}
              <AiFeedMock treatment={aiShown} />
            {/snippet}
          </Slide>

        {:else if stepId === "account"}
          <Slide
            eyebrow={t("onboardingWebext_accountEyebrow")}
            title={t("onboardingWebext_accountTitle")}
            body={user ? t("onboardingWebext_accountSignedInBody") : t("onboardingWebext_accountBody")}
          >
            {#if user}
              <div class="signed-in" in:scale={{ start: 0.9, duration: 300 }}>
                <span class="check"><Check size={16} strokeWidth={3} /></span>
                {t("onboardingWebext_accountSignedIn")}
              </div>
            {:else}
              <div class="auth">
                {#if isGoogleSignInSupported()}
                  <AuthProviderButton
                    provider="google"
                    label={signingIn === "google" ? t("settings_accountSigningIn") : t("settings_accountSignInWithGoogle")}
                    disabled={signingIn !== null}
                    onclick={() => signIn("google")}
                  />
                {/if}
                {#if isAppleSignInSupported()}
                  <AuthProviderButton
                    provider="apple"
                    label={signingIn === "apple" ? t("settings_accountSigningIn") : t("settings_appleSignInCta")}
                    disabled={signingIn !== null}
                    onclick={() => signIn("apple")}
                  />
                {/if}
                <AuthProviderButton
                  provider="email"
                  label={t("onboardingWebext_accountContinueWithEmail")}
                  disabled={signingIn !== null}
                  onclick={() => (showEmailDialog = true)}
                />
                <LegalNotice kind="continue" />
              </div>
              {#if signInError}<p class="error">{signInError}</p>{/if}
            {/if}
            {#if !user}
              <button class="why" aria-expanded={showWhyAccount} onclick={() => (showWhyAccount = !showWhyAccount)}>
                {t("onboardingWebext_accountWhy")}
                <span class="chevron" class:open={showWhyAccount}><ChevronDown size={16} /></span>
              </button>
              {#if showWhyAccount}
                <p class="why-body" transition:slide={{ duration: 240 }}>{t("onboardingWebext_accountWhyBody")}</p>
              {/if}
            {/if}
            {#if showEmailDialog}
              <EmailAuthDialog onsignedin={handleEmailSignedIn} onclose={() => (showEmailDialog = false)} />
            {/if}
            {#snippet actions()}
              {@render nav(user ? t("common_continue") : t("common_notNow"), !user)}
            {/snippet}
            {#snippet visual()}
              <VoteMock />
            {/snippet}
          </Slide>

        {:else if stepId === "shorts"}
          <Slide
            eyebrow={t("onboardingWebext_shortsEyebrow")}
            title={t("onboardingWebext_shortsTitle")}
            body={t("onboardingWebext_shortsBody")}
          >
            <button class="toggle-row" role="switch" aria-checked={hideShorts} onclick={() => (hideShorts = !hideShorts)}>
              <span>{t("onboardingWebext_shortsToggle")}</span>
              <span class="switch" class:on={hideShorts}><span class="knob"></span></span>
            </button>
            {#snippet actions()}
              {@render nav(t("common_continue"), false, continueFromShorts)}
            {/snippet}
            {#snippet visual()}
              <ShortsMock hidden={hideShorts} />
            {/snippet}
          </Slide>

        {:else if stepId === "siteTweaks"}
          <Slide
            eyebrow={t("onboardingWebext_tweaksEyebrow")}
            title={t("onboardingWebext_tweaksTitle")}
            body={t("onboardingWebext_tweaksBody")}
          >
            {#snippet actions()}
              {@render nav()}
            {/snippet}
            {#snippet visual()}
              <SiteTweaks />
            {/snippet}
          </Slide>

        {:else if stepId === "limitsIntro"}
          <Slide
            eyebrow={t("onboardingWebext_limitsEyebrow")}
            title={t("onboardingWebext_limitsTitle")}
            body={t("onboardingWebext_limitsIntroBody")}
          >
            <ol class="beats">
              {#each [t("onboardingWebext_limitsStepPick"), t("onboardingWebext_limitsStepUse"), t("onboardingWebext_limitsStepRelock")] as beat, i}
                <li class:current={limitsDemoPhase === i}><span class="beat-number">{i + 1}</span>{beat}</li>
              {/each}
            </ol>
            {#snippet actions()}
              <!-- svelte-ignore a11y_autofocus -->
              <button class="btn primary" autofocus onclick={() => chooseLimits(true)}>
                {t("onboardingWebext_limitsTry")}
                <ArrowRight size={18} strokeWidth={2.2} />
              </button>
              <button class="btn outline" onclick={() => chooseLimits(false)}>{t("common_notNow")}</button>
            {/snippet}
            {#snippet visual()}
              <LimitsDemo bind:phase={limitsDemoPhase} />
            {/snippet}
          </Slide>

        {:else if stepId === "limitsSites"}
          <Slide
            eyebrow={t("onboardingWebext_limitsEyebrow")}
            title={t("onboardingWebext_sitesTitle")}
            body={t("onboardingWebext_sitesBody")}
          >
            {#if pro.limited}
              <p class="hint">{t("phoneWebext_sitesOneRuleNote")}</p>
            {/if}
            {#if rulesCreatedFor === null}
              <div class="sites">
                {#each SITE_OPTIONS as site}
                  <button
                    class="site"
                    class:selected={selectedSites.includes(site.key)}
                    aria-pressed={selectedSites.includes(site.key)}
                    onclick={() => toggleSite(site.key)}
                  >
                    <img src={site.icon} alt="" />
                    <span>{site.label}</span>
                    {#if selectedSites.includes(site.key)}
                      <span class="site-check" transition:scale={{ duration: 160 }}><Check size={12} strokeWidth={3.5} /></span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
            {#snippet actions()}
              {@render nav(
                selectedSites.length === 0 && rulesCreatedFor === null ? t("common_skip") : t("common_continue"),
                false,
                continueFromSites,
              )}
            {/snippet}
            {#snippet visual()}
              <div class="rules-preview">
                <p class="preview-title">{t("limits_webextRulesTitle")}</p>
                {#each plannedRules as rule (rule.name)}
                  <div class="rule" in:fly={{ y: 10, duration: 260 }}>
                    <div class="rule-icons">
                      {#each rule.domains as domain}
                        {@const icon = siteIcon(domain)}
                        {#if icon}<img src={icon} alt="" />{/if}
                      {/each}
                    </div>
                    <span class="rule-name">{rule.name}</span>
                    {#if rulesCreatedFor === null}
                      <div class="rule-limit">
                        <div class="stepper">
                          <button
                            onclick={() => stepLimit(rule.name, -LIMIT_STEP_MINUTES)}
                            aria-label={t("onboardingWebext_sitesLimitDecrease")}
                          ><Minus size={14} strokeWidth={2.6} /></button>
                          <input
                            type="number"
                            min="1"
                            max={MAX_LIMIT_MINUTES}
                            inputmode="numeric"
                            aria-label={t("onboardingWebext_sitesLimitLabel", [rule.name])}
                            value={limitFor(rule.name)}
                            oninput={(e) => setLimitMinutes(rule.name, e.currentTarget.value)}
                          />
                          <button
                            onclick={() => stepLimit(rule.name, LIMIT_STEP_MINUTES)}
                            aria-label={t("onboardingWebext_sitesLimitIncrease")}
                          ><Plus size={14} strokeWidth={2.6} /></button>
                        </div>
                        <span class="unit">{t("onboardingWebext_sitesLimitUnit")}</span>
                      </div>
                    {:else}
                      <span class="rule-limit fixed">
                        {t("common_minutesShortFormat", [String(limitFor(rule.name))])}
                      </span>
                    {/if}
                  </div>
                {:else}
                  <p class="preview-empty">{t("onboardingWebext_sitesEmpty")}</p>
                {/each}
              </div>
            {/snippet}
          </Slide>

        {:else if stepId === "pin"}
          <Slide
            eyebrow={t("onboardingWebext_pinEyebrow")}
            title={t("onboardingWebext_pinTitle")}
            body={t("onboardingWebext_pinBody")}
          >
            {#if pinned}
              <div class="signed-in" in:scale={{ start: 0.9, duration: 300 }}>
                <span class="check"><Check size={16} strokeWidth={3} /></span>
                {t("onboardingWebext_pinDone")}
              </div>
            {:else}
              <ol class="steps">
                <li>{@html boldOnly(t("onboardingWebext_pinStep1"))}</li>
                <li>{@html boldOnly(t("onboardingWebext_pinStep2"))}</li>
              </ol>
            {/if}
            {#snippet actions()}
              {@render nav()}
            {/snippet}
            {#snippet visual()}
              <PinMock {pinned} />
            {/snippet}
          </Slide>

        {:else if stepId === "phone"}
          <Slide
            eyebrow={t("onboardingWebext_phoneEyebrow")}
            title={t("onboardingWebext_phoneTitle")}
            body={t("onboardingWebext_phoneBody")}
          >
            <div class="stores">
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                <img src="/images/AppleStoreButton.svg" alt="App Store" />
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
                <img src="/images/GooglePlayButton.svg" alt="Google Play" />
              </a>
            </div>
            {#snippet actions()}
              {@render nav()}
            {/snippet}
            {#snippet visual()}
              <div class="phone-visual">
                <div class="qr-card">
                  <img src="/images/DownloadRelockInQrOnboarding.svg" alt={t("overlay_appUpsellQrAlt")} />
                  <p>{t("onboardingWebext_phoneScan")}</p>
                </div>
                <div class="phone-peek"><PhoneMock /></div>
              </div>
            {/snippet}
          </Slide>

        {:else if stepId === "done"}
          <Slide
            layout="center"
            wide
            typing
            title={t("onboardingWebext_doneTitle")}
            body={pinned ? t("onboardingWebext_doneBodyPinned") : t("onboardingWebext_doneBodyUnpinned")}
          >
            <ul class="tiles">
              {#each summary as tile, i}
                <li class="tile" class:on={tile.on} in:fly={{ y: 14, duration: 380, delay: 360 + i * 90 }}>
                  <span class="tile-icon">
                    {#if tile.iconSrc}
                      <span class="mask-icon small" style:--src="url({tile.iconSrc})"></span>
                    {:else if tile.icon}
                      <tile.icon size={20} strokeWidth={2} />
                    {/if}
                  </span>
                  <span class="tile-label">{tile.label}</span>
                  <span class="tile-status">
                    {#if tile.on}<Check size={13} strokeWidth={3} />{/if}{tile.status}
                  </span>
                </li>
              {/each}
            </ul>
            {#snippet actions()}
              {@render nav()}
            {/snippet}
          </Slide>

        {:else if stepId === "tour"}
          <Slide
            title={t("onboardingWebext_tourTitle")}
            body={t("onboardingWebext_tourBody")}
          >
            {#snippet actions()}
              <!-- svelte-ignore a11y_autofocus -->
              <button class="btn primary large" autofocus onclick={openYouTube}>
                {t("onboardingWebext_doneTryYouTube")}
                <ArrowRight size={20} strokeWidth={2.2} />
              </button>
              <button class="btn ghost" onclick={oncomplete}>{t("onboardingWebext_tourClose")}</button>
            {/snippet}
            {#snippet visual()}
              <div class="tour">
                <div class="tour-toolbar" aria-hidden="true">
                  <span class="tour-url"></span>
                  <span class="tour-icon"><img src="/images/iconOutline48.png" alt="" /></span>
                </div>
                <iframe class="tour-popup" src={tourSrc} title="RelockIn"></iframe>
              </div>
            {/snippet}
          </Slide>
        {/if}
      </div>
    {/key}
  </main>
</div>

{#snippet nav(label = t("common_continue"), quiet = false, onclick: () => void = next)}
  <!-- svelte-ignore a11y_autofocus -->
  <button class="btn {quiet ? 'secondary' : 'primary'}" autofocus disabled={busy} {onclick}>
    {label}
    <ArrowRight size={18} strokeWidth={2.2} />
  </button>
{/snippet}

<script module lang="ts">
  /** `**bold**` → <strong>, escaping everything else. */
  function boldOnly(s: string): string {
    return s
      .replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
</script>

<style>
  .ob {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    /* Slides fly in from the side; that should never make the page scroll sideways. */
    overflow-x: hidden;
    overflow-y: auto;
    background: #0e0e11;
    color: #fff;
  }

  /* ── Backdrop ───────────────────────────────────────────────── */
  .backdrop {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .orb {
    position: absolute;
    width: 60vmax;
    height: 60vmax;
    border-radius: 50%;
    filter: blur(110px);
    opacity: 0.22;
  }

  .orb.one {
    top: -30vmax;
    left: -18vmax;
    background: var(--rl-accent-blue);
    animation: drift-one 26s ease-in-out infinite alternate;
  }

  .orb.two {
    bottom: -34vmax;
    right: -20vmax;
    background: var(--rl-accent-lavender);
    animation: drift-two 32s ease-in-out infinite alternate;
  }

  @keyframes drift-one {
    to {
      transform: translate(12vmax, 8vmax);
    }
  }

  @keyframes drift-two {
    to {
      transform: translate(-10vmax, -6vmax);
    }
  }

  /* ── Header ─────────────────────────────────────────────────── */
  header {
    position: relative;
    display: grid;
    /* The middle column is the meter plus the back button's slot and a
       matching gap on the right, so the meter itself stays centered. */
    grid-template-columns: 1fr minmax(0, 468px) 1fr;
    align-items: center;
    gap: 24px;
    padding: 28px clamp(20px, 4vw, 48px);
  }

  .logo {
    justify-self: start;
    color: #fff;
  }

  .survey-meter {
    display: flex;
    gap: 6px;
  }

  .survey-segment {
    flex: 1;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    transition: background 0.3s ease;
  }

  .survey-segment.filled {
    background: var(--rl-gradient);
  }

  .thumb-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .progress {
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--rl-gradient);
    border-radius: inherit;
    transform-origin: left;
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* ── Stage ──────────────────────────────────────────────────── */
  .stage {
    position: relative;
    flex: 1;
    display: grid;
    padding: 0 clamp(20px, 5vw, 72px) 64px;
  }

  .slide-wrap {
    grid-area: 1 / 1;
    align-self: center;
    min-width: 0;
  }

  /* ── Buttons ────────────────────────────────────────────────── */
  .btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 26px;
    border-radius: 999px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      box-shadow 0.2s ease,
      background-color 0.2s ease,
      opacity 0.2s ease;
  }

  .btn:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 3px;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn.primary {
    background: var(--rl-gradient);
    color: #111114;
    box-shadow: 0 10px 30px -10px rgba(140, 150, 245, 0.7);
  }

  .btn.primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 14px 36px -10px rgba(140, 150, 245, 0.85);
  }

  .btn.primary.large {
    padding: 18px 34px;
    font-size: 18px;
  }

  .btn.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn.ghost {
    color: rgba(255, 255, 255, 0.6);
    padding: 14px 18px;
  }

  .btn.ghost:hover {
    color: #fff;
  }

  .header-center {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 40px;
    padding-right: 54px;
  }

  .header-center > :not(.back-slot) {
    flex: 1;
  }

  .back-slot {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
  }

  .back-btn {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }

  .back-btn:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 3px;
  }

  .btn.outline {
    color: rgba(255, 255, 255, 0.85);
    box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.3);
  }

  .btn.outline:hover {
    color: #fff;
    box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.55);
  }

  .hint {
    width: 100%;
    margin: 4px 0 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* ── Questions ──────────────────────────────────────────────── */
  /* ── Acknowledgement ────────────────────────────────────────── */
  .ack-actions {
    display: flex;
    justify-content: center;
    margin-top: 28px;
  }

  .ack {
    all: unset;
    display: block;
    width: 100%;
    cursor: pointer;
  }

  /* A thin line that runs out as the beat ends, so the auto-advance isn't a surprise. */
  .ack-timer {
    display: block;
    width: 120px;
    height: 3px;
    margin: 40px auto 0;
    border-radius: 999px;
    background: var(--rl-gradient);
    transform-origin: left;
    animation: ack-run var(--ack) linear both;
    opacity: 0.6;
  }

  @keyframes ack-run {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }

  /* ── Limits beats ───────────────────────────────────────────── */
  .beats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .beats li {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 17px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
    transition: color 0.3s ease;
  }

  .beats li.current {
    color: #fff;
  }

  .beat-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    font-family: var(--rl-font-title);
    font-size: 13px;
    transition:
      background 0.3s ease,
      color 0.3s ease;
  }

  .beats li.current .beat-number {
    background: var(--rl-gradient);
    color: #111114;
  }

  .goal-sites {
    display: flex;
    gap: 12px;
  }

  .goal-sites img {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    box-shadow: 0 10px 24px -8px rgba(0, 0, 0, 0.6);
    animation: pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    animation-delay: calc(var(--i) * 70ms);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.7);
    }
  }

  .goal-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: linear-gradient(135deg, rgba(115, 158, 235, 0.22), rgba(173, 148, 242, 0.22));
    border: 1px solid rgba(173, 148, 242, 0.35);
    box-shadow: 0 0 40px rgba(140, 150, 245, 0.25);
    color: #fff;
  }

  .mask-icon {
    width: 30px;
    height: 30px;
    background: currentColor;
    mask: var(--src) center / contain no-repeat;
  }

  .mask-icon.small {
    width: 20px;
    height: 20px;
  }

  /* A set width: the centered actions row shrinks to its content otherwise. */
  .answers {
    display: flex;
    gap: 14px;
    width: min(480px, 84vw);
  }

  .answer {
    all: unset;
    flex: 1;
    padding: 22px 24px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 20px;
    font-weight: 700;
    text-align: center;
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      transform 0.15s ease;
  }

  .answer:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.22);
    transform: translateY(-2px);
  }

  .answer:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 3px;
  }

  .answer.chosen {
    border-color: var(--rl-accent-blue);
  }

  /* ── Choice lists ───────────────────────────────────────────── */
  .choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .choice {
    all: unset;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease;
  }

  .choice:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .choice:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 2px;
  }

  .choice.selected {
    background: rgba(115, 158, 235, 0.1);
    border-color: rgba(115, 158, 235, 0.6);
  }

  /* Pro, in the free version on a phone. */
  .choice:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .choice:disabled:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .radio {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.3);
    box-sizing: border-box;
    transition:
      border 0.2s ease,
      background 0.2s ease;
  }

  .choice.selected .radio {
    border: 5px solid var(--rl-accent-blue);
  }

  .choice-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .choice-label {
    font-size: 16px;
    font-weight: 700;
  }

  .choice-desc {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.55);
  }

  /* ── Toggle ─────────────────────────────────────────────────── */
  .toggle-row {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    max-width: 440px;
    padding: 18px 20px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
  }

  .toggle-row:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 2px;
  }

  .switch {
    position: relative;
    flex-shrink: 0;
    width: 50px;
    height: 30px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    transition: background 0.25s ease;
  }

  .switch.on {
    background: var(--rl-gradient);
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .switch.on .knob {
    transform: translateX(20px);
  }

  /* ── Account ────────────────────────────────────────────────── */
  .auth {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    max-width: 340px;
  }

  /* Quieter than the hint above it: a statement for anyone who cares, not a step. */
  .source-note {
    width: 100%;
    margin: 2px 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.4);
  }

  .source-note a {
    color: rgba(255, 255, 255, 0.6);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .source-note a:hover {
    color: #fff;
  }

  .why {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--rl-accent-blue);
    cursor: pointer;
  }

  .why:hover {
    color: var(--rl-accent-lavender);
  }

  .why:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
  }

  .chevron {
    display: flex;
    transition: transform 0.2s ease;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .why-body {
    max-width: 34em;
    white-space: pre-line;
    margin: 10px 0 0;
    font-size: 15px;
    line-height: 1.55;
    color: rgba(255, 255, 255, 0.6);
  }

  .error {
    margin: 10px 0 0;
    font-size: 14px;
    color: #ff8a8a;
  }

  .signed-in {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px 12px 12px;
    border-radius: 999px;
    background: rgba(115, 158, 235, 0.12);
    border: 1px solid rgba(115, 158, 235, 0.35);
    font-size: 15px;
    font-weight: 600;
  }

  .check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--rl-gradient);
    color: #111114;
  }

  /* ── Sites ──────────────────────────────────────────────────── */
  .sites {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    max-width: 520px;
  }

  .site {
    all: unset;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 6px 12px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      transform 0.15s ease;
  }

  .site:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
  }

  .site:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 2px;
  }

  .site.selected {
    background: rgba(115, 158, 235, 0.12);
    border-color: rgba(115, 158, 235, 0.6);
    color: #fff;
  }

  .site img {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }

  .site-check {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--rl-gradient);
    color: #111114;
  }

  .rules-preview {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 24px;
    border-radius: 20px;
    background: #141417;
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 40px 80px -24px rgba(0, 0, 0, 0.7);
    min-height: 160px;
  }

  .preview-title {
    margin: 0 0 6px;
    font-family: var(--rl-font-title);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45);
  }

  .rule {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 12px 12px 16px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.05);
  }

  .rule-icons {
    display: flex;
  }

  .rule-icons img {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    box-shadow: 0 0 0 2px #1c1c20;
  }

  .rule-icons img + img {
    margin-left: -8px;
  }

  .rule-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 16px;
    font-weight: 700;
  }

  .rule-limit {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .rule-limit.fixed {
    font-size: 14px;
    font-weight: 700;
    color: var(--rl-accent-blue);
  }

  .stepper {
    display: flex;
    align-items: center;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.07);
  }

  .stepper:focus-within {
    outline: 2px solid var(--rl-accent-blue);
  }

  .stepper button {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 32px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
  }

  .stepper button:hover {
    color: #fff;
  }

  .stepper input {
    all: unset;
    box-sizing: content-box;
    width: 4ch;
    font-size: 16px;
    font-weight: 700;
    text-align: center;
    color: var(--rl-accent-blue);
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .stepper input::-webkit-inner-spin-button,
  .stepper input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .rule-limit .unit {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.45);
  }

  .preview-empty {
    margin: auto 0;
    text-align: center;
    font-size: 15px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* ── Pin ────────────────────────────────────────────────────── */
  .steps {
    margin: 0;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 17px;
    color: rgba(255, 255, 255, 0.75);
  }

  .steps :global(strong) {
    color: #fff;
  }

  /* ── Phone ──────────────────────────────────────────────────── */
  .stores {
    display: flex;
    gap: 12px;
  }

  .stores a {
    display: inline-flex;
    transition: transform 0.15s ease;
  }

  .stores a:hover {
    transform: translateY(-2px);
  }

  .stores img {
    height: 48px;
    width: auto;
  }

  /* The phone runs below the QR card, so it uses the room under it. */
  .phone-visual {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: clamp(20px, 3vw, 40px);
  }

  .qr-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 24px 24px 18px;
    border-radius: 28px;
    background: #141417;
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 40px 80px -24px rgba(0, 0, 0, 0.7);
  }

  .qr-card img {
    width: clamp(180px, 17vw, 240px);
    height: auto;
    padding: 12px;
    border-radius: 18px;
    background: #fff;
    box-sizing: border-box;
  }

  .qr-card p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.55);
  }

  .phone-peek {
    flex-shrink: 0;
  }

  /* ── On a phone: get the app ────────────────────────────────── */
  .phone-points {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
    padding: 0;
    font-size: 18px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .phone-points li {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .phone-points :global(svg) {
    flex-shrink: 0;
    color: var(--rl-accent-blue);
  }

  .phone-points.missing {
    align-self: center;
    text-align: left;
    font-size: 16px;
    color: rgba(255, 255, 255, 0.75);
  }

  .phone-points.missing :global(svg) {
    color: rgba(255, 255, 255, 0.4);
  }

  .store-lead {
    width: 100%;
    max-width: 420px;
    margin: 8px auto 4px;
    font-size: 16px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.75);
  }

  .store-badge {
    display: inline-flex;
    transition: transform 0.15s ease;
  }

  .store-badge:hover {
    transform: translateY(-2px);
  }

  .store-badge img {
    height: 56px;
    width: auto;
  }

  @media (max-width: 1100px) {
    .phone-peek {
      display: none;
    }
  }

  /* ── Done ───────────────────────────────────────────────────── */
  .tiles {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 10px 18px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    text-align: center;
  }

  .tile.on {
    background: rgba(115, 158, 235, 0.09);
    border-color: rgba(115, 158, 235, 0.35);
  }

  .tile-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.55);
  }

  .tile.on .tile-icon {
    background: var(--rl-gradient);
    color: #111114;
  }

  .tile-label {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
  }

  .tile-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.45);
  }

  .tile.on .tile-status {
    color: var(--rl-accent-blue);
  }

  @media (max-width: 900px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* ── Tour ───────────────────────────────────────────────────── */
  /* The popup's own 400px plus room for its scrollbar and the frame's border,
     so it lays out as it does in the toolbar. */
  .tour {
    position: relative;
    width: 418px;
    max-width: 100%;
    margin: 0 auto;
  }

  .tour-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 14px;
    border-radius: 14px 14px 0 0;
    background: #1b1b1f;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-bottom: none;
  }

  .tour-url {
    flex: 1;
    height: 26px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
  }

  .tour-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(115, 158, 235, 0.18);
    box-shadow: 0 0 0 2px rgba(115, 158, 235, 0.5);
  }

  .tour-icon img {
    width: 18px;
    height: 18px;
  }

  /* As tall as fits below the header with breathing room top and bottom
     (the 260px covers the header, the mock toolbar and both margins), for
     anyone who keeps changing settings here. Only on very short windows does
     the minimum make the page scroll. */
  .tour-popup {
    display: block;
    width: 100%;
    height: clamp(460px, calc(100vh - 260px), 860px);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 0 0 16px 16px;
    background: var(--rl-bg);
    box-shadow: 0 40px 80px -24px rgba(0, 0, 0, 0.7);
  }

  /* Once the frame is narrower than its 418px, its border counts inside that width. */
  @media (max-width: 464px) {
    .tour-popup {
      box-sizing: border-box;
    }
  }

  @media (max-width: 900px) {
    header {
      grid-template-columns: auto 1fr;
    }

    .header-spacer {
      display: none;
    }

    .header-center {
      padding-right: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb {
      animation: none;
    }
  }
</style>
