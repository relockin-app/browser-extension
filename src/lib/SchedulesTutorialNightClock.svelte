<script lang="ts">
  /*
   * A night sky with a big digital clock, ticking over a minute every second
   * or so: sped up just enough to feel the night slipping past 2 AM, slow
   * enough to read as a clock rather than a counter. Mirrors Android
   * `SchedulesTutorialNightClock`.
   */
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import MoonGlyph from "./MoonGlyph.svelte";
  import { formatScheduleMinute } from "./schedulesTutorial";

  const CLOCK_START_MINUTE = 1 * 60 + 57;
  const CLOCK_END_MINUTE = 2 * 60 + 13;
  const CLOCK_RESTING_MINUTE = 2 * 60 + 7;
  const CLOCK_TICK_MS = 1_100;

  /** Unit-square positions and sizes (px), fixed so the sky doesn't reshuffle between frames. */
  const STARS: [number, number, number][] = [
    [0.08, 0.14, 2.5], [0.22, 0.32, 1.5], [0.35, 0.1, 2], [0.52, 0.22, 1.5],
    [0.64, 0.08, 2.5], [0.12, 0.62, 1.5], [0.9, 0.4, 2], [0.8, 0.72, 1.5],
    [0.44, 0.8, 2], [0.27, 0.88, 1.5], [0.95, 0.88, 2],
  ];

  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let skyWidth = $state(420);
  let minuteOfDay = $state(reduceMotion ? CLOCK_RESTING_MINUTE : CLOCK_START_MINUTE);
  const characters = $derived([...formatScheduleMinute(minuteOfDay)]);

  onMount(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      if (minuteOfDay < CLOCK_END_MINUTE) minuteOfDay += 1;
      else clearInterval(interval);
    }, CLOCK_TICK_MS);
    return () => clearInterval(interval);
  });
</script>

<div class="sky" class:still={reduceMotion} bind:clientWidth={skyWidth} style:--sky-width="{skyWidth}px" aria-hidden="true">
  {#each STARS as [x, y, size], index}
    <span
      class="star"
      style:left="{x * 100}%"
      style:top="{y * 100}%"
      style:width="{size * 1.6}px"
      style:height="{size * 1.6}px"
      style:animation-delay="{-index * 1.7}s"
    ></span>
  {/each}

  <span class="sky-cloud big"></span>
  <span class="sky-cloud small"></span>

  <!-- The moon, with a soft glow behind it. -->
  <span class="moon">
    <span class="moon-glow"></span>
    <MoonGlyph size={38} color="#ffedb3" />
  </span>

  <!--
    Only the characters that changed roll over, so "1:59 AM" → "2:00 AM"
    moves the digits and leaves "AM" (or a prefix like 오전) still. Characters
    are matched by position, which holds while the formatted length stays the
    same; a change in length just swaps the whole string.
  -->
  <div class="clock">
    {#key characters.length}
      {#each characters as character, index (index)}
        <span class="clock-cell">
          {#key character}
            <span
              class="clock-char"
              in:fly={{ y: 28, duration: reduceMotion ? 0 : 300 }}
              out:fly={{ y: -28, duration: reduceMotion ? 0 : 300 }}
            >{character === " " || character === " " ? " " : character}</span>
          {/key}
        </span>
      {/each}
    {/key}
  </div>
</div>

<style>
  .sky {
    position: relative;
    width: 100%;
    height: 220px;
    border-radius: 28px;
    overflow: hidden;
    background: linear-gradient(180deg, #080a24, #241a52);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .star {
    position: absolute;
    border-radius: 50%;
    background: #fff;
    transform: translate(-50%, -50%);
    animation: twinkle 4.8s ease-in-out infinite;
  }
  @keyframes twinkle {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 0.85; }
  }

  .sky-cloud {
    position: absolute;
    left: 0;
    background: #fff;
    border-radius: 999px;
    animation: drift linear infinite;
  }
  .sky-cloud::before,
  .sky-cloud::after {
    content: "";
    position: absolute;
    background: inherit;
    border-radius: 50%;
  }
  .sky-cloud.big {
    top: 70%;
    width: 84px;
    height: 24px;
    opacity: 0.16;
    animation-duration: 14s;
  }
  .sky-cloud.small {
    top: 16%;
    width: 58px;
    height: 16px;
    opacity: 0.1;
    animation-duration: 19s;
    animation-delay: -10s;
  }
  .sky-cloud::before {
    width: 40%;
    aspect-ratio: 1;
    left: 18%;
    bottom: 30%;
  }
  .sky-cloud::after {
    width: 50%;
    aspect-ratio: 1;
    left: 40%;
    bottom: 20%;
  }
  @keyframes drift {
    from { transform: translateX(-90px); }
    to { transform: translateX(calc(var(--sky-width, 420px) + 90px)); }
  }

  .moon {
    position: absolute;
    left: 82%;
    top: 20%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .moon-glow {
    position: absolute;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: rgba(255, 237, 179, 0.18);
  }

  .sky.still .star,
  .sky.still .sky-cloud {
    animation: none;
  }
  .sky.still .star {
    opacity: 0.7;
  }
  .sky.still .sky-cloud.big {
    transform: translateX(40px);
  }
  .sky.still .sky-cloud.small {
    transform: translateX(220px);
  }

  .clock {
    position: relative;
    display: flex;
    padding: 0 24px;
    font-family: var(--rl-font-title, ui-monospace, monospace);
    font-size: 48px;
    font-weight: 600;
    line-height: 1.15;
    color: #fff;
    text-shadow: 0 0 18px rgba(140, 166, 255, 0.7);
    white-space: nowrap;
  }
  /* In and out characters share one cell, so a rolling digit never shifts its neighbours. */
  .clock-cell {
    display: inline-grid;
  }
  .clock-char {
    grid-area: 1 / 1;
  }
</style>
