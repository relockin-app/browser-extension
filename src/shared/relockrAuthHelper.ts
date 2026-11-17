import { ACCOUNT_DATA, hasDataConsent } from "./dataConsent";
import { supabase, SUPABASE_AUTH_STORAGE_KEY } from "./supabaseClient";
import { t } from "~/lib/i18n";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import type { OAuthSignInMessage } from "~/types/messages";

// Web application client id (not chrome extension)
const GOOGLE_CLIENT_ID =
  "87894082884-pc62shk8brj464pbou4bdsudk16n85pk.apps.googleusercontent.com";

export interface AuthResult {
  success: boolean;
  error?: string;
  emailConfirmationRequired?: boolean;
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { success: false, error: error.message };

  // No session means email confirmation is required before sign-in
  const needsConfirmation = !!data.user && !data.session;
  return { success: true, emailConfirmationRequired: needsConfirmation };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Whether browser.identity.launchWebAuthFlow is available.
 * Missing on Safari and some mobile browsers.
 */
function hasWebAuthFlow(): boolean {
  return (
    typeof browser !== "undefined" && !!browser.identity?.launchWebAuthFlow
  );
}

export function isGoogleSignInSupported(): boolean {
  return hasWebAuthFlow();
}

export function isAppleSignInSupported(): boolean {
  return hasWebAuthFlow();
}

/**
 * OAuth flows run in the background service worker: launchWebAuthFlow opens a
 * window, which steals focus and closes the action popup, so a flow started
 * from the popup would lose its result before the session could be saved.
 */
async function runInBackground(
  type: OAuthSignInMessage["type"],
): Promise<AuthResult> {
  try {
    const r = (await browser.runtime.sendMessage({
      type,
    } satisfies OAuthSignInMessage)) as AuthResult | undefined;
    return r ?? { success: false, error: t("settings_accountSignInError") };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

export function signInWithGoogle(): Promise<AuthResult> {
  return runInBackground("reelockr.signInWithGoogle");
}

export function signInWithApple(): Promise<AuthResult> {
  return runInBackground("reelockr.signInWithApple");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Background only — see runInBackground. */
export async function runGoogleSignIn(): Promise<AuthResult> {
  if (!isGoogleSignInSupported()) {
    return {
      success: false,
      error: t("settings_accountSignInError"),
    };
  }
  const redirectUrl = browser.identity.getRedirectURL();
  const url = new URL("https://accounts.google.com/o/oauth2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("redirect_uri", redirectUrl);
  url.searchParams.set("scope", "openid email profile");
  // Prevent replay attacks. Supabase hashes the raw nonce and compares it to
  // the token's claim, so Google must receive the hash and Supabase the raw value.
  const nonce = crypto.randomUUID();
  url.searchParams.set("nonce", await sha256Hex(nonce));

  try {
    const resultUrl = await browser.identity.launchWebAuthFlow({
      url: url.href,
      interactive: true,
    });

    if (!resultUrl)
      return { success: false, error: t("settings_accountSignInError") };
    const hashParams = new URLSearchParams(
      new URL(resultUrl).hash.substring(1),
    );
    const idToken = hashParams.get("id_token");
    if (!idToken)
      return { success: false, error: t("settings_accountSignInError") };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
      nonce,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    // User closed the popup or other error
    const msg = e?.message ?? String(e);
    if (
      msg.includes("user") ||
      msg.includes("cancel") ||
      msg.includes("closed")
    ) {
      return { success: false, error: t("settings_accountSignInInterrupted") };
    }
    return { success: false, error: msg };
  }
}

/** Background only — see runInBackground. */
export async function runAppleSignIn(): Promise<AuthResult> {
  if (!isAppleSignInSupported()) {
    return {
      success: false,
      error: t("settings_accountSignInError"),
    };
  }

  const redirectUrl = browser.identity.getRedirectURL();

  // Get Supabase OAuth URL without auto-redirecting
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      skipBrowserRedirect: true,
      redirectTo: redirectUrl,
    },
  });

  if (error || !data.url) {
    return {
      success: false,
      error: error?.message ?? t("settings_accountSignInError"),
    };
  }

  try {
    const resultUrl = await browser.identity.launchWebAuthFlow({
      url: data.url,
      interactive: true,
    });

    if (!resultUrl)
      return { success: false, error: t("settings_accountSignInError") };

    // The client uses Supabase's implicit flow, so the tokens arrive in the hash
    // fragment. It doesn't use PKCE because that setting covers the whole
    // client: password-reset links would then need a secret kept in this
    // extension, but they open on the website.
    const hashParams = new URLSearchParams(
      new URL(resultUrl).hash.substring(1),
    );
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) return { success: false, error: sessionError.message };
      return { success: true };
    }

    // Supabase reports failures (e.g. a rejected Apple client secret) by
    // redirecting with error params, in the hash or the query. They're too
    // technical for the UI, so log them for debugging only.
    const queryParams = new URL(resultUrl).searchParams;
    const param = (key: string) => hashParams.get(key) ?? queryParams.get(key);
    console.error("[RELOCKR] Apple sign-in returned no session:", {
      error: param("error"),
      errorCode: param("error_code"),
      errorDescription: param("error_description"),
    });
    return {
      success: false,
      error: t("settings_accountSignInError"),
    };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (
      msg.includes("user") ||
      msg.includes("cancel") ||
      msg.includes("closed")
    ) {
      return { success: false, error: t("settings_accountSignInInterrupted") };
    }
    return { success: false, error: msg };
  }
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Ends the session on this browser if the user turned off account data in
 * Firefox's add-on settings. Local only: telling the server would send more data.
 */
export async function signOutIfAccountConsentRemoved(): Promise<void> {
  if (await hasDataConsent(ACCOUNT_DATA)) return;
  await supabase.auth.signOut({ scope: "local" });
}

const PASSWORD_RESET_REDIRECT ="https://www.relockin.com/reset-password";

export async function sendPasswordResetEmail(
  email: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: PASSWORD_RESET_REDIRECT,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * True when the account can sign in with a password. `app_metadata.provider`
 * is only the provider the account was created with, so it misses an email
 * identity linked to a Google/Apple account later (and vice versa).
 */
export function hasEmailIdentity(user: User): boolean {
  return user.identities?.some((i) => i.provider === "email") ?? false;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback);

  // Supabase only notifies the client instance that made the change, so pick
  // up sign-ins/outs from other contexts (e.g. OAuth in the background).
  const onStorageChanged = (
    changes: Record<string, unknown>,
    area: string,
  ) => {
    if (area !== "local" || !(SUPABASE_AUTH_STORAGE_KEY in changes)) return;
    getSession().then((session) =>
      callback(session ? "SIGNED_IN" : "SIGNED_OUT", session),
    );
  };
  browser.storage.onChanged.addListener(onStorageChanged);

  return () => {
    subscription.unsubscribe();
    browser.storage.onChanged.removeListener(onStorageChanged);
  };
}
