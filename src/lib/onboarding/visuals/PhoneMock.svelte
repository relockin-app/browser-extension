<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowDown } from "@lucide/svelte";
  import { t } from "../../i18n";

  /**
   * The top half of an iPhone rising into view, running a Screen-Time-style
   * chart whose daily average shrinks from 8h 12m to 1h 57m: the same chart as
   * the iOS app's onboarding plan slide (ScreenTimeShrinkChart). The numbers
   * are illustrative, not anyone's real data.
   */
  const START_AVERAGE_HOURS = 8 + 12 / 60;
  const END_AVERAGE_HOURS = 1 + 57 / 60;
  // A week's shape as ratios; the averages above set the level. S M T W T F S
  const START_SHAPE = [7.5, 9.0, 11.0, 9.5, 8.0, 10.5, 5.0];
  const END_SHAPE = [1.0, 1.3, 1.6, 1.4, 1.2, 1.5, 0.6];
  // Stacked segments per bar, bottom to top, echoing iOS Screen Time's colors.
  const SEGMENTS: { color: string; fraction: number }[][] = [
    [{ color: "#0a84ff", fraction: 0.7 }, { color: "#66b8ff", fraction: 0.2 }, { color: "#8c8c8c", fraction: 0.1 }],
    [{ color: "#0a84ff", fraction: 0.72 }, { color: "#66b8ff", fraction: 0.18 }, { color: "#8c8c8c", fraction: 0.1 }],
    [{ color: "#0a84ff", fraction: 0.6 }, { color: "#66b8ff", fraction: 0.28 }, { color: "#8c8c8c", fraction: 0.12 }],
    [{ color: "#0a84ff", fraction: 0.75 }, { color: "#66b8ff", fraction: 0.15 }, { color: "#8c8c8c", fraction: 0.1 }],
    [{ color: "#0a84ff", fraction: 0.7 }, { color: "#66b8ff", fraction: 0.2 }, { color: "#8c8c8c", fraction: 0.1 }],
    [{ color: "#0a84ff", fraction: 0.62 }, { color: "#66b8ff", fraction: 0.16 }, { color: "#ff8c00", fraction: 0.14 }, { color: "#8c8c8c", fraction: 0.08 }],
    [{ color: "#0a84ff", fraction: 0.78 }, { color: "#66b8ff", fraction: 0.14 }, { color: "#8c8c8c", fraction: 0.08 }],
  ];
  const DAY_LABELS = [
    t("scheduleCard_sundayShort"),
    t("scheduleCard_mondayShort"),
    t("scheduleCard_tuesdayShort"),
    t("scheduleCard_wednesdayShort"),
    t("scheduleCard_thursdayShort"),
    t("scheduleCard_fridayShort"),
    t("scheduleCard_saturdayShort"),
  ];

  // The phone rises first; the chart starts shrinking once it has landed.
  const RISE_MS = 1500;
  const SHRINK_MS = 3600;

  const scaled = (shape: number[], average: number) => {
    const mean = shape.reduce((a, b) => a + b, 0) / shape.length;
    return shape.map((v) => (v * average) / mean);
  };
  const startHours = scaled(START_SHAPE, START_AVERAGE_HOURS);
  const endHours = scaled(END_SHAPE, END_AVERAGE_HOURS);
  // Rounded up to an even hour so the gridline labels stay whole numbers.
  const maxHours = Math.max(2, Math.ceil(Math.max(...startHours) / 2) * 2);
  const reductionPercent = Math.round((1 - END_AVERAGE_HOURS / START_AVERAGE_HOURS) * 100);

  const language = browser.i18n.getUILanguage();
  const hourFormat = new Intl.NumberFormat(language, { style: "unit", unit: "hour", unitDisplay: "narrow" });
  const minuteFormat = new Intl.NumberFormat(language, { style: "unit", unit: "minute", unitDisplay: "narrow" });
  const percentFormat = new Intl.NumberFormat(language, { style: "percent" });

  let progress = $state(0);
  let hours = $derived(startHours.map((start, i) => start + (endHours[i] - start) * progress));
  let average = $derived(hours.reduce((a, b) => a + b, 0) / hours.length);

  function formatTime(totalHours: number): string {
    const whole = Math.floor(totalHours);
    const minutes = Math.round((totalHours - whole) * 60);
    if (minutes === 0) return hourFormat.format(whole);
    if (minutes === 60) return hourFormat.format(whole + 1);
    return `${hourFormat.format(whole)} ${minuteFormat.format(minutes)}`;
  }

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progress = 1;
      return;
    }
    let frame = 0;
    const startAt = performance.now() + RISE_MS + 200;
    const tick = (now: number) => {
      const linear = Math.min(1, Math.max(0, (now - startAt) / SHRINK_MS));
      progress = 1 - Math.pow(1 - linear, 3);
      if (linear < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="clip" aria-hidden="true">
<div class="phone" style:--rise="{RISE_MS}ms">
  <div class="screen">
    <div class="status"><span>9:41</span></div>
    <p class="screen-title">{t("onboardingWebext_phoneChartTitle")}</p>

    <div class="chart">
      <div class="chart-header">
        <div>
          <p class="muted small">{t("onboarding_overviewChartDailyAverage")}</p>
          <p class="average">{formatTime(average)}</p>
        </div>
        <span class="reduction">
          <ArrowDown size={12} strokeWidth={3} />{percentFormat.format((reductionPercent * progress) / 100)}
        </span>
      </div>

      <div class="plot-row">
        <div class="plot">
          {#each [1, 0.5, 0] as level}
            <span class="grid" style:bottom="{level * 100}%"></span>
          {/each}
          <div class="bars">
            {#each hours as value, i}
              <div class="bar" style:height="{Math.min(value / maxHours, 1) * 100}%">
                {#each [...SEGMENTS[i]].reverse() as segment}
                  <span style:background={segment.color} style:flex-grow={segment.fraction}></span>
                {/each}
              </div>
            {/each}
          </div>
          <span class="avg-line" style:bottom="{(average / maxHours) * 100}%">
            <span class="avg-tag">{t("onboarding_overviewChartAverageShort")}</span>
          </span>
        </div>
        <div class="y-axis">
          <span>{hourFormat.format(maxHours)}</span>
          <span>{hourFormat.format(maxHours / 2)}</span>
          <span>0</span>
        </div>
      </div>
      <div class="days">
        {#each DAY_LABELS as day}<span>{day}</span>{/each}
      </div>
    </div>

  </div>
  <img class="shell" src="/images/onboarding/iphone-shell.webp" alt="" />
</div>
</div>

<style>
  /* The shell image is 800×1627 with a transparent screen; the screen sits
     under it at the insets measured from that image. */
  /* Only the phone's top part shows, fading out at the bottom like a horizon.
     The box reaches well past the phone on every side, so the tilt and the
     drop shadow fade out inside it instead of being cut off at its edges:
     tilted, the phone's top swings ~11% of its height sideways, on top of
     the shadow's blur. The negative margins give that room back to the layout. */
  .clip {
    --phone-width: clamp(220px, 22vw, 300px);
    --room: 200px;
    height: calc(var(--phone-width) * 2.03 * 0.62);
    padding: var(--room) var(--room) 0;
    margin: calc(var(--room) * -1) calc(var(--room) * -1) 0;
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 140px), transparent);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 140px), transparent);
    pointer-events: none;
  }

  /* With room to spare, the phone grows past the QR code and leans in. */
  @media (min-width: 1500px) and (min-height: 800px) {
    .clip {
      --phone-width: 340px;
    }

    .phone {
      rotate: 6deg;
      transform-origin: 50% 100%;
    }
  }

  .phone {
    position: relative;
    width: var(--phone-width);
    aspect-ratio: 800 / 1627;
    margin: 0 auto;
    animation: rise var(--rise) cubic-bezier(0.22, 1, 0.36, 1) both;
    filter: drop-shadow(0 40px 60px rgba(0, 0, 0, 0.6));
  }

  .shell {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .screen {
    position: absolute;
    inset: 2.2% 5.4%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16% 7% 0;
    border-radius: 13% / 6.2%;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(115, 158, 235, 0.2), transparent 60%),
      #0c0c0f;
    container-type: inline-size;
  }

  .status {
    position: absolute;
    top: 3.4%;
    left: 11%;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
  }


  .screen-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #fff;
  }

  .chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 14px;
    background: #17171f;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .chart-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }

  p {
    margin: 0;
  }

  .muted {
    color: rgba(255, 255, 255, 0.62);
  }

  .small {
    font-size: 10px;
    font-weight: 500;
  }

  .average {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.15;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  .reduction {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    font-weight: 600;
    color: #3dd170;
    font-variant-numeric: tabular-nums;
  }

  .plot-row {
    display: flex;
    gap: 6px;
  }

  .plot {
    position: relative;
    flex: 1;
    height: 64px;
  }

  .grid {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: rgba(255, 255, 255, 0.09);
  }

  .bars {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    gap: 7%;
  }

  .bar {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-radius: 2px 2px 0 0;
    overflow: hidden;
  }

  .avg-line {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1.5px dashed #3dd170;
  }

  .avg-tag {
    position: absolute;
    right: 0;
    bottom: 1px;
    padding: 0 3px;
    font-size: 9px;
    font-weight: 600;
    color: #3dd170;
    background: #17171f;
  }

  .y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 20px;
    height: 64px;
    margin-top: -5px;
    font-size: 8px;
    color: rgba(255, 255, 255, 0.62);
  }

  .days {
    display: flex;
    gap: 7%;
    margin-right: 26px;
    font-size: 9px;
    color: rgba(255, 255, 255, 0.62);
  }

  .days span {
    flex: 1;
    text-align: center;
  }


  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(45vh);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .phone {
      animation: none;
    }
  }
</style>
