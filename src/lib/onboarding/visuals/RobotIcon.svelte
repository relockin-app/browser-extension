<script lang="ts" module>
  let nextGradientId = 0;
</script>

<script lang="ts">
  import { ROBOT_GRADIENT_STOPS, ROBOT_ICON_PATHS } from "~/shared/dom/utils/robotIconSvg";

  /**
   * The Boxicons robot the YouTube AI badges and covers use. Takes the same
   * `size` as the Lucide icons beside it; `strokeWidth` is accepted so it can
   * stand in for one, and ignored. `gradient` fills it blue to lavender.
   */
  let {
    size = 24,
    filled = false,
    gradient = false,
  }: { size?: number; filled?: boolean; gradient?: boolean; strokeWidth?: number } = $props();

  const gradientId = `rl-robot-gradient-${nextGradientId++}`;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={gradient ? `url(#${gradientId})` : "currentColor"}
  aria-hidden="true"
>
  {#if gradient}
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
        {#each ROBOT_GRADIENT_STOPS as stop}
          <stop offset={stop.offset} stop-color={stop.color} />
        {/each}
      </linearGradient>
    </defs>
  {/if}
  {#each ROBOT_ICON_PATHS[filled ? "filled" : "basic"] as d}
    <path {d} />
  {/each}
</svg>
