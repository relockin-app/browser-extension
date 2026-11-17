import { t } from "~/lib/i18n";
import {
  RL_FONT_BODY,
  RL_FONT_TITLE,
} from "../../overlayUI/designTokens";
import { injectStyle } from "../utils/injectStyle";

export const REDDIT_APP_WALL_TOAST_STYLE_ID =
  "my-reddit-app-wall-toast-css";

export const NEW_REDDIT_GATE_SELECTOR = ".rpl-dialog.configured-xpromo";
export const NEW_REDDIT_APP_SHEET_SELECTOR =
  "faceplate-bottom-sheet#xpromo-bottom-sheet";
export const NEW_REDDIT_LIGHT_DOM_APP_SHEET_SELECTOR = ".rpl-bottom-sheet";

const TOAST_ID = "relockr-reddit-app-wall-toast";
const TOAST_AUTO_DISMISS_MS = 8_000;

let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;
let toastShown = false;

/**
 * Shows the notice once when Reddit's app-specific bottom sheet is present.
 * This is called from Reddit's existing mutation scan, so the guard also
 * prevents a persistent gate from repeatedly showing it. The broader
 * configured-xpromo selector is deliberately excluded because it also covers
 * Reddit's separate sign-in and NSFW gates.
 */
export function showRedditAppWallToastIfPresent(): void {
  if (toastShown || !document.body || !hasBlockingGate()) return;
  toastShown = true;
  showToast();
}

function hasBlockingGate(): boolean {
  return !!document.querySelector(
    `${NEW_REDDIT_APP_SHEET_SELECTOR}[open], ` +
      NEW_REDDIT_LIGHT_DOM_APP_SHEET_SELECTOR,
  );
}

function showToast(): void {
  injectStyle(REDDIT_APP_WALL_TOAST_STYLE_ID, APP_WALL_TOAST_CSS);
  const toast = ensureToast();
  toast.classList.add("relockr-reddit-app-wall-toast-visible");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, TOAST_AUTO_DISMISS_MS);
}

function ensureToast(): HTMLDivElement {
  if (toastEl && toastEl.isConnected) return toastEl;

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.setAttribute("role", "status");

  const copy = document.createElement("div");
  copy.className = "relockr-reddit-app-wall-toast-copy";

  const title = document.createElement("div");
  title.className = "relockr-reddit-app-wall-toast-title";
  title.textContent = t("domShared_redditAppWallToastTitle");

  const body = document.createElement("div");
  body.className = "relockr-reddit-app-wall-toast-body";
  body.textContent = t("domShared_redditAppWallToastBody");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "relockr-reddit-app-wall-toast-close";
  closeBtn.setAttribute(
    "aria-label",
    t("domShared_redditAppWallToastDismiss"),
  );
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", hideToast);

  copy.append(title, body);
  toast.append(copy, closeBtn);
  document.body.appendChild(toast);
  toastEl = toast;
  return toast;
}

function hideToast(): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastEl?.classList.remove("relockr-reddit-app-wall-toast-visible");
}

const APP_WALL_TOAST_CSS = `
  #${TOAST_ID} {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translate(-50%, 12px);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    box-sizing: border-box;
    width: min(440px, calc(100vw - 32px));
    padding: 14px 12px 14px 16px;
    background: #1a1a1b;
    color: #fff;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    z-index: 2147483600;
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease, transform 160ms ease;
  }
  #${TOAST_ID}.relockr-reddit-app-wall-toast-visible {
    opacity: 1;
    transform: translate(-50%, 0);
    pointer-events: auto;
  }
  #${TOAST_ID} .relockr-reddit-app-wall-toast-copy {
    flex: 1;
    min-width: 0;
  }
  #${TOAST_ID} .relockr-reddit-app-wall-toast-title {
    margin-bottom: 5px;
    font-family: ${RL_FONT_TITLE};
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
  }
  #${TOAST_ID} .relockr-reddit-app-wall-toast-body {
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    font-weight: 400;
    line-height: 1.4;
  }
  #${TOAST_ID} .relockr-reddit-app-wall-toast-close {
    flex: 0 0 auto;
    margin-top: -2px;
    padding: 2px 6px;
    background: transparent;
    color: #aaa;
    border: none;
    border-radius: 4px;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }
  #${TOAST_ID} .relockr-reddit-app-wall-toast-close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
`;
