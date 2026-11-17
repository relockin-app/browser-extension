<script lang="ts">
  /*
   * The animated illustration on the schedules tutorial's first and third
   * slides. Mirrors Android `RelockrSchedulesTutorialDemos` / iOS
   * `RelockrSchedulesTutorialDemos`.
   *
   * Built from the app's own UI rather than artwork: a thought bubble stands
   * in for the person, and a simplified rule card is what they act on. Both
   * slides show the same card on purpose; the only difference between them is
   * the schedule, so the difference is the lesson.
   *
   * - "unlock": "I want a break" → a thumb taps 5 min → the sites unlock, run
   *   briefly, relock. Loops.
   * - "scheduleBlocks": the same card under a Sleep schedule, its session
   *   buttons greyed out; the thumb's tap just shakes the button, and only
   *   then does the thought concede defeat. Loops.
   */
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { Lock, LockOpen } from "@lucide/svelte";
  import { t } from "./i18n";
  import MoonGlyph from "./MoonGlyph.svelte";
  import { formatScheduleMinute, sleepScheduleDraft } from "./schedulesTutorial";

  let { variant }: { variant: "unlock" | "scheduleBlocks" } = $props();

  const SESSION_SECONDS = 5 * 60;
  const DEMO_BUTTON_MINUTES = [5, 15, 30];
  const THUMB_SIZE = 44;

  /** Diameter, horizontal offset and how far below the cloud's bottom each dot's bottom sits; nearest the cloud first. */
  const TRAILING_DOTS: [number, number, number][] = [
    [14, -6, 2],
    [10, -26, 10],
    [7, -42, 17],
    [5, -54, 23],
  ];
  // Quick, so the thought is readable almost as soon as it starts appearing.
  const DOT_STAGGER_MS = 35;

  const APP_ICONS = ["/images/apps/instagram.png", "/images/apps/tiktok.png", "/images/apps/facebook.png"];

  // Locked from the first frame on slide 3: the schedule badge is already on
  // the card, so there's no moment it switches on.
  const isScheduleActive = $derived(variant === "scheduleBlocks");
  const thought = $derived(
    variant === "unlock" ? t("schedules_tutorialUnlockThought") : t("schedules_tutorialScheduleThought"),
  );
  const sleep = sleepScheduleDraft(t("schedules_firstScheduleDefaultName"));
  const bandText = t("schedules_tutorialScheduleBandFormat", [
    sleep.name,
    formatScheduleMinute(sleep.startMinute),
    formatScheduleMinute(sleep.endMinute),
  ]);

  // ── Demo state ────────────────────────────────────────────────────
  let isThoughtVisible = $state(false);
  let isThumbVisible = $state(false);
  /** The thumb starts at the thought bubble, so the eye reading the thought follows it to the button. */
  let isThumbOnButton = $state(false);
  let isPressing = $state(false);
  let isUnlocked = $state(false);
  /** Non-null while the demo session runs; replaces the duration buttons with a countdown. */
  let sessionSecondsLeft = $state<number | null>(null);
  let rejectedTapCount = $state(0);

  // ── Thumb geometry ────────────────────────────────────────────────
  let stageEl: HTMLDivElement;
  let thoughtWrapEl: HTMLDivElement;
  let thoughtEl: HTMLDivElement;
  let targetEl = $state<HTMLDivElement | null>(null);
  let thumbStart = $state({ x: 0, y: 0 });
  let thumbTarget = $state({ x: 0, y: 0 });
  let hasMeasured = $state(false);

  function measure() {
    if (!stageEl || !thoughtWrapEl || !thoughtEl || !targetEl) return;
    const stage = stageEl.getBoundingClientRect();
    // The cloud's layout box, not its rect: while hidden it's scaled down.
    const wrap = thoughtWrapEl.getBoundingClientRect();
    const cloudRight = wrap.left + thoughtEl.offsetLeft + thoughtEl.offsetWidth;
    const cloudBottom = wrap.top + thoughtEl.offsetTop + thoughtEl.offsetHeight;
    const target = targetEl.getBoundingClientRect();
    // The cloud's bottom-trailing edge, kept inside the stage when the thought fills the width.
    thumbStart = {
      x: Math.min(cloudRight - stage.left - 16, stage.width - 22),
      y: cloudBottom - stage.top - 6,
    };
    thumbTarget = {
      x: target.left + target.width / 2 - stage.left + 6,
      y: target.top + target.height / 2 - stage.top + 6,
    };
    hasMeasured = true;
  }

  const thumbPosition = $derived(isThumbOnButton ? thumbTarget : thumbStart);

  // ── Cloud geometry (a rounded body with puffs along every edge) ──
  let cloudWidth = $state(0);
  let cloudHeight = $state(0);

  type Circle = { cx: number; cy: number; r: number };
  const cloud = $derived.by(() => {
    const w = cloudWidth;
    const h = cloudHeight;
    // Not laid out yet: no radius to divide the width by.
    if (w <= 0 || h <= 0) return { body: { x: 0, y: 0, width: 0, height: 0, r: 0 }, circles: [] as Circle[] };
    const puffRadius = Math.min(h * 0.34, 24);
    const sidePuffRadius = h * 0.42;
    const puffCount = Math.max(2, Math.round(w / (puffRadius * 1.7)));
    const puffSpacing = (w - puffRadius * 2) / (puffCount - 1);
    const bodyWidth = w - sidePuffRadius;
    const bodyHeight = h - puffRadius;
    const circles: Circle[] = [];
    for (let index = 0; index < puffCount; index++) {
      const x = puffRadius + index * puffSpacing;
      // Alternating sizes keep it from reading as a scalloped ribbon.
      const topRadius = puffRadius * (index % 2 === 0 ? 1 : 0.82);
      const bottomRadius = puffRadius * (index % 2 === 0 ? 0.82 : 1);
      circles.push({ cx: x, cy: topRadius, r: topRadius });
      circles.push({ cx: x, cy: h - bottomRadius, r: bottomRadius });
    }
    circles.push({ cx: sidePuffRadius, cy: h / 2, r: sidePuffRadius });
    circles.push({ cx: w - sidePuffRadius, cy: h / 2, r: sidePuffRadius });
    return {
      body: { x: (w - bodyWidth) / 2, y: (h - bodyHeight) / 2, width: bodyWidth, height: bodyHeight, r: puffRadius },
      circles,
    };
  });

  // ── The loop ──────────────────────────────────────────────────────
  onMount(() => {
    let isAlive = true;
    const wait = (ms: number) =>
      new Promise<boolean>((resolve) => setTimeout(() => resolve(isAlive), ms));

    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(stageEl);

    function resetDemo() {
      isThoughtVisible = false;
      isThumbVisible = false;
      isThumbOnButton = false;
      isPressing = false;
      isUnlocked = false;
      sessionSecondsLeft = null;
    }

    /** Brings the thumb up beside the thought, moves it down to the 5 min button, and presses. */
    async function tapFiveMinutes(): Promise<boolean> {
      measure();
      isThumbVisible = true;
      if (!(await wait(450))) return false;
      isThumbOnButton = true;
      if (!(await wait(900))) return false;
      isPressing = true;
      if (!(await wait(180))) return false;
      isPressing = false;
      return true;
    }

    async function runUnlockLoop() {
      while (isAlive) {
        resetDemo();
        if (!(await wait(400))) return;
        isThoughtVisible = true;
        if (!(await wait(1_600))) return;
        if (!(await tapFiveMinutes())) return;

        isUnlocked = true;
        sessionSecondsLeft = SESSION_SECONDS;
        if (!(await wait(300))) return;
        isThumbVisible = false;

        for (let i = 0; i < 4; i++) {
          if (!(await wait(800))) return;
          sessionSecondsLeft = (sessionSecondsLeft ?? 1) - 1;
        }

        // Time's up: everything relocks and the loop starts over.
        isUnlocked = false;
        sessionSecondsLeft = null;
        isThoughtVisible = false;
        if (!(await wait(1_400))) return;
      }
    }

    async function runScheduleBlocksLoop() {
      while (isAlive) {
        resetDemo();
        if (!(await wait(1_400))) return;
        if (!(await tapFiveMinutes())) return;

        rejectedTapCount += 1;
        if (!(await wait(500))) return;
        isThumbVisible = false;
        if (!(await wait(300))) return;
        isThoughtVisible = true;
        if (!(await wait(3_000))) return;

        isThoughtVisible = false;
        if (!(await wait(1_000))) return;
      }
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      isThoughtVisible = true;
      if (variant === "unlock") {
        isUnlocked = true;
        sessionSecondsLeft = SESSION_SECONDS;
      }
    } else if (variant === "unlock") {
      runUnlockLoop();
    } else {
      runScheduleBlocksLoop();
    }

    return () => {
      isAlive = false;
      resizeObserver.disconnect();
    };
  });

  function clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
</script>

<div class="stage" bind:this={stageEl} aria-hidden="true">
  <!-- Thought bubble: laid out even while hidden, so the thumb has somewhere to start from. -->
  <div class="thought-wrap" bind:this={thoughtWrapEl}>
    <div
      class="thought"
      class:visible={isThoughtVisible}
      bind:this={thoughtEl}
      bind:clientWidth={cloudWidth}
      bind:clientHeight={cloudHeight}
    >
      {#if cloudWidth > 0 && cloudHeight > 0}
        <svg class="cloud" width={cloudWidth} height={cloudHeight}>
          <g fill="var(--thought-fill)">
            <rect x={cloud.body.x} y={cloud.body.y} width={cloud.body.width} height={cloud.body.height} rx={cloud.body.r} />
            {#each cloud.circles as circle}
              <circle cx={circle.cx} cy={circle.cy} r={circle.r} />
            {/each}
          </g>
        </svg>
      {/if}
      <span class="thought-text">{thought}</span>
    </div>

    {#each TRAILING_DOTS as [diameter, x, belowBottom], index}
      <!-- Arrive outermost first and leave innermost first, so the thought always travels from the person. -->
      <span
        class="thought-dot"
        class:visible={isThoughtVisible}
        style:width="{diameter}px"
        style:height="{diameter}px"
        style:left="{36 + x}px"
        style:bottom="{-belowBottom}px"
        style:transition-delay="{(isThoughtVisible ? TRAILING_DOTS.length - 1 - index : index) * DOT_STAGGER_MS}ms"
      ></span>
    {/each}
  </div>

  <!-- A pared-down rule card: its name, its sites and the session buttons. -->
  <div class="rule-card" class:scheduled={isScheduleActive}>
    {#if isScheduleActive}
      <div class="band">
        <MoonGlyph size={14} color="#fff" />
        <span>{bandText}</span>
      </div>
    {/if}

    <div class="rule-head">
      <span class="rule-name">{t("limitsOnboarding_v2SurveyCategoriesOptionSocialMedia")}</span>
      <div class="apps">
        {#each APP_ICONS as src}
          <div class="app" class:unlocked={isUnlocked}>
            <img class="app-tile" {src} alt="" />
            <span class="lock-badge">
              <span class="lock-badge-inner">
                {#if isUnlocked}
                  <LockOpen size={10} color="#fff" strokeWidth={2.75} />
                {:else}
                  <Lock size={10} color="#fff" strokeWidth={2.75} />
                {/if}
              </span>
            </span>
          </div>
        {/each}
      </div>
    </div>

    <div class="divider"></div>

    <!-- Keyed on running or not, so the countdown ticking doesn't crossfade every second. -->
    <div class="session-area">
      {#key sessionSecondsLeft !== null}
        <div class="session-layer" transition:fade={{ duration: 200 }}>
          {#if sessionSecondsLeft !== null}
            <div class="countdown">
              <span class="countdown-time">{clock(sessionSecondsLeft)} / {clock(SESSION_SECONDS)}</span>
              <span class="countdown-caption">{t("session_remainingInSession")}</span>
            </div>
          {:else}
            <div class="start-session">
              <span class="section-title">{t("session_sectionTitleInactive")}</span>
              <div class="duration-row">
                {#each DEMO_BUTTON_MINUTES as minutes, index}
                  {@const isTarget = index === 0}
                  {#if isTarget}
                    <div class="duration-slot" bind:this={targetEl}>
                      {#key rejectedTapCount}
                        <div
                          class="duration-btn"
                          class:blocked={isScheduleActive}
                          class:pressing={isPressing}
                          class:shake={rejectedTapCount > 0}
                        >
                          {#if isScheduleActive}<Lock size={12} strokeWidth={2.5} />{/if}
                          <span>{t("common_minutesShortFormat", String(minutes))}</span>
                        </div>
                      {/key}
                    </div>
                  {:else}
                    <div class="duration-slot">
                      <div class="duration-btn" class:blocked={isScheduleActive}>
                        {#if isScheduleActive}<Lock size={12} strokeWidth={2.5} />{/if}
                        <span>{t("common_minutesShortFormat", String(minutes))}</span>
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/key}
    </div>
  </div>

  <!-- The user's finger: a soft disc that glides from the thought to the button and shrinks a little as it presses. -->
  {#if hasMeasured}
    <div
      class="thumb"
      class:visible={isThumbVisible}
      class:travelling={isThumbOnButton}
      style:transform="translate({thumbPosition.x - THUMB_SIZE / 2}px, {thumbPosition.y - THUMB_SIZE / 2}px)"
    >
      <div class="thumb-disc" class:pressing={isPressing}></div>
    </div>
  {/if}
</div>

<style>
  .stage {
    --thought-fill: #454061;
    --night: #4038a0;

    position: relative;
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 100%;
  }

  /* ── Thought bubble ── */
  .thought-wrap {
    position: relative;
    padding-left: 36px;
  }
  .thought {
    position: relative;
    isolation: isolate;
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    padding: 22px 26px;
    opacity: 0;
    transform: scale(0.6);
    transform-origin: 0 100%;
    transition:
      opacity 150ms ease,
      transform 150ms ease;
  }
  /* Starts as the last dot lands (4 dots x DOT_STAGGER_MS). */
  .thought.visible {
    opacity: 1;
    transform: scale(1);
    transition:
      opacity 160ms ease 140ms,
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1) 140ms;
  }
  .cloud {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: visible;
  }
  .thought-text {
    display: block;
    font-size: 16px;
    font-weight: 500;
    font-style: italic;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.95);
  }
  .thought-dot {
    position: absolute;
    box-sizing: border-box;
    border-radius: 50%;
    background: var(--thought-fill);
    opacity: 0;
    transform: scale(0.3);
    transition:
      opacity 120ms ease,
      transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .thought-dot.visible {
    opacity: 1;
    transform: scale(1);
  }

  /* ── Rule card ── */
  .rule-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    background: var(--rl-card-bg);
    border: 1px solid var(--rl-card-border);
    border-radius: 16px;
  }
  .rule-card.scheduled {
    border: 1.5px solid rgba(64, 56, 160, 0.6);
  }

  .band {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 6px 12px;
    border-radius: 999px;
    background: linear-gradient(90deg, #292673, #5c45b3);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }
  .band span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rule-head {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rule-name {
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .apps {
    display: flex;
    gap: 12px;
  }
  .app {
    position: relative;
    width: 36px;
    height: 36px;
  }
  .app-tile {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 9px;
    object-fit: contain;
    filter: grayscale(1);
    opacity: 0.6;
    transition:
      filter 400ms ease,
      opacity 400ms ease;
  }
  .app.unlocked .app-tile {
    filter: none;
    opacity: 1;
  }
  .lock-badge {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 20px;
    height: 20px;
    box-sizing: border-box;
    padding: 2px;
    border-radius: 50%;
    background: var(--rl-card-bg);
    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .app.unlocked .lock-badge {
    transform: scale(1.1);
  }
  .lock-badge-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.8);
    transition: background 300ms ease;
  }
  .app.unlocked .lock-badge-inner {
    background: #30d158;
  }

  .divider {
    height: 1px;
    background: var(--rl-divider);
  }

  .session-area {
    display: grid;
  }
  .session-layer {
    grid-area: 1 / 1;
  }
  .countdown {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 60px;
  }
  .countdown-time {
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    font-variant-numeric: tabular-nums;
  }
  .countdown-caption {
    font-size: 12px;
    color: var(--rl-subtitle);
  }
  .start-session {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--rl-subtitle);
  }
  .duration-row {
    display: flex;
    gap: 8px;
  }
  .duration-slot {
    flex: 1;
    min-width: 0;
  }
  .duration-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px;
    border-radius: 10px;
    /* Matches the overlay's session buttons (styleButtonCompact). */
    background: var(--rl-gradient);
    color: #1a1a1a;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    transition: transform 150ms ease;
  }
  .duration-btn.blocked {
    background: rgba(128, 128, 128, 0.2);
    color: var(--rl-subtitle);
  }
  .duration-btn.pressing {
    transform: scale(0.94);
  }
  /* A short side-to-side "no", once per rejected tap. */
  .duration-btn.shake {
    animation: shake 450ms linear;
  }
  @keyframes shake {
    0% { translate: 0; }
    8.33% { translate: 7px; }
    25% { translate: -7px; }
    41.67% { translate: 7px; }
    58.33% { translate: -7px; }
    75% { translate: 7px; }
    91.67% { translate: -7px; }
    100% { translate: 0; }
  }

  /* ── Thumb ── */
  .thumb {
    position: absolute;
    top: 0;
    left: 0;
    width: 44px;
    height: 44px;
    pointer-events: none;
    opacity: 0;
    /* Snaps home while invisible, so it never flies back across the card. */
    transition: opacity 260ms ease;
  }
  .thumb.travelling {
    transition:
      opacity 260ms ease,
      transform 750ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .thumb.visible {
    opacity: 1;
  }
  .thumb-disc {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.75);
    border: 3px solid var(--rl-accent-lavender);
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
    transition:
      transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 160ms ease;
  }
  .thumb-disc.pressing {
    transform: scale(0.82);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }
</style>
