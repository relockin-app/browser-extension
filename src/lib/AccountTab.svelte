<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    signInWithGoogle,
    isGoogleSignInSupported,
    signInWithApple,
    isAppleSignInSupported,
    signOut as authSignOut,
    getCurrentUser,
    hasEmailIdentity,
    onAuthStateChange,
  } from "@/shared/relockrAuthHelper";
  import { ACCOUNT_DATA, AI_VOTE_DATA, hasDataConsent, requestAccountConsent } from "@/shared/dataConsent";
  import type { User } from "@supabase/supabase-js";
  import AuthProviderButton from "./AuthProviderButton.svelte";
  import ChangePasswordForm from "./ChangePasswordForm.svelte";
  import EmailAuthDialog from "./EmailAuthDialog.svelte";
  import LegalNotice from "./LegalNotice.svelte";
  import TabHeader from "./TabHeader.svelte";
  import { t } from "./i18n";

  const SUPPORT_URL = "https://relockin.com/support";
  // Markers substituted into the translated "%1$s %2$s" format so the prompt
  // and the link can be styled separately while keeping the language's spacing.
  const SUPPORT_PROMPT = "\u0001";
  const SUPPORT_CTA = "\u0002";
  const supportFooterParts = t("support_accountFooterFormat", [SUPPORT_PROMPT, SUPPORT_CTA])
    .split(/(\u0001|\u0002)/)
    .filter(Boolean);

  type View = "loading" | "main" | "change-password";

  let view = $state<View>("loading");
  let user = $state<User | null>(null);
  // Same check as mobile: only accounts with an email identity have a password.
  let hasPassword = $derived(!!user && hasEmailIdentity(user));

  // UI state
  let errorMsg = $state("");
  let isSubmitting = $state(false);
  let googleSupported = $state(false);
  let appleSupported = $state(false);
  let signingInProvider = $state<"google" | "apple" | null>(null);
  let showEmailDialog = $state(false);
  // Firefox's consent prompt can close the action popup and lose the sign-in,
  // so until it's been answered, signing in moves to a full-page tab.
  let consentNeedsFullPage = false;

  let unsubscribe: (() => void) | null = null;

  onMount(async () => {
    googleSupported = isGoogleSignInSupported();
    appleSupported = isAppleSignInSupported();
    consentNeedsFullPage =
      import.meta.env.FIREFOX &&
      browser.extension.getViews({ type: "popup" }).includes(window) &&
      !(await hasDataConsent([...ACCOUNT_DATA, ...AI_VOTE_DATA]));
    const currentUser = await getCurrentUser();
    user = currentUser;
    view = "main";

    unsubscribe = onAuthStateChange((_event, session) => {
      user = session?.user ?? null;
    });
  });

  onDestroy(() => unsubscribe?.());

  function go(target: View) {
    errorMsg = "";
    view = target;
  }

  function openFullPageAccount() {
    void browser.tabs.create({ url: browser.runtime.getURL("/popup.html#account") });
    window.close();
  }

  function handleEmailSignIn() {
    if (consentNeedsFullPage) openFullPageAccount();
    else showEmailDialog = true;
  }

  /** Asks for consent. No awaits before this in a click handler: see requestAccountConsent. */
  async function getConsent(): Promise<boolean> {
    if (consentNeedsFullPage) {
      openFullPageAccount();
      return false;
    }
    const granted = await requestAccountConsent();
    if (!granted) errorMsg = t("settings_accountDataConsentDeclined");
    return granted;
  }

  async function handleGoogleSignIn() {
    errorMsg = "";
    if (!(await getConsent())) return;
    signingInProvider = "google";
    const r = await signInWithGoogle();
    signingInProvider = null;
    if (!r.success) {
      errorMsg = r.error ?? t("settings_accountSignInError");
    }
  }

  async function handleAppleSignIn() {
    errorMsg = "";
    if (!(await getConsent())) return;
    signingInProvider = "apple";
    const r = await signInWithApple();
    signingInProvider = null;
    if (!r.success) {
      errorMsg = r.error ?? t("settings_accountSignInError");
    }
  }

  async function handleSignOut() {
    isSubmitting = true;
    await authSignOut();
    isSubmitting = false;
  }
</script>

{#if view === "loading"}
  <section>
    <p class="loading">{t("common_loading")}</p>
  </section>

{:else if view === "main"}
  <TabHeader
    title={t("main_tabAccount")}
  />
  <!-- Account section -->
  <section>
    {#if user}
      <div class="card">
        <div class="info-row">
          <span class="info-label">{t("settings_accountSignedInAs")}</span>
          <span class="info-value">{user.email}</span>
        </div>
        {#if hasPassword}
          <button class="action-row" onclick={() => go("change-password")}>
            {t("settings_changePasswordCta")}
            <span class="chevron">&rsaquo;</span>
          </button>
        {/if}
        <button
          class="action-row signout"
          onclick={handleSignOut}
          disabled={isSubmitting}
        >
          {isSubmitting ? t("settings_accountSigningOut") : t("settings_accountSignOut")}
        </button>
      </div>
    {:else}
      <div class="auth">
        <AuthProviderButton
          provider="google"
          compact
          label={signingInProvider === "google" ? t("settings_accountSigningIn") : t("settings_accountSignInWithGoogle")}
          note={googleSupported ? undefined : t("settings_accountStatusNotAvailable")}
          disabled={!googleSupported || signingInProvider !== null}
          onclick={handleGoogleSignIn}
        />
        <AuthProviderButton
          provider="apple"
          compact
          label={signingInProvider === "apple" ? t("settings_accountSigningIn") : t("settings_appleSignInCta")}
          note={appleSupported ? undefined : t("settings_accountStatusNotAvailable")}
          disabled={!appleSupported || signingInProvider !== null}
          onclick={handleAppleSignIn}
        />
        <AuthProviderButton
          provider="email"
          compact
          label={t("settings_emailSignInCta")}
          disabled={signingInProvider !== null}
          onclick={handleEmailSignIn}
        />
      </div>
      {#if errorMsg}<p class="error" style="padding-top: 4px;">{errorMsg}</p>{/if}
      <div class="legal"><LegalNotice kind="continue" muted /></div>
      {#if showEmailDialog}
        <EmailAuthDialog onsignedin={() => (showEmailDialog = false)} onclose={() => (showEmailDialog = false)} />
      {/if}
    {/if}
  </section>

  <!-- Subscription section: hidden until subscriptions launch. Restore by uncommenting.
  <section>
    <h2>{t("settings_accountSubscriptionSectionHeader")}</h2>
    <div class="info-row last">
      <span class="info-label">{t("settings_accountPurchaseStatusLabel")}</span>
      <span class="info-value">{user ? t("settings_accountPurchaseStatusFree") : "\u2014"}</span>
    </div>
  </section>
  -->

  <p class="support-footer">
    {#each supportFooterParts as part}
      {#if part === SUPPORT_PROMPT}
        {t("support_accountFooterPrompt")}
      {:else if part === SUPPORT_CTA}
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">{t("support_accountFooterCta")}</a>
      {:else}
        {part}
      {/if}
    {/each}
  </p>

  <!-- Signed out, the sentence under the sign-in buttons already links Terms and Privacy. -->
  <div class="legal-links"><LegalNotice kind="links" legal={!!user} /></div>

{:else}
  <ChangePasswordForm onback={() => go("main")} />
{/if}

<style>
  section {
    padding: 10px 16px 4px;
  }

  /* Used by the hidden subscription section; restore with it.
  h2 {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--rl-subtitle);
  }
  */

  /* ── Info / action rows ───────────────────────────────────── */

  /* Same card as the Web Customizations settings. */
  .card {
    padding: 0 12px;
    border: 1px solid var(--rl-card-border);
    border-radius: 12px;
    background: var(--rl-card-bg);
  }

  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 0;
    border-bottom: 1px solid var(--rl-divider);
  }

  /* Used by the hidden subscription section; restore with it.
  .info-row.last {
    border-bottom: none;
  }
  */

  .info-label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
  }

  .info-value {
    font-size: 13px;
    color: var(--rl-subtitle);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }

  .action-row {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 0;
    font-size: 14px;
    color: var(--rl-accent-blue);
    cursor: pointer;
    border-bottom: 1px solid var(--rl-divider);
    box-sizing: border-box;
  }

  .action-row:last-child {
    border-bottom: none;
  }

  .action-row.signout {
    color: #ff6b6b;
  }

  .action-row:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .chevron {
    font-size: 18px;
    opacity: 0.5;
  }

  /* ── Auth provider buttons ────────────────────────────────── */

  .auth {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }

  /* ── Messages ─────────────────────────────────────────────── */

  .error {
    margin: 4px 0 0;
    font-size: 13px;
    color: #ff6b6b;
  }

  .legal {
    padding: 10px 0 4px;
  }

  .legal-links {
    padding: 0 16px 12px;
  }

  .support-footer {
    margin: 0;
    padding: 16px 16px 12px;
    font-size: 13px;
    text-align: center;
    color: var(--rl-subtitle);
  }

  .support-footer a {
    color: var(--rl-accent-blue);
    text-decoration: none;
  }

  .support-footer a:hover {
    color: var(--rl-accent-lavender);
  }

  .loading {
    font-size: 14px;
    color: var(--rl-subtitle);
    text-align: center;
    padding: 20px 0;
  }
</style>
