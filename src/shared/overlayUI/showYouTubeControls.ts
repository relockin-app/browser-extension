import { t } from "~/lib/i18n";
import { rlog } from "../rlog";
import { clearContainer } from "./utils/domHelpers";
import { formatPercent, formatSignedSeconds } from "./utils/intlFormat";
import {
  addButtonHover,
  styleButtonCompact,
  styleButtonCompactSecondary,
} from "./utils/buttonStyles";
import { RL_FONT_BODY, RL_GRADIENT } from "./designTokens";

// ── Feature flags ───────────────────────────────────────────────
// Flip any of these to `false` to disable that part of the UI.
// `playPause` is the most important and safest — keep it on.
export const YT_CONTROLS_FEATURES = {
  playPause: true,
  seekButtons: true,
  scrubber: true,
  skipAd: true,
  speed: true, // playback-rate slider, revealed by the speedometer button
  volume: true, // volume wedge slider, revealed by the speaker button
};

export function isYouTubeHostname(): boolean {
  return /(^|\.)youtube\.com$/.test(location.hostname);
}

export function isYouTubeControlsPage(): boolean {
  return (
    isYouTubeHostname() ||
    /(^|\.)youtube-nocookie\.com$/.test(location.hostname) ||
    (location.protocol === "duck:" && location.hostname === "player")
  );
}

export function isTikTokHostname(): boolean {
  return /(^|\.)tiktok\.com$/.test(location.hostname);
}

export function isYouTubeShortsPage(): boolean {
  return isYouTubeHostname() && /^\/shorts(\/|$)/.test(location.pathname);
}

/**
 * Feeds we pause on sight when the block lands: the endless-scroll formats,
 * where letting the current clip play out just feeds the next one. A regular
 * YouTube video is left playing — the user chose that one.
 */
function shouldAutoPause(): boolean {
  return isTikTokHostname() || isYouTubeShortsPage();
}

/** Pages that get the video control panel in the block overlay. */
export function isVideoControlsPage(): boolean {
  return isYouTubeControlsPage() || isTikTokHostname();
}

export function findVideo(): HTMLVideoElement | null {
  // The vertical feeds keep several <video>s mounted at once, so "first in the
  // DOM" isn't reliably the one on screen there.
  if (isTikTokHostname() || isYouTubeShortsPage()) return findMostVisibleVideo();

  const topLevelVideo = document.querySelector<HTMLVideoElement>(
    "video.html5-main-video, video.video-stream, video",
  );
  if (topLevelVideo) return topLevelVideo;

  try {
    for (const iframe of Array.from(document.querySelectorAll("iframe"))) {
      try {
        const video = iframe.contentDocument?.querySelector<HTMLVideoElement>(
          "video.html5-main-video, video.video-stream, video",
        );
        if (video) return video;
      } catch {}
    }
  } catch {}

  return null;
}

/** How much of the viewport a video currently occupies, in square pixels. */
function visibleArea(video: HTMLVideoElement): number {
  const r = video.getBoundingClientRect();
  const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return Math.max(0, w) * Math.max(0, h);
}

/**
 * Picks the video on screen in a vertical feed (TikTok, YouTube Shorts), which
 * mounts the neighbouring clips too. Those neighbours sit off-screen and hold
 * no media yet, so the largest one with a real duration is the one playing;
 * the second pass is a safety net for a video whose metadata hasn't landed.
 */
function findMostVisibleVideo(): HTMLVideoElement | null {
  const videos = Array.from(
    document.querySelectorAll<HTMLVideoElement>("video"),
  );
  const largest = (list: HTMLVideoElement[]) =>
    list.reduce<HTMLVideoElement | null>(
      (best, v) =>
        best === null || visibleArea(v) > visibleArea(best) ? v : best,
      null,
    );
  const loaded = videos.filter((v) => isFinite(v.duration) && v.duration > 0);
  return largest(loaded) ?? largest(videos);
}

/**
 * Pauses playback while the block overlay is up, and keeps it paused when the
 * site tries to (re)start a video underneath (e.g. the feed finishing loading
 * after the overlay appeared). Stops interfering once the user interacts with
 * our controls, so they can resume deliberately.
 */
function autoPauseUntilUserTakesControl(
  wrapper: HTMLDivElement,
  signal: AbortSignal,
): void {
  const pause = (v: HTMLVideoElement) => {
    if (!v.paused) v.pause();
  };
  document.querySelectorAll("video").forEach(pause);

  const autoPauseAc = new AbortController();
  signal.addEventListener("abort", () => autoPauseAc.abort());

  // Media events don't bubble, but they do go through the capture phase.
  document.addEventListener(
    "play",
    (e) => {
      if (e.target instanceof HTMLVideoElement) pause(e.target);
    },
    { capture: true, signal: autoPauseAc.signal },
  );
  const stopAutoPause = () => {
    rlog("Video controls: user took control; stopping auto-pause");
    autoPauseAc.abort();
  };
  for (const type of ["pointerdown", "keydown"]) {
    wrapper.addEventListener(type, stopAutoPause, {
      capture: true,
      signal: autoPauseAc.signal,
    });
  }
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function findSkipAdButton(): { el: HTMLElement; selector: string } | null {
  const selectors = [
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button",
    ".ytp-skip-ad-button",
    "button.ytp-ad-skip-button-container",
    ".ytm-skip-or-preview-button", // mobile
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return { el, selector: sel };
  }
  return null;
}

type SkipReadiness = {
  ready: boolean;
  connected: boolean;
  laidOut: boolean;
  display: string;
  visibility: string;
  pointerEvents: string;
  opacity: number;
  rejectedBy?: string;
};

/**
 * Inspects YouTube's native skip button and returns each property the
 * readiness check looks at, plus which property (if any) caused us to treat
 * the button as not-yet-actionable. Used by `isSkipButtonReady` and by the
 * debug rlogs.
 */
export function describeSkipReadiness(btn: HTMLElement): SkipReadiness {
  const connected = btn.isConnected;
  const laidOut = btn.getClientRects().length > 0;
  const cs = getComputedStyle(btn);
  const display = cs.display;
  const visibility = cs.visibility;
  const pointerEvents = cs.pointerEvents;
  const opacity = parseFloat(cs.opacity || "1");

  let rejectedBy: string | undefined;
  if (!connected) rejectedBy = "not connected";
  else if (!laidOut) rejectedBy = "no client rects (hidden / not laid out)";
  else if (display === "none") rejectedBy = "display:none";
  else if (visibility === "hidden") rejectedBy = "visibility:hidden";
  else if (pointerEvents === "none") rejectedBy = "pointer-events:none";
  // The pre-skip countdown (`Skip in 5…`) sits around opacity 0; the player
  // chrome fading after a pause sits at 0.5. Only the former should reject us.
  else if (opacity < 0.1) rejectedBy = `opacity ${opacity} (dimmed countdown)`;

  return {
    ready: rejectedBy === undefined,
    connected,
    laidOut,
    display,
    visibility,
    pointerEvents,
    opacity,
    rejectedBy,
  };
}

/**
 * True only when YouTube's native skip button is in its *enabled* state.
 *
 * The button lives in the DOM throughout the ad, but during the pre-skip
 * countdown ("Skip in 5…") YouTube renders it dimmed and inert (e.g.
 * `opacity: 0.5`, sometimes `pointer-events: none`). Clicking it then is a
 * genuine no-op — which is exactly why the old wiring "did nothing". We only
 * treat it as actionable once it's actually skippable.
 */
export function isSkipButtonReady(btn: HTMLElement): boolean {
  return describeSkipReadiness(btn).ready;
}

/**
 * Presses YouTube's native skip button. If the match is a wrapper, target its
 * inner `<button>`.
 */
export function pressNativeSkip(btn: HTMLElement): void {
  const target =
    btn.tagName === "BUTTON"
      ? btn
      : (btn.querySelector<HTMLElement>("button") ?? btn);
  rlog(
    "skipAd.pressNativeSkip: target",
    target.tagName,
    target.className,
    "(same as match?",
    target === btn,
    ")",
  );

  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  };
  let dispatched = false;
  try {
    const ptr = { ...base, pointerId: 1, isPrimary: true, button: 0 };
    target.dispatchEvent(new PointerEvent("pointerdown", ptr));
    target.dispatchEvent(new MouseEvent("mousedown", { ...base, button: 0 }));
    target.dispatchEvent(new PointerEvent("pointerup", ptr));
    target.dispatchEvent(new MouseEvent("mouseup", { ...base, button: 0 }));
    target.dispatchEvent(new MouseEvent("click", { ...base, button: 0 }));
    dispatched = true;
  } catch (e) {
    /* PointerEvent unsupported (old WebKit) → native click below covers it */
    rlog("skipAd.pressNativeSkip: synthetic event sequence threw", e);
  }
  target.click();
  rlog(
    "skipAd.pressNativeSkip: done; synthetic sequence dispatched=",
    dispatched,
    "stillConnected=",
    target.isConnected,
  );
}

const SKIP_END_MARGIN_SECONDS = 0.1;
const SKIP_STEP_COUNT = 5;
const SKIP_STEP_INTERVAL_MS = 45;

export function scrubPastAd(video: HTMLVideoElement, signal: AbortSignal): void {
  if (!isFinite(video.duration) || video.duration <= 0) {
    rlog("skipAd.scrubPastAd: video has no finite duration; cannot scrub", {
      duration: video.duration,
    });
    return;
  }

  const start = video.currentTime;
  const target = Math.max(0, video.duration - SKIP_END_MARGIN_SECONDS);

  // Already at/past the landing point — nothing meaningful to walk through.
  if (target <= start) {
    video.currentTime = target;
    rlog("skipAd.scrubPastAd: already near end; snapped to", target, {
      start,
      duration: video.duration,
    });
    return;
  }

  let step = 0;
  const advance = () => {
    if (signal.aborted) {
      rlog("skipAd.scrubPastAd: aborted mid-seek at step", step);
      return;
    }
    step++;
    const next = Math.min(target, start + ((target - start) * step) / SKIP_STEP_COUNT);
    video.currentTime = next;
    if (step < SKIP_STEP_COUNT) {
      window.setTimeout(advance, SKIP_STEP_INTERVAL_MS);
    } else {
      rlog("skipAd.scrubPastAd: stepped seek complete", {
        start,
        target,
        duration: video.duration,
      });
    }
  };
  advance();
}

export function isAdActive(): boolean {
  if (document.querySelector(".html5-video-player.ad-showing")) return true;
  if (document.querySelector(".ytp-ad-player-overlay")) return true;
  if (document.querySelector(".ytp-ad-player-overlay-layout")) return true;
  if (findSkipAdButton()) return true;
  return false;
}

/**
 * Builds a self-contained video control panel to place inside the session
 * overlay. Returns `null` if the current page isn't YouTube or TikTok.
 *
 * Stays hidden until a <video> element with a real duration is found, and
 * auto-rebinds if the user navigates between videos. Event listeners are
 * tied to an AbortController that fires automatically when the panel is
 * removed from the DOM or the underlying video changes.
 *
 * On TikTok and YouTube Shorts, playback is also paused as the panel is
 * created — see `shouldAutoPause`.
 */
export function createVideoControls(): HTMLDivElement | null {
  if (!isVideoControlsPage()) return null;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    display: none;
    flex-direction: column;
    gap: 14px;
    width: calc(100% - 32px);
    max-width: 420px;
    padding: 18px 20px 20px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 14px;
    font-family: ${RL_FONT_BODY};
    box-sizing: border-box;
  `;

  let boundVideo: HTMLVideoElement | null = null;
  let boundAc: AbortController | null = null;

  const teardown = () => {
    boundAc?.abort();
    boundAc = null;
    boundVideo = null;
    clearContainer(wrapper);
  };

  const refresh = () => {
    const v = findVideo();
    const ok = !!v && isFinite(v.duration) && v.duration > 0;

    if (!ok) {
      wrapper.style.display = "none";
      if (boundVideo) teardown();
      return;
    }

    if (v !== boundVideo) {
      teardown();
      boundVideo = v;
      boundAc = new AbortController();
      buildBody(wrapper, v!, boundAc.signal);
    }
    wrapper.style.display = "flex";
  };

  const lifetimeAc = new AbortController();
  if (shouldAutoPause()) {
    autoPauseUntilUserTakesControl(wrapper, lifetimeAc.signal);
  }

  refresh();
  const pollTimer = window.setInterval(refresh, 500);

  // Clean up when the panel leaves the DOM.
  const aliveCheck = window.setInterval(() => {
    if (!wrapper.isConnected) {
      window.clearInterval(pollTimer);
      window.clearInterval(aliveCheck);
      lifetimeAc.abort();
      teardown();
    }
  }, 1500);

  return wrapper;
}

function buildBody(
  wrapper: HTMLDivElement,
  video: HTMLVideoElement,
  signal: AbortSignal,
): void {
  if (YT_CONTROLS_FEATURES.scrubber) {
    wrapper.appendChild(buildScrubber(video, signal));
  }

  wrapper.appendChild(buildControlRow(video, signal));

  // Ad detection and skipping are YouTube-specific.
  if (YT_CONTROLS_FEATURES.skipAd && isYouTubeControlsPage()) {
    wrapper.appendChild(buildSkipAd(video, signal));
  }
}

type RowMode = "transport" | "volume" | "speed";

/** What a slider control hands back to the row that owns it. */
type SliderControl = {
  /** The small circular toggle that lives permanently in the row. */
  button: HTMLButtonElement;
  /** The slider itself, shown only while this control's mode is active. */
  section: HTMLDivElement;
  setOpen: (open: boolean) => void;
};

/**
 * The single control row: `[volume] … [speed]`.
 *
 * The middle swaps between the transport buttons and whichever slider is open,
 * and while a slider is open the other control's toggle is hidden so the row
 * only ever shows one control's icon next to its slider. Swapping *in place* rather than
 * revealing a panel underneath keeps the overlay from growing vertically while
 * a slider is in use, and a fixed `min-height` stops the row from jumping when
 * the tall play button is swapped out.
 */
function buildControlRow(
  video: HTMLVideoElement,
  signal: AbortSignal,
): HTMLDivElement {
  const row = document.createElement("div");
  row.style.cssText = `
    display: flex;
    gap: clamp(4px, 2vw, 8px);
    justify-content: center;
    align-items: center;
    flex-wrap: nowrap;
    width: 100%;
    min-height: ${RL_YT_PLAY_SIZE};
  `;

  const transport = document.createElement("div");
  transport.style.cssText = `
    display: flex;
    gap: clamp(8px, 3vw, 12px);
    justify-content: center;
    align-items: center;
    flex: 0 0 auto;
  `;

  if (YT_CONTROLS_FEATURES.seekButtons) {
    const rewind = document.createElement("button");
    rewind.textContent = formatSignedSeconds(-10);
    rewind.setAttribute(
      "aria-label",
      t("domShared_ytControlsSeekBackAccessibility"),
    );
    styleSeekCircle(rewind);
    rewind.addEventListener(
      "click",
      () => {
        video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
      },
      { signal },
    );
    transport.appendChild(rewind);
  }

  if (YT_CONTROLS_FEATURES.playPause) {
    transport.appendChild(buildPlayPause(video, signal));
  }

  if (YT_CONTROLS_FEATURES.seekButtons) {
    const ffwd = document.createElement("button");
    ffwd.textContent = formatSignedSeconds(10);
    ffwd.setAttribute(
      "aria-label",
      t("domShared_ytControlsSeekForwardAccessibility"),
    );
    styleSeekCircle(ffwd);
    ffwd.addEventListener(
      "click",
      () => {
        const dur = isFinite(video.duration) ? video.duration : Infinity;
        video.currentTime = Math.min(dur, (video.currentTime || 0) + 10);
      },
      { signal },
    );
    transport.appendChild(ffwd);
  }

  let mode: RowMode = "transport";

  const volume = YT_CONTROLS_FEATURES.volume
    ? buildVolumeControl(video, signal, () =>
        setMode(mode === "volume" ? "transport" : "volume"),
      )
    : null;
  const speed = YT_CONTROLS_FEATURES.speed
    ? buildSpeedControl(video, signal, () =>
        setMode(mode === "speed" ? "transport" : "speed"),
      )
    : null;

  const setMode = (next: RowMode) => {
    mode = next;
    transport.style.display = next === "transport" ? "flex" : "none";
    volume?.setOpen(next === "volume");
    speed?.setOpen(next === "speed");
    // Hide the other control's toggle while a slider is open: a speaker icon
    // sitting next to the speed slider reads as if the slider sets the volume.
    if (volume) volume.button.style.display = next === "speed" ? "none" : "inline-flex";
    if (speed) speed.button.style.display = next === "volume" ? "none" : "inline-flex";
  };

  if (volume) row.append(volume.button, volume.section);
  row.appendChild(transport);
  if (speed) row.append(speed.section, speed.button);

  setMode("transport");

  return row;
}

function styleSeekCircle(btn: HTMLButtonElement): void {
  styleButtonCompactSecondary(btn);
  btn.style.width = RL_YT_SEEK_SIZE;
  btn.style.height = RL_YT_SEEK_SIZE;
  btn.style.flex = "0 0 auto";
  btn.style.padding = "0";
  btn.style.borderRadius = "50%";
  btn.style.fontSize = "13px";
  btn.style.fontWeight = "600";
}

/**
 * The small circular toggle shared by the volume and speed controls. Smaller
 * than the seek circles so the two of them read as secondary to the transport
 * buttons they flank.
 */
function createToggleCircle(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    flex: 0 0 auto;
    width: ${RL_YT_TOGGLE_SIZE};
    height: ${RL_YT_TOGGLE_SIZE};
    border-radius: 50%;
    cursor: pointer;
    user-select: none;
    font-family: ${RL_FONT_BODY};
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.7);
    transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
  `;
  return btn;
}

/** Background/foreground for a toggle circle, given its interaction state. */
function paintToggleCircle(
  btn: HTMLButtonElement,
  emphasized: boolean,
  hovered: boolean,
): void {
  const alpha = emphasized ? (hovered ? 0.26 : 0.18) : hovered ? 0.16 : 0.08;
  btn.style.background = `rgba(255,255,255,${alpha})`;
  btn.style.color = emphasized
    ? "rgba(255,255,255,0.95)"
    : "rgba(255,255,255,0.7)";
}

/** Numeric readout shown inside a toggle circle while its slider is open. */
function createToggleValueText(): HTMLSpanElement {
  const el = document.createElement("span");
  el.style.cssText = `
    font-size: 10px;
    font-weight: 700;
    letter-spacing: -0.2px;
    font-variant-numeric: tabular-nums;
  `;
  return el;
}

/** The flex cell a slider occupies when it takes over the middle of the row. */
function createSliderSection(): HTMLDivElement {
  const section = document.createElement("div");
  section.style.cssText = `
    display: none;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 4px;
  `;
  return section;
}

// The control row is five items wide and must not wrap (the sliders take over
// the middle in place), so the buttons scale with the viewport instead of
// sitting at fixed sizes — at 320px CSS pixels the fixed sizes overflow.
const RL_YT_PLAY_SIZE = "clamp(56px, 17vw, 68px)";
const RL_YT_SEEK_SIZE = "clamp(40px, 12vw, 48px)";
const RL_YT_TOGGLE_SIZE = "clamp(34px, 10vw, 40px)";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgNode(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Build icon glyphs as real SVG nodes rather than assigning an HTML string to
// `innerHTML`. YouTube ships `require-trusted-types-for 'script'`, so a string
// assignment to `.innerHTML` throws under Chromium (Android WebView) — but not
// under WebKit (iOS), which ignores Trusted Types. Constructing nodes avoids
// the sink entirely and works everywhere.
function playIconNodes(): SVGElement[] {
  return [
    svgNode("path", {
      d: "M8 5.14v13.72a.5.5 0 0 0 .77.42l10.28-6.86a.5.5 0 0 0 0-.84L8.77 4.72A.5.5 0 0 0 8 5.14Z",
    }),
  ];
}

function pauseIconNodes(): SVGElement[] {
  return [
    svgNode("rect", { x: "6.5", y: "5", width: "4", height: "14", rx: "1.2" }),
    svgNode("rect", { x: "13.5", y: "5", width: "4", height: "14", rx: "1.2" }),
  ];
}

// Speedometer glyph: a dial arc with a needle swept up-and-right (i.e. "fast").
// Stroked rather than filled, so the arc/needle opt out of the parent svg's
// `fill: currentColor` and set `stroke: currentColor` instead.
export function speedIconNodes(): SVGElement[] {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
  };
  return [
    svgNode("path", { d: "M3.7 18.4a9 9 0 1 1 16.6 0", ...stroke }),
    svgNode("path", { d: "M12 18.4 16.5 12.3", ...stroke }),
    svgNode("circle", { cx: "12", cy: "18.4", r: "1.7" }),
  ];
}

// Speaker glyph with 0/1/2 wave arcs depending on how loud it is, or a cross
// when muted — the icon alone tells you roughly where the volume sits.
export function volumeIconNodes(level: number, muted: boolean): SVGElement[] {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
  };
  const nodes: SVGElement[] = [
    svgNode("path", {
      d: "M4 9.3h3.1l4.3-3.5a.6.6 0 0 1 1 .47v11.46a.6.6 0 0 1-1 .47L7.1 14.7H4a1 1 0 0 1-1-1v-3.4a1 1 0 0 1 1-1Z",
    }),
  ];
  if (muted || level <= 0.001) {
    nodes.push(
      svgNode("path", { d: "M15.4 9.6 20 14.2", ...stroke }),
      svgNode("path", { d: "M20 9.6 15.4 14.2", ...stroke }),
    );
    return nodes;
  }
  nodes.push(svgNode("path", { d: "M14.9 9.4a3.6 3.6 0 0 1 0 5.2", ...stroke }));
  if (level > 0.5) {
    nodes.push(svgNode("path", { d: "M17.6 7a7.2 7.2 0 0 1 0 10", ...stroke }));
  }
  return nodes;
}

// "Skip to end" glyph: right-pointing triangle + trailing bar. Built as nodes
// (not innerHTML) so it survives Trusted Types, and uses `fill: currentColor`
// so it inherits the button's text colour.
export function skipIconNodes(): SVGElement[] {
  return [
    svgNode("path", { d: "M5.5 5 5.5 19 15.5 12 Z" }),
    svgNode("rect", { x: "16.6", y: "5", width: "2.6", height: "14", rx: "1" }),
  ];
}

function buildPlayPause(
  video: HTMLVideoElement,
  signal: AbortSignal,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: ${RL_YT_PLAY_SIZE};
    height: ${RL_YT_PLAY_SIZE};
    color: rgba(255,255,255,0.95);
    cursor: pointer;
    user-select: none;
    border-radius: 50%;
    transition: opacity 0.15s ease, transform 0.12s ease;
  `;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "44");
  svg.setAttribute("height", "44");
  svg.setAttribute("fill", "currentColor");
  svg.style.display = "block";
  btn.appendChild(svg);

  const sync = () => {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const nodes = video.paused ? playIconNodes() : pauseIconNodes();
    for (const n of nodes) svg.appendChild(n);
    btn.setAttribute(
      "aria-label",
      video.paused
        ? t("domShared_ytControlsPlay")
        : t("domShared_ytControlsPause"),
    );
  };
  sync();

  btn.addEventListener(
    "click",
    () => {
      if (video.paused) {
        const p = video.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        video.pause();
      }
      sync();
    },
    { signal },
  );

  video.addEventListener("play", sync, { signal });
  video.addEventListener("pause", sync, { signal });
  video.addEventListener("playing", sync, { signal });

  addButtonHover(btn);

  return btn;
}

function buildScrubber(
  video: HTMLVideoElement,
  signal: AbortSignal,
): HTMLDivElement {
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  `;

  // Outer wrap gives a taller hit area (easier to grab on touch) and
  // hosts the thumb as a sibling of the bar, so the thumb can overflow
  // the bar's rounded corners without being clipped.
  const barWrap = document.createElement("div");
  barWrap.style.cssText = `
    position: relative;
    width: 100%;
    height: 18px;
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: none;
  `;

  const bar = document.createElement("div");
  bar.style.cssText = `
    position: relative;
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: rgba(255,255,255,0.14);
    overflow: hidden;
  `;

  const fill = document.createElement("div");
  fill.style.cssText = `
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 0%;
    background: ${RL_GRADIENT};
  `;
  bar.appendChild(fill);

  const thumb = document.createElement("div");
  thumb.style.cssText = `
    position: absolute;
    left: 0%;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow:
      0 2px 6px rgba(0,0,0,0.35),
      0 0 0 1px rgba(0,0,0,0.12);
    transform: translate(-50%, -50%);
    transition: transform 0.12s ease;
    pointer-events: none;
  `;

  barWrap.appendChild(bar);
  barWrap.appendChild(thumb);

  const labels = document.createElement("div");
  labels.style.cssText = `
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: rgba(255,255,255,0.6);
    font-variant-numeric: tabular-nums;
  `;
  const cur = document.createElement("span");
  const dur = document.createElement("span");
  cur.textContent = "0:00";
  dur.textContent = "0:00";
  labels.appendChild(cur);
  labels.appendChild(dur);

  container.appendChild(barWrap);
  container.appendChild(labels);

  let dragging = false;

  const setPosition = (pct: number) => {
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
  };

  const update = () => {
    if (dragging) return;
    const d = video.duration || 0;
    const c = video.currentTime || 0;
    const pct = d > 0 ? Math.min(100, (c / d) * 100) : 0;
    setPosition(pct);
    cur.textContent = formatTime(c);
    dur.textContent = formatTime(d);
  };
  update();

  video.addEventListener("timeupdate", update, { signal });
  video.addEventListener("durationchange", update, { signal });
  video.addEventListener("loadedmetadata", update, { signal });

  const seekTo = (clientX: number) => {
    const rect = bar.getBoundingClientRect();
    if (rect.width === 0) return;
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setPosition(r * 100);
    if (isFinite(video.duration) && video.duration > 0) {
      const t = r * video.duration;
      video.currentTime = t;
      cur.textContent = formatTime(t);
    }
  };

  barWrap.addEventListener(
    "pointerdown",
    (e) => {
      dragging = true;
      thumb.style.transform = "translate(-50%, -50%) scale(1.25)";
      try {
        barWrap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      seekTo(e.clientX);
    },
    { signal },
  );
  barWrap.addEventListener(
    "pointermove",
    (e) => {
      if (!dragging) return;
      seekTo(e.clientX);
    },
    { signal },
  );
  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    thumb.style.transform = "translate(-50%, -50%)";
    try {
      barWrap.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  barWrap.addEventListener("pointerup", end, { signal });
  barWrap.addEventListener("pointercancel", end, { signal });

  return container;
}

// ── Playback speed ──────────────────────────────────────────────
// Discrete stops, laid out at even spacing on the slider (index-based, not
// value-based) so every step is equally easy to hit — including the fine
// near-1× stops, which would otherwise be an unhittable cluster. The <video>
// element accepts well past 3×; YouTube's own menu caps at 2×, we don't.
const SPEED_STEPS = [
  0.25, 0.5, 0.75, 0.9, 0.95, 1, 1.05, 1.1, 1.25, 1.5, 1.6, 1.75, 1.9, 2, 2.25,
  2.5, 2.75, 3,
];
const SPEED_DEFAULT_INDEX = SPEED_STEPS.indexOf(1);
// A tick per stop would be visual noise at 18 stops, so only the round values
// get one — enough to orient by without turning the bar into a comb.
const SPEED_TICK_VALUES = [0.5, 1, 1.5, 2, 2.5];

function formatSpeed(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

/** Snaps an arbitrary rate (e.g. one YouTube's own menu set) onto our stops. */
function nearestSpeedIndex(rate: number): number {
  if (!isFinite(rate) || rate <= 0) return SPEED_DEFAULT_INDEX;
  let best = SPEED_DEFAULT_INDEX;
  let bestDiff = Infinity;
  for (let i = 0; i < SPEED_STEPS.length; i++) {
    const diff = Math.abs(SPEED_STEPS[i] - rate);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/**
 * Speedometer button + the playback-rate slider it swaps into the row.
 *
 * While closed the button shows the speedometer at 1×, and the rate itself
 * ("1.5×") otherwise — so a speed you left behind is visible without opening
 * anything. While open it always shows the rate, which doubles as the slider's
 * readout and saves a separate label from eating into the row's width.
 */
function buildSpeedControl(
  video: HTMLVideoElement,
  signal: AbortSignal,
  onToggle: () => void,
): SliderControl {
  const button = createToggleCircle();

  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "22");
  icon.setAttribute("height", "22");
  icon.setAttribute("fill", "currentColor");
  icon.style.display = "block";
  for (const n of speedIconNodes()) icon.appendChild(n);

  const rateText = createToggleValueText();
  button.append(icon, rateText);

  const section = createSliderSection();

  // Same bar/thumb construction as the scrubber: a tall wrap for the hit area,
  // with the thumb as a sibling of the bar so it isn't clipped.
  const barWrap = document.createElement("div");
  barWrap.style.cssText = `
    position: relative;
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: none;
  `;
  barWrap.setAttribute("role", "slider");
  barWrap.setAttribute("tabindex", "0");
  barWrap.setAttribute("aria-label", t("domShared_ytControlsSpeed"));
  barWrap.setAttribute("aria-valuemin", String(SPEED_STEPS[0]));
  barWrap.setAttribute(
    "aria-valuemax",
    String(SPEED_STEPS[SPEED_STEPS.length - 1]),
  );

  const bar = document.createElement("div");
  bar.style.cssText = `
    position: relative;
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: rgba(255,255,255,0.14);
    overflow: hidden;
  `;

  const fill = document.createElement("div");
  fill.style.cssText = `
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 0%;
    background: ${RL_GRADIENT};
  `;
  bar.appendChild(fill);

  // Ticks for the round stops only. Endpoints are skipped either way — the bar
  // clips them in half against its rounded ends.
  for (const tickValue of SPEED_TICK_VALUES) {
    const i = SPEED_STEPS.indexOf(tickValue);
    if (i <= 0 || i >= SPEED_STEPS.length - 1) continue;
    const tick = document.createElement("div");
    tick.style.cssText = `
      position: absolute;
      top: 0; bottom: 0;
      left: ${(i / (SPEED_STEPS.length - 1)) * 100}%;
      width: 2px;
      transform: translateX(-50%);
      background: rgba(255,255,255,0.35);
      pointer-events: none;
    `;
    bar.appendChild(tick);
  }

  const thumb = document.createElement("div");
  thumb.style.cssText = `
    position: absolute;
    left: 0%;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow:
      0 2px 6px rgba(0,0,0,0.35),
      0 0 0 1px rgba(0,0,0,0.12);
    transform: translate(-50%, -50%);
    transition: transform 0.12s ease;
    pointer-events: none;
  `;

  // Value labels under the ticks, so the axis can be read without dragging.
  // Positioned against `barWrap`, which spans the same width as the bar.
  const tickLabels: HTMLSpanElement[] = [];
  for (const tickValue of SPEED_TICK_VALUES) {
    const i = SPEED_STEPS.indexOf(tickValue);
    if (i < 0) continue;
    const label = document.createElement("span");
    label.textContent = formatSpeed(tickValue);
    label.style.cssText = `
      position: absolute;
      top: calc(50% + 7px);
      left: ${(i / (SPEED_STEPS.length - 1)) * 100}%;
      transform: translateX(-50%);
      font-size: 9px;
      line-height: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.45);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      pointer-events: none;
    `;
    label.setAttribute("aria-hidden", "true");
    tickLabels.push(label);
  }

  barWrap.append(bar, ...tickLabels, thumb);
  section.appendChild(barWrap);

  let index = nearestSpeedIndex(video.playbackRate || 1);
  let open = false;
  let hovered = false;

  const paint = () => {
    const rate = SPEED_STEPS[index];
    const showValue = open || rate !== 1;

    icon.style.display = showValue ? "none" : "block";
    rateText.style.display = showValue ? "block" : "none";
    rateText.textContent = formatSpeed(rate);

    paintToggleCircle(button, showValue, hovered);
    button.setAttribute(
      "aria-label",
      t("domShared_ytControlsSpeedAccessibilityFormat", [formatSpeed(rate)]),
    );
    button.setAttribute("aria-expanded", open ? "true" : "false");

    const pct = (index / (SPEED_STEPS.length - 1)) * 100;
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    barWrap.setAttribute("aria-valuenow", String(rate));
    barWrap.setAttribute("aria-valuetext", formatSpeed(rate));
  };

  const setIndex = (next: number) => {
    const clamped = Math.min(SPEED_STEPS.length - 1, Math.max(0, next));
    if (clamped === index) return;
    index = clamped;
    try {
      video.playbackRate = SPEED_STEPS[index];
    } catch {
      /* some players reject rates outside their supported range */
    }
    paint();
  };

  paint();

  // Keep in sync when something else moves the rate — YouTube's own menu, or
  // the player resetting to 1× across an ad break / navigation.
  video.addEventListener(
    "ratechange",
    () => {
      const fromVideo = nearestSpeedIndex(video.playbackRate || 1);
      if (fromVideo === index) return;
      index = fromVideo;
      paint();
    },
    { signal },
  );

  button.addEventListener("click", onToggle, { signal });
  button.addEventListener("mouseenter", () => {
    hovered = true;
    paint();
  });
  button.addEventListener("mouseleave", () => {
    hovered = false;
    paint();
  });

  let dragging = false;

  const pickAt = (clientX: number) => {
    const rect = bar.getBoundingClientRect();
    if (rect.width === 0) return;
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setIndex(Math.round(r * (SPEED_STEPS.length - 1)));
  };

  barWrap.addEventListener(
    "pointerdown",
    (e) => {
      dragging = true;
      thumb.style.transform = "translate(-50%, -50%) scale(1.25)";
      try {
        barWrap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pickAt(e.clientX);
    },
    { signal },
  );
  barWrap.addEventListener(
    "pointermove",
    (e) => {
      if (!dragging) return;
      pickAt(e.clientX);
    },
    { signal },
  );
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    thumb.style.transform = "translate(-50%, -50%)";
    try {
      barWrap.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  barWrap.addEventListener("pointerup", endDrag, { signal });
  barWrap.addEventListener("pointercancel", endDrag, { signal });

  barWrap.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") setIndex(index - 1);
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") setIndex(index + 1);
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(SPEED_STEPS.length - 1);
      else return;
      e.preventDefault();
    },
    { signal },
  );

  const setOpen = (next: boolean) => {
    open = next;
    section.style.display = next ? "flex" : "none";
    paint();
  };

  return { button, section, setOpen };
}

// ── Volume ──────────────────────────────────────────────────────
// Continuous, unlike speed: there's no set of "useful" volumes to snap to.

function formatVolume(level: number): string {
  return formatPercent(Math.round(level * 100));
}

/**
 * Speaker button + the volume slider it swaps into the row.
 *
 * The track is a right-triangular wedge — thin at the quiet end, tall at the
 * loud end — so which way is louder reads at a glance, without the left/right
 * ambiguity a plain bar has. The thumb rides the hypotenuse rather than sitting
 * at a fixed height, which reinforces the same thing while dragging.
 */
function buildVolumeControl(
  video: HTMLVideoElement,
  signal: AbortSignal,
  onToggle: () => void,
): SliderControl {
  const button = createToggleCircle();

  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "22");
  icon.setAttribute("height", "22");
  icon.setAttribute("fill", "currentColor");
  icon.style.display = "block";

  const levelText = createToggleValueText();
  button.append(icon, levelText);

  const section = createSliderSection();

  const wedgeWrap = document.createElement("div");
  wedgeWrap.style.cssText = `
    position: relative;
    width: 100%;
    height: 40px;
    cursor: pointer;
    touch-action: none;
  `;
  wedgeWrap.setAttribute("role", "slider");
  wedgeWrap.setAttribute("tabindex", "0");
  wedgeWrap.setAttribute("aria-label", t("domShared_ytControlsVolume"));
  wedgeWrap.setAttribute("aria-valuemin", "0");
  wedgeWrap.setAttribute("aria-valuemax", "100");

  // `clip-path` on the wedge clips its descendants too, so the fill only has to
  // set a width — it picks up the triangular silhouette for free.
  const wedge = document.createElement("div");
  wedge.style.cssText = `
    position: absolute;
    left: 0; right: 0;
    top: 9px;
    height: 22px;
    background: rgba(255,255,255,0.14);
    clip-path: polygon(0% 100%, 100% 0%, 100% 100%);
    border-radius: 2px;
  `;

  const fill = document.createElement("div");
  fill.style.cssText = `
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 0%;
    background: ${RL_GRADIENT};
  `;
  wedge.appendChild(fill);

  const thumb = document.createElement("div");
  thumb.style.cssText = `
    position: absolute;
    left: 0%;
    top: 31px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow:
      0 2px 6px rgba(0,0,0,0.35),
      0 0 0 1px rgba(0,0,0,0.12);
    transform: translate(-50%, -50%);
    transition: transform 0.12s ease;
    pointer-events: none;
  `;

  wedgeWrap.append(wedge, thumb);
  section.appendChild(wedgeWrap);

  // `muted` wins over `volume` for what the user actually hears, so that's what
  // the UI reflects; the underlying volume is left alone so unmuting restores it.
  const effectiveLevel = () =>
    video.muted ? 0 : Math.min(1, Math.max(0, video.volume));

  let open = false;
  let hovered = false;

  const paint = () => {
    const level = effectiveLevel();
    const showValue = open;

    icon.style.display = showValue ? "none" : "block";
    levelText.style.display = showValue ? "block" : "none";
    levelText.textContent = formatVolume(level);

    while (icon.firstChild) icon.removeChild(icon.firstChild);
    for (const n of volumeIconNodes(level, video.muted)) icon.appendChild(n);

    paintToggleCircle(button, open || level === 0, hovered);
    button.setAttribute(
      "aria-label",
      t("domShared_ytControlsVolumeAccessibilityFormat", [formatVolume(level)]),
    );
    button.setAttribute("aria-expanded", open ? "true" : "false");

    const pct = level * 100;
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    // Wedge top edge runs from bottom-left to top-right, so the thumb's height
    // tracks the level: 31px (bottom) at 0, 9px (top) at 1.
    thumb.style.top = `${31 - 22 * level}px`;
    wedgeWrap.setAttribute("aria-valuenow", String(Math.round(pct)));
    wedgeWrap.setAttribute("aria-valuetext", formatVolume(level));
  };

  const setLevel = (next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    // Dragging the slider is an explicit volume intent, so it also lifts a mute
    // rather than silently doing nothing.
    if (video.muted && clamped > 0) video.muted = false;
    video.volume = clamped;
    paint();
  };

  paint();

  // Keep in sync when something else moves it — YouTube's own slider, the `m`
  // shortcut, or the player restoring a stored volume on navigation.
  video.addEventListener("volumechange", paint, { signal });

  button.addEventListener("click", onToggle, { signal });
  button.addEventListener("mouseenter", () => {
    hovered = true;
    paint();
  });
  button.addEventListener("mouseleave", () => {
    hovered = false;
    paint();
  });

  let dragging = false;

  const pickAt = (clientX: number) => {
    const rect = wedge.getBoundingClientRect();
    if (rect.width === 0) return;
    setLevel((clientX - rect.left) / rect.width);
  };

  wedgeWrap.addEventListener(
    "pointerdown",
    (e) => {
      dragging = true;
      thumb.style.transform = "translate(-50%, -50%) scale(1.25)";
      try {
        wedgeWrap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pickAt(e.clientX);
    },
    { signal },
  );
  wedgeWrap.addEventListener(
    "pointermove",
    (e) => {
      if (!dragging) return;
      pickAt(e.clientX);
    },
    { signal },
  );
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    thumb.style.transform = "translate(-50%, -50%)";
    try {
      wedgeWrap.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  wedgeWrap.addEventListener("pointerup", endDrag, { signal });
  wedgeWrap.addEventListener("pointercancel", endDrag, { signal });

  wedgeWrap.addEventListener(
    "keydown",
    (e) => {
      const level = effectiveLevel();
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") setLevel(level - 0.05);
      else if (e.key === "ArrowRight" || e.key === "ArrowUp")
        setLevel(level + 0.05);
      else if (e.key === "Home") setLevel(0);
      else if (e.key === "End") setLevel(1);
      else return;
      e.preventDefault();
    },
    { signal },
  );

  const setOpen = (next: boolean) => {
    open = next;
    section.style.display = next ? "flex" : "none";
    paint();
  };

  return { button, section, setOpen };
}

function buildSkipAd(
  video: HTMLVideoElement,
  signal: AbortSignal,
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    display: none;
    justify-content: center;
    margin-top: 2px;
  `;

  const btn = document.createElement("button");
  styleButtonCompact(btn); // dark text + currentColor icon against the light gradient pill
  btn.style.gap = "6px";

  const label = document.createElement("span");
  label.textContent = t("domShared_ytControlsSkipAd");

  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "15");
  icon.setAttribute("height", "15");
  icon.setAttribute("fill", "currentColor");
  icon.style.display = "block";
  for (const n of skipIconNodes()) icon.appendChild(n);

  btn.append(label, icon);
  btn.addEventListener(
    "click",
    () => {
      // Guard: never scrub the real video when no ad is on screen. The button is
      // only shown during ads, but a stale click could otherwise nuke playback.
      if (!isAdActive()) {
        rlog("skipAd.click: no ad active; ignoring");
        return;
      }

      const match = findSkipAdButton();
      const readiness = match ? describeSkipReadiness(match.el) : null;
      rlog(
        "skipAd.click: matched selector",
        match?.selector ?? null,
        "readiness",
        readiness,
        "el",
        match?.el ?? null,
      );

      if (match && readiness?.ready) {
        pressNativeSkip(match.el);
        window.setTimeout(() => {
          if (isAdActive()) {
            rlog(
              "skipAd.click: ad still active after native press; scrubbing past ad as fallback",
            );
            scrubPastAd(video, signal);
          } else {
            rlog("skipAd.click: ad cleared after native press");
          }
        }, 400);
        return;
      }

      rlog("skipAd.click: native skip not ready/absent; scrubbing past ad", {
        matched: !!match,
      });
      scrubPastAd(video, signal);
    },
    { signal },
  );
  wrapper.appendChild(btn);

  let lastReady: boolean | null = null;
  let lastSelector: string | null = null;
  const poll = () => {
    const adActive = isAdActive();
    const match = findSkipAdButton();
    const ready = !!match && isSkipButtonReady(match.el);
    if (ready !== lastReady || (match?.selector ?? null) !== lastSelector) {
      const reason =
        match == null
          ? { matched: false }
          : { matched: true, selector: match.selector, ...describeSkipReadiness(match.el) };
      rlog("skipAd.poll: state change ready=", ready, reason);
      lastReady = ready;
      lastSelector = match?.selector ?? null;
    }
    wrapper.style.display = adActive ? "flex" : "none";
  };
  poll();
  const timer = window.setInterval(poll, 750);
  signal.addEventListener("abort", () => window.clearInterval(timer));

  return wrapper;
}
