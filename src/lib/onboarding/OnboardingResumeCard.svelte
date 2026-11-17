<script lang="ts">
  import { t } from "../i18n";
  import RelockInLogo from "../RelockInLogo.svelte";

  /** Shown in the toolbar popup when setup is unfinished: setup needs a full tab. */
  let { onskip }: { onskip: () => void } = $props();

  async function resume(): Promise<void> {
    await browser.tabs.create({ url: browser.runtime.getURL("/popup.html") });
    window.close();
  }
</script>

<div class="card">
  <div class="logo"><RelockInLogo size={22} /></div>
  <h2>{t("onboardingWebext_resumeTitle")}</h2>
  <p>{t("onboardingWebext_resumeBody")}</p>
  <button class="btn primary" onclick={resume}>{t("onboardingWebext_resumeCta")}</button>
  <button class="btn ghost" onclick={onskip}>{t("common_skip")}</button>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px 24px 20px;
    text-align: center;
  }

  .logo {
    margin-bottom: 8px;
    color: #fff;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #fff;
  }

  p {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--rl-subtitle);
  }

  .btn {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    padding: 11px 16px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn.primary {
    background: var(--rl-gradient);
    color: #111114;
  }

  .btn.ghost {
    color: rgba(255, 255, 255, 0.55);
  }

  .btn.ghost:hover {
    color: #fff;
  }
</style>
