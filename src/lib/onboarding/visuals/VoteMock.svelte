<script lang="ts">
  import { MousePointer2 } from "@lucide/svelte";
  import RobotIcon from "./RobotIcon.svelte";
  import { t } from "../../i18n";
  import MockWindow from "./MockWindow.svelte";
  import { VOTE_THUMBNAIL } from "./aiThumbnails";

  /**
   * A video page whose "Is this channel AI?" vote gets cast on a loop, and the
   * video then gets covered the way RelockIn covers AI videos. The channel is
   * made up; the title is the real one of the AI video in the thumbnail, so
   * like the thumbnail it stays in English.
   */
  const CHANNEL_NAME = "Stone Age Slop";
  const VIDEO_TITLE = "What Did Ancient Humans Actually Do All Day?";
</script>

<MockWindow url="youtube.com/watch">
  <div class="video">
    <div class="player">
      <img src={VOTE_THUMBNAIL} alt="" />
      <div class="cover">
        <RobotIcon size={32} filled />
        <span class="cover-title">{t("domShared_ytAiCoverTitle")}</span>
        <span class="cover-link">{t("domShared_ytAiWatchAnyway")}</span>
      </div>
    </div>
    <p class="title">{VIDEO_TITLE}</p>
    <div class="channel">
      <span class="avatar">SS</span>
      <div class="channel-text">
        <span class="channel-name">{CHANNEL_NAME}</span>
        <span class="line"></span>
      </div>
      <div class="vote">
        <span class="question">{t("domShared_ytAiVoteQuestion")}</span>
        <span class="choice ai">
          <RobotIcon size={15} />{t("domShared_ytAiVoteAi")}
          <span class="cursor"><MousePointer2 size={22} fill="white" strokeWidth={1.4} /></span>
        </span>
        <span class="choice">{t("domShared_ytAiNotAi")}</span>
      </div>
    </div>
  </div>
</MockWindow>

<style>
  .video {
    --loop: 6s;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .player {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
  }

  .player img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    animation: blur var(--loop) ease-in-out infinite;
  }

  .cover {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(20, 20, 24, 0.55);
    color: var(--rl-accent-lavender);
    animation: cover var(--loop) ease-in-out infinite;
  }

  .cover-title {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
  }

  .cover-link {
    font-size: 13px;
    font-weight: 600;
    color: var(--rl-accent-blue);
  }

  .title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
    color: rgba(255, 255, 255, 0.92);
  }

  .channel {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, #d9a05b, #8a4f2a);
    font-size: 13px;
    font-weight: 800;
    color: #fff3e0;
  }

  .channel-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .channel-name {
    font-size: 14px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
  }

  .line {
    width: 50%;
    height: 7px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
  }

  .vote {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .question {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
    white-space: nowrap;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8);
    white-space: nowrap;
  }

  .choice.ai {
    position: relative;
    animation: vote var(--loop) ease-in-out infinite;
  }

  .cursor {
    position: absolute;
    left: 50%;
    top: 50%;
    pointer-events: none;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    animation: cursor var(--loop) ease-in-out infinite;
  }

  /* Timeline: the cursor clicks AI at ~35%, the video covers at ~42%, and
     everything resets at the end of the loop. */
  @keyframes cursor {
    0%,
    6% {
      transform: translate(60px, 70px);
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    32% {
      transform: translate(-4px, -2px);
    }
    35% {
      transform: translate(-4px, -2px) scale(0.86);
    }
    38%,
    55% {
      transform: translate(-4px, -2px);
      opacity: 1;
    }
    68%,
    100% {
      transform: translate(50px, 60px);
      opacity: 0;
    }
  }

  @keyframes vote {
    0%,
    34% {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.8);
    }
    37%,
    92% {
      background: var(--rl-gradient);
      color: #121214;
    }
    100% {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.8);
    }
  }

  @keyframes blur {
    0%,
    38% {
      filter: none;
    }
    46%,
    90% {
      filter: blur(14px) saturate(0.6);
    }
    100% {
      filter: none;
    }
  }

  @keyframes cover {
    0%,
    40% {
      opacity: 0;
    }
    48%,
    90% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cursor {
      display: none;
    }

    .player img,
    .cover,
    .choice.ai {
      animation: none;
    }
  }
</style>
