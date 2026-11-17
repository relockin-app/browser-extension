<script lang="ts">
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import { fade, scale } from "svelte/transition";
  import RobotIcon from "./RobotIcon.svelte";
  import { AiContentTreatment } from "~/types/enums";
  import { t } from "../../i18n";
  import MockWindow from "./MockWindow.svelte";
  import { AI_THUMBNAILS } from "./aiThumbnails";

  /** A YouTube-like grid whose AI videos react live to the chosen treatment. */
  let { treatment: treatmentProp }: { treatment: AiContentTreatment } = $props();

  // Start untouched so the first look is the before-and-after.
  let settled = $state(false);
  let treatment = $derived(settled ? treatmentProp : AiContentTreatment.Off);
  onMount(() => {
    const timer = setTimeout(() => (settled = true), 1600);
    return () => clearTimeout(timer);
  });

  // AI videos get real AI thumbnails; the rest stay abstract placeholders.
  const VIDEOS: { id: number; ai: boolean; thumb?: string; src?: string }[] = [
    { id: 1, ai: false, thumb: "linear-gradient(135deg, #3c5a73, #1f2f3d)" },
    { id: 2, ai: false, thumb: "linear-gradient(135deg, #6b5a45, #2e2720)" },
    { id: 3, ai: true, src: AI_THUMBNAILS[0] },
    { id: 4, ai: true, src: "/images/onboarding/ai/lift-anything.webp" },
    { id: 5, ai: false, thumb: "linear-gradient(135deg, #3f6b55, #1c3026)" },
    { id: 6, ai: false, thumb: "linear-gradient(135deg, #5b4a73, #261f33)" },
    { id: 7, ai: false, thumb: "linear-gradient(135deg, #735448, #33231d)" },
    { id: 8, ai: true, src: AI_THUMBNAILS[1] },
    { id: 9, ai: false, thumb: "linear-gradient(135deg, #45606b, #1d2a30)" },
  ];

  let visible = $derived(
    treatment === AiContentTreatment.Hide ? VIDEOS.filter((v) => !v.ai) : VIDEOS,
  );
</script>

<MockWindow url="youtube.com">
  <div class="grid">
    {#each visible as video (video.id)}
      <div class="card" animate:flip={{ duration: 420 }} out:scale={{ duration: 220, start: 0.85 }}>
        <div class="thumb" style:background={video.thumb}>
          {#if video.src}<img src={video.src} alt="" />{/if}
          {#if video.ai && treatment === AiContentTreatment.Badge}
            <span class="badge" transition:scale={{ duration: 200, start: 0.6 }}>
              <RobotIcon size={16} filled gradient /><span class="badge-text">{t("domShared_ytAiBadge")}</span>
            </span>
          {/if}
          <span class="duration"></span>
        </div>
        <div class="meta">
          <span class="avatar"></span>
          <div class="lines">
            <span class="line"></span>
            <span class="line short"></span>
          </div>
        </div>
        {#if video.ai && treatment === AiContentTreatment.Cover}
          <div class="cover" transition:fade={{ duration: 260 }}>
            <RobotIcon size={24} filled gradient />
            <span class="cover-title">{t("domShared_ytAiCoverTitle")}</span>
            <span class="cover-link">{t("domShared_ytAiShowAnyway")}</span>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</MockWindow>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px 14px;
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 10px;
  }

  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
  }

  .duration {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 26px;
    height: 12px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.55);
  }

  .badge {
    position: absolute;
    top: 6px;
    left: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px 3px 7px;
    border-radius: 7px;
    /* Gradient border around a dark fill, like the real badge. */
    border: 1px solid transparent;
    background:
      linear-gradient(rgba(12, 12, 14, 0.88), rgba(12, 12, 14, 0.88)) padding-box,
      var(--rl-gradient) border-box;
    font-size: 14px;
    font-weight: 700;
  }

  .badge-text {
    color: var(--rl-accent-lavender);
    background: var(--rl-gradient);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .meta {
    display: flex;
    gap: 8px;
  }

  .avatar {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
  }

  .lines {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 2px;
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

  .cover {
    position: absolute;
    inset: -4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border-radius: 12px;
    background: rgba(20, 20, 24, 0.72);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(173, 148, 242, 0.35);
    color: var(--rl-accent-lavender);
    text-align: center;
  }

  .cover-title {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
  }

  .cover-link {
    font-size: 11px;
    font-weight: 600;
    color: var(--rl-accent-blue);
  }
</style>
