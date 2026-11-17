<script lang="ts">
  import { onMount } from "svelte";
  import { slide, fade } from "svelte/transition";
  import { House, Clapperboard, CircleUserRound } from "@lucide/svelte";
  import MockWindow from "./MockWindow.svelte";

  /** YouTube's Home with a Shorts shelf and tab that leave when hidden. */
  let { hidden: hiddenProp }: { hidden: boolean } = $props();

  // Start with Shorts showing so the first look is the before-and-after.
  let settled = $state(false);
  let hidden = $derived(settled && hiddenProp);
  onMount(() => {
    const timer = setTimeout(() => (settled = true), 1600);
    return () => clearTimeout(timer);
  });

  const VIDEO_THUMBS = [
    "linear-gradient(135deg, #3c5a73, #1f2f3d)",
    "linear-gradient(135deg, #6b5a45, #2e2720)",
    "linear-gradient(135deg, #3f6b55, #1c3026)",
  ];
  const SHORT_THUMBS = [
    "linear-gradient(180deg, #ff6b6b, #7a2e4d)",
    "linear-gradient(180deg, #ffb347, #8a3b2e)",
    "linear-gradient(180deg, #6bd6ff, #2e4d7a)",
    "linear-gradient(180deg, #c56bff, #3b2e7a)",
    "linear-gradient(180deg, #6bffb0, #2e7a5a)",
  ];
</script>

<MockWindow url="youtube.com">
  <div class="layout">
    <nav class="sidebar">
      <span class="nav-item active"><House size={16} /></span>
      {#if !hidden}
        <span class="nav-item" transition:slide={{ duration: 300 }}><span class="shorts-icon nav"></span></span>
      {/if}
      <span class="nav-item"><Clapperboard size={16} /></span>
      <span class="nav-item"><CircleUserRound size={16} /></span>
    </nav>
    <div class="feed">
      <div class="row">
        {#each VIDEO_THUMBS as thumb}
          <div class="video">
            <div class="thumb" style:background={thumb}></div>
            <span class="line"></span>
            <span class="line short"></span>
          </div>
        {/each}
      </div>
      {#if !hidden}
        <div class="shelf" transition:slide={{ duration: 420 }}>
          <div class="shelf-label"><span class="shorts-icon"></span> Shorts</div>
          <div class="shorts">
            {#each SHORT_THUMBS as thumb}
              <div class="short" style:background={thumb}></div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="calm" in:fade={{ duration: 300, delay: 250 }}>
          <div class="row">
            {#each [...VIDEO_THUMBS].reverse() as thumb}
              <div class="video">
                <div class="thumb" style:background={thumb}></div>
                <span class="line"></span>
                <span class="line short"></span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</MockWindow>

<style>
  .layout {
    display: flex;
    gap: 16px;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    color: rgba(255, 255, 255, 0.45);
  }

  .nav-item.active {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .feed {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .video {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .thumb {
    aspect-ratio: 16 / 9;
    border-radius: 9px;
    margin-bottom: 2px;
  }

  .line {
    height: 7px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.16);
  }

  .line.short {
    width: 60%;
    background: rgba(255, 255, 255, 0.08);
  }

  .shelf-label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
  }

  /* A white PNG used as a mask, so it can take YouTube's red. */
  .shorts-icon {
    width: 15px;
    height: 15px;
    background: #ff4e45;
    mask: url("/images/onboarding/shorts-icon.png") center / contain no-repeat;
  }

  /* In the side rail it's a plain icon like its neighbours; only the shelf's is red. */
  .shorts-icon.nav {
    flex-shrink: 0;
    width: 14px;
    height: 16px;
    background: currentColor;
  }

  .shorts {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }

  .short {
    aspect-ratio: 9 / 16;
    border-radius: 9px;
  }
</style>
