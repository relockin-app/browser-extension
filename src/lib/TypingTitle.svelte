<script lang="ts">
  import { onMount } from "svelte";

  /** Types the title out a character at a time, holding its final size from the start so nothing below it jumps. */
  let { text }: { text: string } = $props();

  const characters = $derived(Array.from(text));
  let count = $state(0);

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      count = Number.MAX_SAFE_INTEGER;
      return;
    }
    const interval = setInterval(() => {
      count += 1;
      if (count >= characters.length) clearInterval(interval);
    }, 12);
    return () => clearInterval(interval);
  });
</script>

<h2 class="title" aria-label={text}>
  <span aria-hidden="true">{characters.slice(0, count).join("")}</span><span
    class="untyped"
    aria-hidden="true">{characters.slice(count).join("")}</span
  >
</h2>

<style>
  .title {
    margin: 4px 0 0;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    color: rgba(255, 255, 255, 0.95);
  }
  .untyped {
    opacity: 0;
  }
</style>
