import { t } from "~/lib/i18n";
import { rlog } from "../../rlog";
import {
  findVideo,
  findSkipAdButton,
  isAdActive,
  isSkipButtonReady,
  describeSkipReadiness,
  pressNativeSkip,
  scrubPastAd,
  skipIconNodes,
  isYouTubeControlsPage,
} from "../../overlayUI/showYouTubeControls";

const SVG_NS = "http://www.w3.org/2000/svg";
const BUTTON_ID = "relockin-yt-skip-ad-floating";
const POLL_INTERVAL_MS = 500;

declare global {
  interface Window {
    __relockinSkipAdInstalled?: boolean;
  }
}

/**
 * Mounts a floating "Skip Ad" pill that hovers over the YouTube player while
 * an ad is showing. Idempotent — safe to call repeatedly from the DOM-rescan
 * loop.
 *
 * The button is appended to `<body>` (not the YouTube DOM) so its lifecycle
 * is independent of YouTube's SPA navigation and Polymer rerenders.
 */
export function installFloatingSkipAdButton(): void {
  if (window.__relockinSkipAdInstalled) return;
  if (!isYouTubeControlsPage()) return;
  if (!document.body) return;

  window.__relockinSkipAdInstalled = true;

  const btn = buildButton();
  document.body.appendChild(btn);

  const ac = new AbortController();
  btn.addEventListener("click", () => onClick(), { signal: ac.signal });

  const timer = window.setInterval(() => poll(btn), POLL_INTERVAL_MS);
  poll(btn);

  // Keep position fresh on viewport changes so the button tracks the player.
  window.addEventListener("scroll", () => poll(btn), {
    passive: true,
    signal: ac.signal,
  });
  window.addEventListener("resize", () => poll(btn), {
    passive: true,
    signal: ac.signal,
  });

  // Survive bfcache + SPA nav: re-mount if the button gets ripped out.
  const aliveCheck = window.setInterval(() => {
    if (!btn.isConnected && document.body) {
      document.body.appendChild(btn);
    }
  }, 2000);

  // Allow callers to fully tear down (e.g. when the setting is turned off
  // mid-session). Not used today because applyAnyActiveYoutubeSettings re-
  // installs idempotently, but cheap to expose.
  (btn as unknown as { __teardown: () => void }).__teardown = () => {
    window.clearInterval(timer);
    window.clearInterval(aliveCheck);
    ac.abort();
    btn.remove();
    window.__relockinSkipAdInstalled = false;
  };
}

/**
 * Tears down the floating button if installed. Used when the user toggles the
 * `MakeAdsSkippable` setting off without reloading the page.
 */
export function uninstallFloatingSkipAdButton(): void {
  const existing = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (!existing) {
    window.__relockinSkipAdInstalled = false;
    return;
  }
  const teardown = (existing as unknown as { __teardown?: () => void }).__teardown;
  if (teardown) teardown();
  else {
    existing.remove();
    window.__relockinSkipAdInstalled = false;
  }
}

function buildButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.setAttribute("aria-label", t("domShared_ytControlsSkipAd"));
  btn.style.cssText = `
    position: fixed;
    z-index: 2147483646;
    display: none;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, #fff, #f0f0f0);
    color: #1a1a1a;
    font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 4px 14px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.12);
    cursor: pointer;
    user-select: none;
    transition: transform 0.12s ease, opacity 0.12s ease;
  `;

  const label = document.createElement("span");
  label.textContent = t("domShared_ytControlsSkipAd");

  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "14");
  icon.setAttribute("height", "14");
  icon.setAttribute("fill", "currentColor");
  icon.style.display = "block";
  for (const n of skipIconNodes()) icon.appendChild(n);

  btn.append(label, icon);

  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "scale(1.04)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "scale(1)";
  });

  return btn;
}

let lastLoggedReady: boolean | null = null;
let lastLoggedSelector: string | null = null;

function poll(btn: HTMLButtonElement): void {
  const adActive = isAdActive();
  if (!adActive) {
    btn.style.display = "none";
    return;
  }

  // Stamp out diagnostic noise — only log when the readiness state changes,
  // matching the cadence of the in-overlay skip button's poll.
  const match = findSkipAdButton();
  const ready = !!match && isSkipButtonReady(match.el);
  if (ready !== lastLoggedReady || (match?.selector ?? null) !== lastLoggedSelector) {
    const reason =
      match == null
        ? { matched: false }
        : { matched: true, selector: match.selector, ...describeSkipReadiness(match.el) };
    rlog("floatingSkipAd.poll: state change ready=", ready, reason);
    lastLoggedReady = ready;
    lastLoggedSelector = match?.selector ?? null;
  }

  // Once YouTube's own skip button is clickable, step aside — we'd rather the
  // user press the native control. (Only this floating button steps aside; the
  // session-overlay skip button stays visible since the page is blocked there.)
  if (ready) {
    btn.style.display = "none";
    return;
  }

  positionOverVideo(btn);
  btn.style.display = "inline-flex";
}

function positionOverVideo(btn: HTMLButtonElement): void {
  const video = findVideo();
  if (!video) {
    btn.style.display = "none";
    return;
  }
  const rect = video.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 60) {
    btn.style.display = "none";
    return;
  }

  // Bottom-right corner of the player, nudged inward so it doesn't sit on top
  // of YouTube's own progress bar / native skip button.
  const margin = 16;
  const btnRect = btn.getBoundingClientRect();
  const btnWidth = btnRect.width || 96;
  const btnHeight = btnRect.height || 32;

  const left = Math.max(8, rect.right - btnWidth - margin);
  const top = Math.max(8, rect.bottom - btnHeight - margin * 4);

  btn.style.left = `${left}px`;
  btn.style.top = `${top}px`;
}

function onClick(): void {
  if (!isAdActive()) {
    rlog("floatingSkipAd.click: no ad active; ignoring");
    return;
  }

  const video = findVideo();
  if (!video) {
    rlog("floatingSkipAd.click: no video element found");
    return;
  }

  const match = findSkipAdButton();
  const readiness = match ? describeSkipReadiness(match.el) : null;
  rlog(
    "floatingSkipAd.click: matched selector",
    match?.selector ?? null,
    "readiness",
    readiness,
  );

  if (match && readiness?.ready) {
    pressNativeSkip(match.el);
    // Scoped abort signal — scrubPastAd uses it to bail out mid-step. Fresh
    // controller per click since there's no long-lived owner here.
    const ac = new AbortController();
    window.setTimeout(() => {
      if (isAdActive()) {
        rlog("floatingSkipAd.click: ad still active after native press; scrubbing");
        scrubPastAd(video, ac.signal);
      } else {
        rlog("floatingSkipAd.click: ad cleared after native press");
      }
    }, 400);
    return;
  }

  rlog("floatingSkipAd.click: native skip not ready/absent; scrubbing past ad");
  const ac = new AbortController();
  scrubPastAd(video, ac.signal);
}
