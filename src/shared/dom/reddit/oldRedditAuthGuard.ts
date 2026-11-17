// Detects whether the user is signed in on old reddit and shows a dismissible
// toast when a swipe action that requires sign-in is attempted while signed
// out. Without this, reddit redirects to /login on the failed action, yanking
// the user out of their browsing flow.

import { t } from "~/lib/i18n";
import { RL_FONT_BODY } from "../../overlayUI/designTokens";

export const OLD_REDDIT_AUTH_TOAST_STYLE_ID = "my-old-reddit-auth-toast-css";

const TOAST_ID = "relockr-signin-toast";
const TOAST_AUTO_DISMISS_MS = 5000;
const LOGIN_URL = "https://old.reddit.com/login";

// `form.logout` only renders for authenticated sessions — the signed-out
// header has just the "Want to join? Log in or sign up" text. If the header
// is missing entirely (unexpected on old reddit, which server-renders it),
// assume signed in so we don't block legitimate actions on a layout we
// don't recognize.
export function isSignedInToOldReddit(): boolean {
  const header = document.querySelector("#header-bottom-right");
  if (!header) return true;
  return !!header.querySelector("form.logout");
}

let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;

export function showOldRedditSignInToast(): void {
  const toast = ensureToast();
  toast.classList.add("relockr-signin-toast-visible");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, TOAST_AUTO_DISMISS_MS);
}

function ensureToast(): HTMLDivElement {
  if (toastEl && toastEl.isConnected) return toastEl;
  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.setAttribute("role", "status");
  const message = document.createElement("span");
  message.className = "relockr-signin-toast-msg";
  message.textContent = t("domShared_redditSignInToastMessage");
  const link = document.createElement("a");
  link.className = "relockr-signin-toast-link";
  link.href = LOGIN_URL;
  link.textContent = t("domShared_redditSignInToastLogin");
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "relockr-signin-toast-close";
  closeBtn.setAttribute("aria-label", t("domShared_redditSignInToastDismiss"));
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", hideToast);
  toast.append(message, link, closeBtn);
  document.body.appendChild(toast);
  toastEl = toast;
  return toast;
}

function hideToast(): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastEl?.classList.remove("relockr-signin-toast-visible");
}

export const AUTH_TOAST_CSS = `
  #${TOAST_ID} {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translate(-50%, 12px);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    column-gap: 12px;
    row-gap: 4px;
    padding: 10px 12px 10px 16px;
    background: #1a1a1b;
    color: #fff;
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    z-index: 2147483600;
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease, transform 160ms ease;
    /* Without an explicit max-content width, a fixed flex container shrinks
       below its single-line size, so flex-wrap kicks in even when the
       viewport has plenty of room. max-width still caps it for narrow
       screens. */
    width: max-content;
    max-width: calc(100vw - 32px);
  }
  #${TOAST_ID}.relockr-signin-toast-visible {
    opacity: 1;
    transform: translate(-50%, 0);
    pointer-events: auto;
  }
  /* Keep each text piece intact; flex-wrap lets the link drop to a second
     line only if the viewport-margin cap forces it. */
  #${TOAST_ID} .relockr-signin-toast-msg,
  #${TOAST_ID} .relockr-signin-toast-link {
    white-space: nowrap;
  }
  #${TOAST_ID} .relockr-signin-toast-link {
    color: #8cb4ff;
    text-decoration: underline;
    font-weight: 600;
  }
  #${TOAST_ID} .relockr-signin-toast-close {
    background: transparent;
    border: none;
    color: #aaa;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }
  #${TOAST_ID} .relockr-signin-toast-close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
`;
