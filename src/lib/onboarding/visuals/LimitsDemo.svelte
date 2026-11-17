<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import {
    Bookmark,
    Clapperboard,
    Compass,
    FastForward,
    Heart,
    House,
    MessageCircle,
    MousePointer2,
    Search,
    Send,
    SquarePlus,
  } from "@lucide/svelte";
  import { t } from "../../i18n";
  import MockWindow from "./MockWindow.svelte";

  /**
   * Time limits acted out on a loop, like the mobile apps' demo, on a mock of
   * Instagram's Reels page: the site opens on its pause screen, a 5-minute
   * session gets picked, the reel plays under a big countdown that ticks for a
   * moment and then fast-forwards to its last seconds, and the session ends.
   * `phase` reports which of the three beats is showing.
   */
  let { phase = $bindable(0) }: { phase?: number } = $props();

  const SITE = "Instagram";
  const LENGTHS = [5, 10, 15];
  const SESSION_SECONDS = 5 * 60;
  /** Only before the first loop: time to read the slide before anything moves. */
  const START_DELAY_MS = 1800;
  // Beat lengths in ms: pause screen, unlocked, session ended.
  const PAUSE_MS = 2800;
  const USE_MS = 5000;
  const ENDED_MS = 2800;
  // Within the unlocked beat: tick down a little faster than real time, then
  // fast-forward, then count off the last few seconds.
  const SLOW_MS = 1800;
  const SLOW_SECONDS = 4;
  const FAST_FORWARD_MS = 1300;
  const LAST_SECONDS = 4;
  /** When the cursor clicks, as a share of the pause beat (matches the CSS). */
  const CLICK_AT = 0.68;

  let firstLoop = $state(true);
  let elapsed = $state(0);
  let pauseLength = $derived(PAUSE_MS + (firstLoop ? START_DELAY_MS : 0));
  let picked = $derived(phase === 0 && elapsed > pauseLength - PAUSE_MS * (1 - CLICK_AT));
  let usedMs = $derived(phase === 1 ? elapsed : 0);
  let fastForwarding = $derived(usedMs > SLOW_MS && usedMs < SLOW_MS + FAST_FORWARD_MS);
  let secondsLeft = $derived.by(() => {
    if (usedMs <= SLOW_MS) return SESSION_SECONDS - Math.floor((usedMs / SLOW_MS) * SLOW_SECONDS);
    if (fastForwarding) {
      const f = (usedMs - SLOW_MS) / FAST_FORWARD_MS;
      const from = SESSION_SECONDS - SLOW_SECONDS;
      return Math.round(from - (from - LAST_SECONDS) * f * f);
    }
    const tail = (usedMs - SLOW_MS - FAST_FORWARD_MS) / (USE_MS - SLOW_MS - FAST_FORWARD_MS);
    return Math.max(0, Math.ceil(LAST_SECONDS * (1 - tail)));
  });
  let clock = $derived(`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`);

  const compact = new Intl.NumberFormat(browser.i18n.getUILanguage(), { notation: "compact" });

  let video: HTMLVideoElement | undefined = $state();

  // The reel only plays while the session is unlocked.
  $effect(() => {
    if (!video) return;
    if (phase === 1) void video.play().catch(() => {});
    else video.pause();
  });

  onMount(() => {
    // The parent keeps `phase` between visits, so start each visit from the top.
    phase = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      phase = 1;
      elapsed = SLOW_MS;
      return;
    }
    let start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      elapsed = now - start;
      const length = [pauseLength, USE_MS, ENDED_MS][phase];
      if (elapsed >= length) {
        if (phase === 2) firstLoop = false;
        phase = (phase + 1) % 3;
        start = now;
        elapsed = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
</script>

<MockWindow url="instagram.com/reels">
  <div class="stage" aria-hidden="true">
    <nav class="ig-nav">
      <img class="ig-logo" src="/images/apps/instagram.png" alt="" />
      <House size={20} />
      <Search size={20} />
      <Compass size={20} />
      <span class="active"><Clapperboard size={20} /></span>
      <Send size={20} />
      <Heart size={20} />
      <SquarePlus size={20} />
    </nav>

    <div class="feed">
      <div class="reel">
        <video bind:this={video} src="/images/onboarding/kitten-demo.mp4" muted loop playsinline></video>
        <div class="reel-meta">
          <span class="author"><span class="author-avatar"></span>kitten.knight</span>
          <span class="caption"></span>
        </div>
      </div>
      <div class="actions">
        <span class="action"><Heart size={22} /><small>{compact.format(184000)}</small></span>
        <span class="action"><MessageCircle size={22} /><small>{compact.format(2103)}</small></span>
        <span class="action"><Send size={22} /></span>
        <span class="action"><Bookmark size={22} /></span>
      </div>
    </div>

    {#if phase === 1}
      <div class="timer" class:ff={fastForwarding} in:fly={{ y: -12, duration: 300 }} out:fade={{ duration: 200 }}>
        {#if fastForwarding}<span class="ff-icon" transition:fade={{ duration: 120 }}><FastForward size={18} fill="currentColor" /></span>{/if}
        <span class="clock">{clock}</span>
      </div>
    {/if}

    {#if phase === 0}
      <div class="overlay" in:fade={{ duration: 250 }} out:fly={{ y: -30, duration: 380 }}>
        <p class="heading">{t("onboardingWebext_limitsDemoQuestion", [SITE])}</p>
        <div class="lengths">
          {#each LENGTHS as minutes, i}
            <span class="length" class:picked={picked && i === 0}>
              {t("common_minutesShortFormat", [String(minutes)])}
              {#if i === 0}
                <span class="cursor" style:animation-delay="{pauseLength - PAUSE_MS}ms">
                  <MousePointer2 size={22} fill="white" strokeWidth={1.4} />
                </span>
              {/if}
            </span>
          {/each}
        </div>
      </div>
    {:else if phase === 2}
      <!-- RelockIn's own block screen heading, so it reads as the real thing. -->
      <div class="overlay ended" in:fly={{ y: 40, duration: 420 }} out:fade={{ duration: 250 }}>
        <p class="small">{t("onboardingWebext_limitsDemoEnded", [SITE])}</p>
        <p class="heading big">{t("domShared_blockedOverlayHeading")}</p>
      </div>
    {/if}
  </div>
</MockWindow>

<style>
  .stage {
    position: relative;
    display: flex;
    height: clamp(300px, 46vh, 420px);
    border-radius: 12px;
    overflow: hidden;
    background: #000;
  }

  /* Instagram's left rail, Reels selected. */
  .ig-nav {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 14px 12px;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.85);
  }

  .ig-logo {
    width: 22px;
    height: 22px;
    margin-bottom: 6px;
    border-radius: 6px;
  }

  .ig-nav .active {
    display: flex;
    padding: 6px;
    margin: -6px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }

  .feed {
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 14px;
    padding: 14px 0;
  }

  .reel {
    position: relative;
    height: 100%;
    aspect-ratio: 9 / 16;
    border-radius: 10px;
    overflow: hidden;
    background: #1a1a1f;
  }

  .reel video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .reel-meta {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 24px 10px 10px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  }

  .author {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
  }

  .author-avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7);
  }

  .caption {
    width: 70%;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.5);
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding-bottom: 4px;
    color: #fff;
  }

  .action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .action small {
    font-size: 10px;
    font-weight: 600;
  }

  /* The countdown is the star of the unlocked beat, so it's big. */
  .timer {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 999px;
    background: rgba(12, 12, 14, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.7);
  }

  .clock {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  .ff-icon {
    display: flex;
    color: var(--rl-accent-blue);
  }

  .timer.ff .clock {
    color: var(--rl-accent-blue);
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 20px;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(115, 158, 235, 0.18), transparent 65%),
      rgba(12, 12, 15, 0.96);
    text-align: center;
  }

  .overlay.ended {
    gap: 8px;
  }

  .heading {
    margin: 0;
    max-width: 22ch;
    font-size: 21px;
    font-weight: 700;
    line-height: 1.25;
    color: rgba(255, 255, 255, 0.94);
  }

  .heading.big {
    font-family: var(--rl-font-title);
    font-size: 30px;
    background: var(--rl-gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .small {
    margin: 0;
    font-size: 15px;
    color: rgba(255, 255, 255, 0.6);
  }

  .lengths {
    display: flex;
    gap: 8px;
  }

  .length {
    position: relative;
    padding: 9px 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    font-size: 14px;
    font-weight: 700;
    color: var(--rl-accent-blue);
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .length.picked {
    background: var(--rl-gradient);
    color: #111114;
  }

  /* Glides in from the bottom right and clicks at CLICK_AT of the pause beat,
     after any start delay (set inline). */
  .cursor {
    position: absolute;
    left: 50%;
    top: 50%;
    pointer-events: none;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    animation: cursor 2.8s ease-in-out both;
  }

  @keyframes cursor {
    0%,
    15% {
      transform: translate(90px, 80px);
      opacity: 0;
    }
    25% {
      opacity: 1;
    }
    62% {
      transform: translate(-2px, -2px);
    }
    68% {
      transform: translate(-2px, -2px) scale(0.85);
    }
    74%,
    100% {
      transform: translate(-2px, -2px);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cursor {
      animation: none;
    }
  }
</style>
