<script lang="ts">
  import { t } from "./i18n";
  import { SOURCE_CODE_URL } from "@/shared/sourceCode";

  const TERMS_URL = "https://relockin.com/terms-of-service";
  // The extension's own policy, which leaves out the app-only parts of the main one.
  const PRIVACY_URL = "https://relockin.com/privacy-policy/extension";
  // Markers substituted into the translated sentence, so the links can sit
  // wherever the language puts them.
  const TERMS = "\u0001";
  const PRIVACY = "\u0002";

  /** "continue" and "create" are the sentence shown before signing up; "links" is a row of links ending with the source code. */
  let {
    kind,
    muted = false,
    legal = true,
  }: {
    kind: "continue" | "create" | "links";
    /** Links in the sentence match the surrounding grey instead of standing out. */
    muted?: boolean;
    /** For "links": false leaves out Terms and Privacy, for when the sentence above already links them. */
    legal?: boolean;
  } = $props();

  let parts = $derived(
    kind === "links"
      ? []
      : t(kind === "create" ? "settings_accountLegalNoticeCreate" : "settings_accountLegalNoticeContinue", [TERMS, PRIVACY])
          .split(/(\u0001|\u0002)/)
          .filter(Boolean),
  );
</script>

{#snippet termsLink()}
  <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">{t("settings_accountTermsOfService")}</a>
{/snippet}

{#snippet privacyLink()}
  <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">{t("settings_accountPrivacyPolicy")}</a>
{/snippet}

<p class:links={kind === "links"} class:muted>
  {#if kind === "links"}
    {#if legal}
      {@render termsLink()}
      {@render privacyLink()}
    {/if}
    <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer">{t("settings_accountSourceCode")}</a>
  {:else}
    {#each parts as part}
      {#if part === TERMS}
        {@render termsLink()}
      {:else if part === PRIVACY}
        {@render privacyLink()}
      {:else}
        {part}
      {/if}
    {/each}
  {/if}
</p>

<style>
  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.5);
  }

  p.links {
    display: flex;
    justify-content: center;
    gap: 16px;
  }

  a {
    color: rgba(255, 255, 255, 0.7);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  a:hover {
    color: #fff;
  }

  p.muted a {
    color: rgba(255, 255, 255, 0.5);
  }

  p.muted a:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  /* Kept quiet so the support link above stays the focus. */
  p.links a {
    text-decoration: none;
    color: rgba(255, 255, 255, 0.3);
  }

  p.links a:hover {
    color: var(--rl-subtitle);
  }
</style>
