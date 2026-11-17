<script lang="ts">
  import { onMount, tick } from "svelte";
  import { ArrowLeft, X } from "@lucide/svelte";
  import {
    sendPasswordResetEmail,
    signInWithEmail,
    signUpWithEmail,
  } from "@/shared/relockrAuthHelper";
  import { requestAccountConsent } from "@/shared/dataConsent";
  import LegalNotice from "./LegalNotice.svelte";
  import { t } from "./i18n";

  /** Email sign-up and sign-in, for onboarding and the account tab. Most people here are new, so it opens on sign-up. */
  let { onsignedin, onclose }: { onsignedin: () => void; onclose: () => void } = $props();

  type View = "sign-up" | "sign-in" | "forgot-password" | "verify-email" | "forgot-password-sent";

  let view = $state<View>("sign-up");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let errorMsg = $state("");
  let isSubmitting = $state(false);

  let dialog: HTMLDialogElement;
  let emailInput = $state<HTMLInputElement>();

  onMount(() => {
    dialog.showModal();
    emailInput?.focus();
  });

  // The email carries over between screens; passwords don't leave the form they were typed in.
  async function go(target: View): Promise<void> {
    view = target;
    password = confirmPassword = errorMsg = "";
    await tick();
    emailInput?.focus();
  }

  /** Asks for consent. No awaits before this in a submit handler: see requestAccountConsent. */
  async function getConsent(): Promise<boolean> {
    const granted = await requestAccountConsent();
    if (!granted) errorMsg = t("settings_accountDataConsentDeclined");
    return granted;
  }

  async function handleSignUp(): Promise<void> {
    errorMsg = "";
    if (!email || !password || !confirmPassword) {
      errorMsg = t("settings_errorFillAllFields");
      return;
    }
    if (password !== confirmPassword) {
      errorMsg = t("settings_passwordMismatchError");
      return;
    }
    if (password.length < 6) {
      errorMsg = t("settings_emailWeakPasswordError");
      return;
    }
    if (!(await getConsent())) return;
    isSubmitting = true;
    const r = await signUpWithEmail(email, password);
    isSubmitting = false;
    if (!r.success) errorMsg = r.error ?? t("settings_errorSignUpFailed");
    else if (r.emailConfirmationRequired) void go("verify-email");
    else onsignedin();
  }

  async function handleSignIn(): Promise<void> {
    errorMsg = "";
    if (!email || !password) {
      errorMsg = t("settings_errorFillAllFields");
      return;
    }
    if (!(await getConsent())) return;
    isSubmitting = true;
    const r = await signInWithEmail(email, password);
    isSubmitting = false;
    if (!r.success) errorMsg = r.error ?? t("settings_accountSignInError");
    else onsignedin();
  }

  async function handleForgotPassword(): Promise<void> {
    errorMsg = "";
    if (!email) {
      errorMsg = t("settings_errorEnterEmail");
      return;
    }
    if (!(await getConsent())) return;
    isSubmitting = true;
    const r = await sendPasswordResetEmail(email);
    isSubmitting = false;
    if (!r.success) errorMsg = r.error ?? t("settings_errorSendResetEmailFailed");
    else void go("forgot-password-sent");
  }

  function submit(e: SubmitEvent, handler: () => Promise<void>): void {
    e.preventDefault();
    void handler();
  }

  // On press, not click, so dragging a text selection out of a field doesn't close it.
  function closeOnBackdropPress(e: MouseEvent): void {
    if (e.target === dialog) dialog.close();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} aria-label={t("settings_emailSignUpTitle")} onclose={onclose} onmousedown={closeOnBackdropPress}>
  <div class="panel" class:has-tabs={view === "sign-up" || view === "sign-in"}>
    <button class="close" aria-label={t("common_close")} onclick={() => dialog.close()}><X size={18} /></button>

    {#if view === "sign-up" || view === "sign-in"}
      <div class="modes" role="group">
        <button class:active={view === "sign-up"} aria-pressed={view === "sign-up"} onclick={() => go("sign-up")}>
          {t("settings_emailSignUpTitle")}
        </button>
        <button class:active={view === "sign-in"} aria-pressed={view === "sign-in"} onclick={() => go("sign-in")}>
          {t("common_signIn")}
        </button>
      </div>

      <form onsubmit={(e) => submit(e, view === "sign-up" ? handleSignUp : handleSignIn)}>
        <input
          bind:this={emailInput}
          type="email"
          placeholder={t("settings_emailPlaceholder")}
          bind:value={email}
          autocomplete="email"
        />
        <input
          type="password"
          placeholder={t("settings_passwordPlaceholder")}
          bind:value={password}
          autocomplete={view === "sign-up" ? "new-password" : "current-password"}
        />
        {#if view === "sign-up"}
          <input
            type="password"
            placeholder={t("settings_confirmPasswordPlaceholder")}
            bind:value={confirmPassword}
            autocomplete="new-password"
          />
        {:else}
          <button type="button" class="forgot" onclick={() => go("forgot-password")}>
            {t("settings_forgotPasswordCta")}
          </button>
        {/if}
        {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
        <button type="submit" class="submit" disabled={isSubmitting}>
          {#if view === "sign-up"}
            {isSubmitting ? t("settings_creatingAccount") : t("settings_emailSignUpAction")}
          {:else}
            {isSubmitting ? t("settings_accountSigningIn") : t("common_signIn")}
          {/if}
        </button>
      </form>
      {#if view === "sign-up"}
        <div class="legal"><LegalNotice kind="create" /></div>
      {/if}
    {:else if view === "forgot-password"}
      <button class="back" onclick={() => go("sign-in")}><ArrowLeft size={16} />{t("common_back")}</button>
      <h2>{t("settings_emailResetTitle")}</h2>
      <p class="message">{t("settings_emailResetSubtitle")}</p>
      <form onsubmit={(e) => submit(e, handleForgotPassword)}>
        <input
          bind:this={emailInput}
          type="email"
          placeholder={t("settings_emailPlaceholder")}
          bind:value={email}
          autocomplete="email"
        />
        {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
        <button type="submit" class="submit" disabled={isSubmitting}>
          {isSubmitting ? t("settings_sending") : t("settings_emailResetAction")}
        </button>
      </form>
    {:else if view === "verify-email"}
      <h2>{t("settings_emailConfirmationTitle")}</h2>
      <p class="message">{t("settings_emailConfirmationMessage")}</p>
      <p class="sent-to">{email}</p>
      <button class="submit" onclick={() => go("sign-in")}>{t("settings_backToSignIn")}</button>
    {:else}
      <h2>{t("settings_emailResetSentTitle")}</h2>
      <p class="message">{t("settings_emailResetSentMessage")}</p>
      <button class="submit" onclick={() => go("sign-in")}>{t("settings_backToSignIn")}</button>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    box-sizing: border-box;
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    padding: 0;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 24px;
    background: #1b1d24;
    color: rgba(255, 255, 255, 0.87);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
    animation: rise 0.2s ease-out;
  }

  dialog::backdrop {
    background: rgba(5, 7, 12, 0.72);
    animation: fade 0.2s ease-out;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog::backdrop {
      animation: none;
    }
  }

  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 56px 28px 28px;
  }

  .panel.has-tabs {
    padding-top: 12px;
  }

  .close {
    all: unset;
    position: absolute;
    top: 14px;
    right: 14px;
    display: flex;
    padding: 8px;
    border-radius: 50%;
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
  }

  .close:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }

  /* Text tabs on a shared rule, so the switch can't be mistaken for a field. */
  .modes {
    display: flex;
    gap: 24px;
    /* Runs the rule to the panel's edges; the close button sits at its right end. */
    margin: 0 -28px 24px;
    padding: 0 60px 0 28px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .modes button {
    all: unset;
    position: relative;
    padding: 10px 0 14px;
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .modes button:hover {
    color: rgba(255, 255, 255, 0.85);
  }

  .modes button.active {
    color: #fff;
  }

  .modes button.active::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: var(--rl-gradient);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    outline: none;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.92);
    font-family: var(--rl-font-body);
    font-size: 15px;
  }

  input:focus {
    border-color: var(--rl-accent-blue);
  }

  input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .forgot {
    all: unset;
    align-self: flex-end;
    font-size: 13px;
    font-weight: 600;
    color: var(--rl-accent-blue);
    cursor: pointer;
  }

  .forgot:hover {
    color: var(--rl-accent-lavender);
  }

  .submit {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    margin-top: 4px;
    padding: 14px;
    border-radius: 999px;
    background: var(--rl-gradient);
    color: #1a1a1a;
    font-family: var(--rl-font-body);
    font-size: 15px;
    font-weight: 700;
    text-align: center;
    cursor: pointer;
  }

  .submit:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .close:focus-visible,
  .modes button:focus-visible,
  .forgot:focus-visible,
  .back:focus-visible,
  .submit:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 2px;
  }

  .back {
    all: unset;
    position: absolute;
    top: 20px;
    left: 24px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--rl-accent-blue);
    cursor: pointer;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 700;
    color: #fff;
  }

  .message {
    margin: 0 0 18px;
    font-size: 15px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.65);
  }

  .sent-to {
    margin: -8px 0 18px;
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
    color: #fff;
  }

  .legal {
    margin-top: 14px;
    text-align: center;
  }

  .error {
    margin: 0;
    font-size: 13px;
    color: #ff6b6b;
  }
</style>
