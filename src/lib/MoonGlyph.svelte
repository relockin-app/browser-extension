<script lang="ts">
  /** A crescent moon, tilted like the iOS SF Symbol: a disc with an offset disc bitten out of it. */
  let { size, color }: { size: number; color: string } = $props();
</script>

<svg width={size} height={size} viewBox="-1 -1 2 2" aria-hidden="true">
  <path
    d="M0.0023,-1 A1,1 0 1 0 0.9069,0.4214 A0.85,0.85 0 0 1 0.0023,-1 Z"
    fill={color}
    transform="rotate(-20)"
  />
</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
  }
</style>
