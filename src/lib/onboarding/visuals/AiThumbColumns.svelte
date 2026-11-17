<script lang="ts">
  import RobotIcon from "./RobotIcon.svelte";
  import { AI_THUMBNAILS } from "./aiThumbnails";

  /**
   * Two columns of real AI-video thumbnails drifting past either side of the
   * AI question, dressed as YouTube results. A yes "zaps" them: they blur and
   * a large robot settles over each column.
   */
  let { zapped }: { zapped: boolean } = $props();

  const half = Math.ceil(AI_THUMBNAILS.length / 2);
  // Three copies, scrolled by one copy per loop, so a column is full at every
  // point of the loop, including the first frame.
  const COPIES = 3;
  const columns = [AI_THUMBNAILS.slice(0, half), AI_THUMBNAILS.slice(half)].map((list) =>
    Array.from({ length: COPIES }, () => list).flat(),
  );
  // Video lengths for the duration chips, so the tiles read as YouTube results.
  const DURATIONS = ["12:47", "8:03", "1:02:15", "24:39", "6:58", "15:12", "3:41:07"];
</script>

<div class="columns" class:zapped aria-hidden="true">
  {#each columns as column, c}
    <div class="column {c === 0 ? 'left' : 'right'}">
      <div class="track" style:--copies={COPIES}>
        {#each column as src, i}
          <div class="video">
            <div class="thumb">
              <img {src} alt="" />
              <span class="duration">{DURATIONS[(i + c * 3) % DURATIONS.length]}</span>
            </div>
            <div class="meta">
              <span class="avatar"></span>
              <span class="lines"><span class="line"></span><span class="line short"></span></span>
            </div>
          </div>
        {/each}
      </div>
      <span class="robot"><RobotIcon size={64} filled /></span>
    </div>
  {/each}
</div>

<style>
  .columns {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .column {
    position: absolute;
    top: 0;
    bottom: 0;
    width: clamp(180px, 17vw, 260px);
    /* On the column, not the moving track, so the fade stays put. */
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
    mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
  }

  .column.left {
    left: clamp(16px, 3vw, 48px);
  }

  .column.right {
    right: clamp(16px, 3vw, 48px);
  }

  .track {
    display: flex;
    flex-direction: column;
    animation: scroll 60s linear infinite;
    transition: filter 0.45s ease;
  }

  /* The right column runs downward, starting a third of the way in, so it's
     as full at the top as the left column. */
  .right .track {
    animation-name: scroll-down;
  }

  .video {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 18px;
    opacity: 0.55;
  }

  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.8);
  }

  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .duration {
    position: absolute;
    right: 6px;
    bottom: 6px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.75);
    font-size: 11px;
    font-weight: 600;
    color: #fff;
  }

  .meta {
    display: flex;
    gap: 8px;
  }

  .avatar {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
  }

  .lines {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 3px;
  }

  .line {
    height: 7px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.2);
  }

  .line.short {
    width: 55%;
    background: rgba(255, 255, 255, 0.1);
  }

  .robot {
    position: absolute;
    top: 50%;
    left: 50%;
    display: flex;
    padding: 28px;
    border-radius: 50%;
    background: var(--rl-gradient);
    color: #111114;
    box-shadow: 0 20px 60px -10px rgba(140, 150, 245, 0.6);
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.5);
    transition:
      opacity 0.25s ease,
      transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .zapped .track {
    animation-play-state: paused;
    filter: blur(10px) saturate(0.5);
  }

  .zapped .robot {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    transition-delay: 0.12s;
  }

  .right .robot {
    transition-delay: 0.2s;
  }

  @keyframes scroll {
    from {
      transform: translateY(calc(-100% / var(--copies)));
    }
    to {
      transform: translateY(calc(-200% / var(--copies)));
    }
  }

  @keyframes scroll-down {
    from {
      transform: translateY(calc(-200% / var(--copies)));
    }
    to {
      transform: translateY(calc(-100% / var(--copies)));
    }
  }

  /* Too narrow to keep them clear of the question. Keep in sync with
     AI_THUMB_COLUMNS_HIDDEN_QUERY, which skips the zap wait when hidden. */
  @media (max-width: 1100px) {
    .columns {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track {
      animation: none;
      transform: translateY(calc(-100% / var(--copies)));
    }
  }
</style>
