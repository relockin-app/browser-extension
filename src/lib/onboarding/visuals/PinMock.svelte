<script lang="ts">
  import { Puzzle, Pin, MousePointer2, CircleUserRound } from "@lucide/svelte";

  /**
   * A browser toolbar acting out pinning on a loop: open the extensions menu,
   * pin RelockIn, see its icon land in the toolbar. Once the real extension
   * is pinned it settles on that final frame.
   */
  let { pinned }: { pinned: boolean } = $props();
</script>

<div class="scene" class:pinned aria-hidden="true">
  <div class="toolbar">
    <span class="url"></span>
    <span class="slot">
      <img class="pinned-icon" src="/images/iconOutline48.png" alt="" />
    </span>
    <span class="tool puzzle"><Puzzle size={18} /></span>
    <span class="tool"><CircleUserRound size={18} /></span>
  </div>

  <div class="menu">
    <div class="menu-title"><span class="ext-name"></span></div>
    <div class="menu-row">
      <span class="ext-icon other"></span>
      <span class="ext-name dim"></span>
      <span class="pin-btn"><Pin size={15} /></span>
    </div>
    <div class="menu-row">
      <img class="ext-icon" src="/images/iconOutline48.png" alt="" />
      <span class="ext-label">RelockIn</span>
      <span class="pin-btn target"><Pin size={15} /></span>
    </div>
  </div>

  <span class="cursor"><MousePointer2 size={22} fill="white" strokeWidth={1.4} /></span>
</div>

<style>
  .scene {
    --loop: 6.5s;
    position: relative;
    width: 100%;
    max-width: 520px;
    height: 300px;
    margin: 0 auto;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 14px;
    background: #1b1b1f;
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.7);
  }

  .url {
    flex: 1;
    height: 30px;
    margin-right: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
  }

  .tool,
  .slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    color: rgba(255, 255, 255, 0.7);
  }

  .slot {
    overflow: hidden;
    width: 0;
    animation: slot var(--loop) ease-in-out infinite;
  }

  .pinned-icon {
    width: 20px;
    height: 20px;
  }

  .puzzle {
    animation: puzzle var(--loop) ease-in-out infinite;
  }

  .menu {
    position: absolute;
    top: 64px;
    right: 6px;
    width: 280px;
    padding: 12px;
    border-radius: 14px;
    background: #232328;
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 24px 50px -12px rgba(0, 0, 0, 0.75);
    transform-origin: top right;
    animation: menu var(--loop) ease-in-out infinite;
  }

  .menu-title {
    display: flex;
    width: 40%;
    padding: 4px 6px 10px;
  }

  .menu-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 6px;
    border-radius: 8px;
  }

  .ext-icon {
    width: 22px;
    height: 22px;
    border-radius: 6px;
  }

  .ext-icon.other {
    background: rgba(255, 255, 255, 0.12);
  }

  .ext-name {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.14);
  }

  .ext-label {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .pin-btn {
    display: flex;
    color: rgba(255, 255, 255, 0.45);
  }

  .pin-btn.target {
    animation: pin var(--loop) ease-in-out infinite;
  }

  /* Positioned by its right/top edges so the click targets line up with the
     toolbar and menu, which are anchored to the right. The pointer's tip sits
     3px into its 22px box. */
  .cursor {
    position: absolute;
    right: 170px;
    top: 220px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    animation: cursor var(--loop) ease-in-out infinite;
  }

  /* Timeline: 0–20% move to the puzzle and click, 20–48% menu open and move
     to the pin, 48% click the pin, 55–80% menu closes and the icon stays. */
  @keyframes cursor {
    0% {
      right: 170px;
      top: 220px;
      opacity: 0;
      transform: none;
    }
    6% {
      opacity: 1;
    }
    17% {
      right: 50px;
      top: 25px;
      transform: none;
    }
    20% {
      right: 50px;
      top: 25px;
      transform: scale(0.82);
    }
    23% {
      right: 50px;
      top: 25px;
      transform: none;
    }
    43% {
      right: 13px;
      top: 153px;
      transform: none;
    }
    47% {
      right: 13px;
      top: 153px;
      transform: scale(0.82);
    }
    50%,
    62% {
      right: 13px;
      top: 153px;
      transform: none;
      opacity: 1;
    }
    76%,
    100% {
      right: 60px;
      top: 230px;
      opacity: 0;
    }
  }

  @keyframes menu {
    0%,
    20% {
      opacity: 0;
      transform: scale(0.94) translateY(-6px);
      visibility: hidden;
    }
    23%,
    58% {
      opacity: 1;
      transform: none;
      visibility: visible;
    }
    64%,
    100% {
      opacity: 0;
      transform: scale(0.97) translateY(-4px);
      visibility: hidden;
    }
  }

  @keyframes puzzle {
    0%,
    19%,
    62%,
    100% {
      background: transparent;
    }
    21%,
    58% {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  @keyframes pin {
    0%,
    46% {
      color: rgba(255, 255, 255, 0.45);
    }
    49%,
    100% {
      color: var(--rl-accent-blue);
    }
  }

  @keyframes slot {
    0%,
    48% {
      width: 0;
    }
    54%,
    92% {
      width: 34px;
      background: rgba(115, 158, 235, 0.16);
    }
    100% {
      width: 0;
    }
  }

  /* Pinned for real: hold the last frame. */
  .scene.pinned .slot {
    animation: none;
    width: 34px;
    background: rgba(115, 158, 235, 0.16);
    box-shadow: 0 0 0 2px rgba(115, 158, 235, 0.5);
  }

  .scene.pinned .menu,
  .scene.pinned .cursor {
    animation: none;
    visibility: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .slot,
    .puzzle,
    .pin-btn.target,
    .cursor {
      animation: none;
    }

    .menu {
      animation: none;
    }

    .cursor {
      display: none;
    }
  }
</style>
