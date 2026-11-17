<script lang="ts">
  import type { Snippet } from "svelte";

  /** A stylized browser window that frames the onboarding's site mockups. */
  let { url, children }: { url: string; children: Snippet } = $props();
</script>

<div class="window" aria-hidden="true">
  <div class="chrome">
    <span class="light"></span><span class="light"></span><span class="light"></span>
    <span class="url">{url}</span>
  </div>
  <div class="page">
    {@render children()}
  </div>
</div>

<style>
  .window {
    width: 100%;
    border-radius: 16px;
    background: #141417;
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow:
      0 40px 80px -24px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }

  .chrome {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 11px 14px;
    background: #1b1b1f;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .light {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
  }

  .url {
    margin-left: 12px;
    flex: 1;
    max-width: 260px;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.01em;
  }

  .page {
    position: relative;
    padding: 18px;
  }
</style>
