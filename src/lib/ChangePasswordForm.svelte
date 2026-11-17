<script lang="ts">
  import { updatePassword } from "@/shared/relockrAuthHelper";
  import { t } from "./i18n";

  let { onback }: { onback: () => void } = $props();

  let newPassword = $state("");
  let confirmNewPassword = $state("");
  let errorMsg = $state("");
  let successMsg = $state("");
  let isSubmitting = $state(false);

  async function handleChangePassword() {
    errorMsg = successMsg = "";
    if (!newPassword || !confirmNewPassword) {
      errorMsg = t("settings_errorFillAllFields");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      errorMsg = t("settings_passwordMismatchError");
      return;
    }
    if (newPassword.length < 6) {
      errorMsg = t("settings_emailWeakPasswordError");
      return;
    }
    isSubmitting = true;
    const r = await updatePassword(newPassword);
    isSubmitting = false;
    if (!r.success) {
      errorMsg = r.error ?? t("settings_newPasswordError");
    } else {
      successMsg = t("settings_passwordUpdatedSuccess");
      newPassword = confirmNewPassword = "";
    }
  }
</script>

<section>
  <button class="back-link" onclick={onback}>&larr; {t("common_back")}</button>
  <h2>{t("settings_changePasswordCta")}</h2>
  <form onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }}>
    <input
      class="input"
      type="password"
      placeholder={t("settings_newPasswordPlaceholder")}
      bind:value={newPassword}
      autocomplete="new-password"
    />
    <input
      class="input"
      type="password"
      placeholder={t("settings_confirmNewPasswordPlaceholder")}
      bind:value={confirmNewPassword}
      autocomplete="new-password"
    />
    {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
    {#if successMsg}<p class="success">{successMsg}</p>{/if}
    <button type="submit" class="submit-btn" disabled={isSubmitting}>
      {isSubmitting ? t("settings_updating") : t("settings_newPasswordAction")}
    </button>
  </form>
</section>

<style>
  section {
    padding: 10px 16px 4px;
  }

  h2 {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--rl-subtitle);
  }

  .back-link {
    all: unset;
    font-size: 13px;
    color: var(--rl-accent-blue);
    cursor: pointer;
    margin-bottom: 8px;
    display: inline-block;
  }

  .back-link:hover {
    color: var(--rl-accent-lavender);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }

  .input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    font-family: var(--rl-font-body);
    outline: none;
    box-sizing: border-box;
  }

  .input:focus {
    border-color: var(--rl-accent-blue);
  }

  .input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .submit-btn {
    all: unset;
    display: block;
    width: 100%;
    padding: 10px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    font-family: var(--rl-font-body);
    color: #1a1a1a;
    background: var(--rl-gradient);
    border-radius: 8px;
    cursor: pointer;
    margin-top: 4px;
    box-sizing: border-box;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 4px 0 0;
    font-size: 13px;
    color: #ff6b6b;
  }

  .success {
    margin: 4px 0 0;
    font-size: 13px;
    color: #6bffa0;
  }
</style>
