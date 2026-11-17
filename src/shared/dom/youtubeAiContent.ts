import { t } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import { AiContentTreatment } from "@/types/enums";
import { SettingsKey } from "../settings/settingsKey";
import { SETTINGS_DEFAULTS } from "../settings/settingsDefaults";
import {
  RL_ACCENT_BLUE,
  RL_ACCENT_LAVENDER,
  RL_FONT_BODY,
  RL_GRADIENT,
} from "../overlayUI/designTokens";
import { isWebExtPlatform } from "../platform/platform";
import { createRobotIconSvg } from "./utils/robotIconSvg";
import {
  registerDomSettingsWriter,
  writeDomSettings,
  type SettingsWriter,
} from "./utils/settingsWriter";
import {
  YT_ANNOTATED_EVENT,
  YT_ANNOTATED_FOR_ATTR,
  YT_CHANNEL_HANDLE_ATTR,
  YT_CHANNEL_HEADER_SELECTOR,
  YT_CHANNEL_ID_ATTR,
  YT_CHANNEL_NAME_ATTR,
  YT_VIDEO_TILE_SELECTOR,
  YT_WATCH_OWNER_SELECTOR,
  getChannelPageKey,
  getTileVideoId,
  getWatchVideoId,
} from "./youtubeChannelAnnotator";
import {
  type AiChannelEntry,
  type AiListedChannel,
  type AiLookup,
  type AiVerdict,
  type ChannelRef,
  channelBlockPatch,
  channelBackfillPatch,
  channelMarkPatch,
  getAiLookup,
  normalizeHandle,
  setSharedAiList,
} from "./youtubeAiLists";

/** On a treated tile: what was applied, so a change re-renders it. */
const APPLIED_ATTR = "data-relockr-ai";
const HIDDEN_ATTR = "data-relockr-ai-hidden";
const BADGE_CLASS = "relockr-ai-badge";
/** The label centred on a covered tile. */
const TILE_COVER_CLASS = "relockr-ai-cover";
/** On a covered tile: blurs it, and a click shows it. */
const COVERED_ATTR = "data-relockr-ai-covered";
const PLAYER_NOTICE_CLASS = "relockr-ai-player-notice";
/** How long the player notice shows, fade in and out included. */
const PLAYER_NOTICE_MS = 2200;
const CHANNEL_ROW_CLASS = "relockr-ai-channel-row";
/** On a popover's wrapper: an outside click closes it. */
const POPOVER_ATTR = "data-relockr-popover";
const TILE_WRAPPER_SELECTOR = "ytd-rich-item-renderer, ytm-rich-item-renderer";
const THUMBNAIL_SELECTOR =
  "yt-thumbnail-view-model, ytd-thumbnail, a#thumbnail, ytm-thumbnail-cover";
// Colours inside the channel row, set on it by rowThemeVars().
const YT_TEXT = "var(--rl-yt-text)";
const YT_TEXT_SECONDARY = "var(--rl-yt-text-secondary)";
const YT_CHIP_BG = "var(--rl-yt-chip-bg)";
const YT_LAYER = "var(--rl-yt-layer)";
const YT_MENU_BG = "var(--rl-yt-menu-bg)";
const YT_BASE_BG = "var(--rl-yt-base-bg)";
const YT_FONT = "Roboto, Arial, sans-serif";

/** Where votes are shared from. Without one, votes stay local and nothing asks to sign in. */
export interface YouTubeAiAccount {
  isSignedIn(): Promise<boolean>;
  /**
   * Opens the platform's sign-in screen. Resolves true once it's opening, or
   * false if it couldn't be opened, so the button can be tried again.
   */
  openSignIn(): Promise<boolean>;
}

let currentSettings: RelockrSettings = {};
let account: YouTubeAiAccount | null = null;
/** The channel whose row says a vote stays local until sign-in. */
let signInNoticeFor: string | null = null;
/** Sign in was tapped and the sign-in screen hasn't opened yet. */
let signInOpening = false;
let eventsInstalled = false;
/** Videos the user chose to see anyway. In memory: a reload re-covers them. */
const shownVideoIds = new Set<string>();

/** The watch page's video and channel; refreshed every pass. */
let watchContext: {
  videoId: string;
  channel: ChannelRef;
  channelName: string;
} | null = null;

/**
 * Persists the AI lists. Same as `registerDomSettingsWriter`, which other DOM
 * code also writes through; kept under this name for platforms that call it.
 */
export function registerYouTubeAiSettingsWriter(writer: SettingsWriter): void {
  registerDomSettingsWriter(writer);
}

export function registerYouTubeAiAccount(value: YouTubeAiAccount): void {
  account = value;
}

/** The published list, once downloaded; null keeps the bundled one. */
export function setYouTubeAiSharedList(list: readonly AiListedChannel[] | null): void {
  setSharedAiList(list);
  if (eventsInstalled) runPass();
}

export function applyYouTubeAiContent(settings: RelockrSettings): void {
  currentSettings = settings;
  if (!eventsInstalled) {
    eventsInstalled = true;
    // The page-world annotator fires this as soon as tiles have channels, so
    // new tiles are treated without waiting for the next periodic pass.
    document.addEventListener(YT_ANNOTATED_EVENT, () => runPass());
    document.addEventListener("click", closePopovers);
  }
  runPass();
}

/** m.youtube.com, also what the phone apps load. Its rows have no spare room. */
function isMobileSite(): boolean {
  return location.hostname.startsWith("m.");
}

function getMode(): AiContentTreatment {
  const key = SettingsKey.YouTube.AiContent;
  const value = currentSettings[key] ?? SETTINGS_DEFAULTS[key];
  return Object.values(AiContentTreatment).includes(value as AiContentTreatment)
    ? (value as AiContentTreatment)
    : AiContentTreatment.Off;
}

function runPass(): void {
  const mode = getMode();
  const lookup = getAiLookup(currentSettings);
  applyToTiles(mode, lookup);
  applyToWatchPage(mode, lookup);
  applyToChannelPage(mode, lookup);
}

/**
 * Called wherever a page names a channel by both id and handle. `name` only
 * when read from YouTube's data, which can't be stale.
 */
function backfillChannel(channel: ChannelRef, name: string | null): void {
  const patch = channelBackfillPatch(currentSettings, channel, name);
  if (patch) saveMarks(patch);
}

async function saveMarks(patch: RelockrSettings): Promise<void> {
  // Re-render right away instead of waiting for the storage round trip.
  currentSettings = { ...currentSettings, ...patch };
  runPass();
  try {
    await writeDomSettings(patch);
  } catch (e) {
    console.error("[relockr] Failed to save AI marks", e);
  }
}

// MARK: - Channels

/**
 * The tile's channel. Prefers the page-world annotation, but only when it was
 * read for the video the tile shows now (YouTube recycles tiles) and found one.
 */
function readChannel(el: Element, videoId: string): ChannelRef {
  if (el.getAttribute(YT_ANNOTATED_FOR_ATTR) === videoId) {
    const annotated = {
      id: el.getAttribute(YT_CHANNEL_ID_ATTR) || undefined,
      handle: normalizeHandle(el.getAttribute(YT_CHANNEL_HANDLE_ATTR)),
    };
    if (annotated.id || annotated.handle) return annotated;
  }
  // Search results link their channel in the DOM, so they work even without
  // the annotator or when a tile's data names no channel.
  const href =
    el
      .querySelector('a[href^="/@"], a[href^="/channel/UC"]')
      ?.getAttribute("href") ?? "";
  return {
    id: href.match(/^\/channel\/(UC[\w-]+)/)?.[1],
    handle: normalizeHandle(href.match(/^\/@[^/?]+/)?.[0]),
  };
}

function channelEntry(channel: ChannelRef, name: string): AiChannelEntry {
  return {
    id: channel.id,
    handle: channel.handle,
    name: name || channel.handle || channel.id || "",
  };
}

/** Too few votes to act on: a label only, whatever the setting. */
function labelOnly(verdict: AiVerdict): boolean {
  return verdict === "possibly";
}

// MARK: - Feed tiles

function applyToTiles(mode: AiContentTreatment, lookup: AiLookup): void {
  const pageChannel = getChannelPageChannel();
  const badges: PendingBadge[] = [];
  for (const tile of document.querySelectorAll<HTMLElement>(YT_VIDEO_TILE_SELECTOR)) {
    const target = tile.closest<HTMLElement>(TILE_WRAPPER_SELECTOR) ?? tile;
    const videoId = getTileVideoId(tile);
    let channel = videoId ? readChannel(tile, videoId) : {};
    // A channel page's own videos name no channel. The viewer went there on
    // purpose, so they get a label at most: cover and hide are for feeds.
    const onOwnPage = !!videoId && !!pageChannel && !channel.id && !channel.handle;
    if (onOwnPage) channel = pageChannel;
    const tileMode =
      onOwnPage && mode !== AiContentTreatment.Off ? AiContentTreatment.Badge : mode;
    // Blocking is the user's own call, AI or not: hidden whatever the AI setting.
    const blocked = !!videoId && !onOwnPage && lookup.isChannelHidden(channel);
    const verdict =
      blocked || tileMode === AiContentTreatment.Off || !videoId || shownVideoIds.has(videoId)
        ? null
        : lookup.verdict(channel);
    const reviewed = !!lookup.listed(channel)?.reviewed;
    const state = blocked
      ? `${videoId}|blocked`
      : verdict
        ? `${videoId}|${verdict}|${reviewed}|${tileMode}`
        : "";
    if ((target.getAttribute(APPLIED_ATTR) ?? "") === state) continue;

    clearTileTreatment(target);
    if (blocked) {
      target.setAttribute(APPLIED_ATTR, state);
      hideTile(target);
      continue;
    }
    if (!verdict || !videoId) continue;
    target.setAttribute(APPLIED_ATTR, state);
    if (tileMode === AiContentTreatment.Badge || labelOnly(verdict)) {
      badges.push({ tile, verdict, reviewed });
    } else if (tileMode === AiContentTreatment.Hide) {
      hideTile(target);
    } else {
      addTileCover(target, verdict, reviewed, () => {
        shownVideoIds.add(videoId);
        runPass();
      });
    }
  }
  // All the measuring, then all the writing.
  const places = badges.map((b) => measureBadge(b.tile));
  badges.forEach((b, i) => addBadge(places[i], b.verdict, b.reviewed));
}

function clearTileTreatment(target: HTMLElement): void {
  target.removeAttribute(APPLIED_ATTR);
  target.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());
  removeTileCover(target);
  if (target.hasAttribute(HIDDEN_ATTR)) {
    target.style.removeProperty("display");
    target.removeAttribute(HIDDEN_ATTR);
  }
}

function hideTile(target: HTMLElement): void {
  target.style.setProperty("display", "none", "important");
  target.setAttribute(HIDDEN_ATTR, "true");
}

function makeRelative(el: HTMLElement): void {
  if (getComputedStyle(el).position === "static") {
    el.style.position = "relative";
  }
}

interface PendingBadge {
  tile: HTMLElement;
  verdict: AiVerdict;
  reviewed: boolean;
}

interface BadgePlace {
  host: HTMLElement;
  needsRelative: boolean;
  top: number;
  left: number;
}

/**
 * Where a tile's badge goes. Only reads, so a whole pass's badges cost one
 * layout: measuring between writes made the browser lay out the page again
 * for every tile, which a phone feels when a batch of results arrives.
 */
function measureBadge(tile: HTMLElement): BadgePlace {
  const thumb = tile.querySelector<HTMLElement>(THUMBNAIL_SELECTOR) ?? tile;
  // m.youtube.com plays previews in a layer it moves into the tile (search's
  // ytm- tiles and the home feed's lockups alike), over the thumbnail but
  // outside it, which would cover a badge inside the thumbnail. There the
  // badge goes on the tile, above that layer, at the thumbnail's corner.
  const host = isMobileSite() ? tile : thumb;
  const hostRect = host.getBoundingClientRect();
  const thumbRect = thumb.getBoundingClientRect();
  return {
    host,
    needsRelative: getComputedStyle(host).position === "static",
    top: Math.max(0, thumbRect.top - hostRect.top),
    left: Math.max(0, thumbRect.left - hostRect.left),
  };
}

/** Thumbnail label; louder as confidence rises. */
function addBadge(place: BadgePlace, verdict: AiVerdict, reviewed: boolean): void {
  const { host } = place;
  if (place.needsRelative) host.style.position = "relative";
  // Keeps the badge's z-index inside the host, so it stays under the
  // masthead and mobile's bottom bar when the tile scrolls beneath them.
  host.style.isolation = "isolate";
  // "Likely AI" is the only label longer than a word, so it stays a size
  // down to leave the thumbnail visible on small sidebar tiles.
  const short = verdict !== "likely";
  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;
  Object.assign(badge.style, {
    position: "absolute",
    top: `${8 + place.top}px`,
    left: `${8 + place.left}px`,
    zIndex: "10",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: short ? "6px 12px 6px 10px" : "5px 11px 5px 9px",
    borderRadius: short ? "10px" : "9px",
    // A dark fill inside a gradient border: borders can't take a gradient
    // with rounded corners, so the gradient is the background behind it.
    border: "1px solid transparent",
    background: `linear-gradient(rgba(12, 12, 14, 0.88), rgba(12, 12, 14, 0.88)) padding-box, ${RL_GRADIENT} border-box`,
    fontFamily: RL_FONT_BODY,
    fontSize: short ? "19px" : "17px",
    fontWeight: "700",
    lineHeight: "1.2",
  });

  const text = document.createElement("span");
  text.textContent = t("domShared_ytAiBadge");
  // Gradient text, falling back to lavender where clipping isn't supported.
  Object.assign(text.style, { color: RL_ACCENT_LAVENDER, background: RL_GRADIENT });
  text.style.setProperty("-webkit-background-clip", "text");
  text.style.setProperty("background-clip", "text");
  text.style.setProperty("-webkit-text-fill-color", "transparent");
  let gradientIcon = true;
  if (verdict === "veryLikely") {
    // "Very likely AI" is too long for a thumbnail: the full name is on hover.
    Object.assign(badge.style, { background: RL_GRADIENT, border: "none" });
    text.style.background = "none";
    text.style.setProperty("-webkit-text-fill-color", "#0f0f0f");
    badge.style.color = "#0f0f0f";
    gradientIcon = false;
    badge.title = reviewed
      ? `${t("domShared_ytAiTierVeryLikely")} · ${t("domShared_ytAiReviewed")}`
      : t("domShared_ytAiTierVeryLikely");
  } else if (verdict === "likely") {
    text.textContent = t("domShared_ytAiTierLikely");
  } else if (verdict === "possibly") {
    // Too few votes to say: grey, not the brand colours.
    text.textContent = t("domShared_ytAiBadgePossibly");
    Object.assign(badge.style, {
      background: "rgba(12, 12, 14, 0.85)",
      border: "1px solid rgba(255,255,255,0.35)",
      color: "rgba(255,255,255,0.85)",
    });
    text.style.background = "none";
    text.style.setProperty("-webkit-text-fill-color", "rgba(255,255,255,0.85)");
    gradientIcon = false;
    badge.title = t("domShared_ytAiTierPossibly");
  }
  if (!badge.title) badge.style.pointerEvents = "none";

  const iconSize = short ? "22px" : "20px";
  const icon = document.createElement("span");
  Object.assign(icon.style, { width: iconSize, height: iconSize, lineHeight: "0" });
  icon.appendChild(createRobotIconSvg(true, gradientIcon));
  badge.append(icon, text);
  host.appendChild(badge);
}

interface CoverText {
  title: string;
  reason?: string;
  /** Show the reviewed check badge before the reason. */
  reviewed?: boolean;
}

/** Cover title and reason for a verdict. */
function coverText(verdict: AiVerdict, reviewed: boolean): CoverText {
  switch (verdict) {
    case "channel":
      return { title: t("domShared_ytAiCoverTitle"), reason: t("domShared_ytAiReasonChannel") };
    case "veryLikely":
      return {
        title: t("domShared_ytAiCoverTitleVeryLikely"),
        reason: reviewed ? t("domShared_ytAiReviewed") : t("domShared_ytAiReasonVotes"),
        reviewed,
      };
    default:
      return { title: t("domShared_ytAiCoverTitleLikely"), reason: t("domShared_ytAiReasonVotes") };
  }
}

const COVER_STYLE_ID = "relockr-ai-cover-style";

// Cover mode blurs the tile in place instead of laying a panel over it, so
// there's no second box to keep lined up with the tile as YouTube re-lays it
// out. The tile's own parts stop taking the pointer, so a click or tap
// anywhere on it lands on the tile, which shows the video.
const COVER_CSS = `
[${COVERED_ATTR}] { cursor: pointer; }
[${COVERED_ATTR}] > :not(.${TILE_COVER_CLASS}) {
  filter: blur(14px) saturate(0.6);
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}
.${TILE_COVER_CLASS}, .${PLAYER_NOTICE_CLASS} {
  position: absolute;
  left: 50%;
  z-index: 1;
  box-sizing: border-box;
  /* Positioned from the middle, the label would otherwise only get the right
     half of the tile and wrap early on narrow ones. */
  width: max-content;
  max-width: calc(100% - 16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 14px;
  border-radius: 12px;
  background: rgba(20, 20, 24, 0.85);
  border: 1px solid rgba(173, 148, 242, 0.35);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  font-family: ${RL_FONT_BODY};
  text-align: center;
  pointer-events: none;
}
.${TILE_COVER_CLASS} { top: 50%; transform: translate(-50%, -50%); }
.${TILE_COVER_CLASS} .rl-ai-title, .${PLAYER_NOTICE_CLASS} .rl-ai-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.94);
}
.${TILE_COVER_CLASS} .rl-ai-icon, .${PLAYER_NOTICE_CLASS} .rl-ai-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  line-height: 0;
  color: ${RL_ACCENT_LAVENDER};
}
.${TILE_COVER_CLASS} .rl-ai-show {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  color: ${RL_ACCENT_BLUE};
}
.${PLAYER_NOTICE_CLASS} {
  top: 16px;
  z-index: 1000;
  transform: translateX(-50%);
  animation: relockr-ai-notice ${PLAYER_NOTICE_MS}ms ease forwards;
}
.${PLAYER_NOTICE_CLASS} .rl-ai-reason {
  font-size: 12px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.6);
}
@keyframes relockr-ai-notice {
  0% { opacity: 0; }
  10%, 80% { opacity: 1; }
  100% { opacity: 0; }
}
`;

function injectCoverStyleOnce(): void {
  if (document.getElementById(COVER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = COVER_STYLE_ID;
  style.textContent = COVER_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

/** What a click on each covered tile does. */
const coverShowHandlers = new WeakMap<Element, () => void>();
let coverClicksInstalled = false;

/**
 * One listener on the window, in the capture phase, so it runs before
 * YouTube's own: lockups navigate from a listener on the tile itself, which a
 * listener added on the tile later can't stop. Keyboard activation of the
 * tile's link arrives as a click too.
 */
function installCoverClicksOnce(): void {
  if (coverClicksInstalled) return;
  coverClicksInstalled = true;
  const onClick = (e: Event) => {
    const tile =
      e.target instanceof Element ? e.target.closest(`[${COVERED_ATTR}]`) : null;
    const show = tile && coverShowHandlers.get(tile);
    if (!show) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    show();
  };
  window.addEventListener("click", onClick, true);
  window.addEventListener("auxclick", onClick, true);
}

function addTileCover(
  target: HTMLElement,
  verdict: AiVerdict,
  reviewed: boolean,
  onShow: () => void,
): void {
  injectCoverStyleOnce();
  makeRelative(target);
  // Keeps the label under YouTube's masthead and bottom bar when the tile
  // scrolls beneath them.
  target.style.isolation = "isolate";
  target.setAttribute(COVERED_ATTR, "");

  const label = document.createElement("div");
  label.className = TILE_COVER_CLASS;
  const title = document.createElement("div");
  title.className = "rl-ai-title";
  const icon = document.createElement("span");
  icon.className = "rl-ai-icon";
  icon.appendChild(createRobotIconSvg(true, true));
  title.append(icon, coverText(verdict, reviewed).title);
  const show = document.createElement("div");
  show.className = "rl-ai-show";
  show.textContent = t("domShared_ytAiShowAnyway");
  label.append(title, show);
  target.appendChild(label);

  coverShowHandlers.set(target, onShow);
  installCoverClicksOnce();
}

function removeTileCover(target: HTMLElement): void {
  coverShowHandlers.delete(target);
  target.removeAttribute(COVERED_ATTR);
  for (const child of Array.from(target.children)) {
    if (child.classList.contains(TILE_COVER_CLASS)) child.remove();
  }
  target.style.removeProperty("isolation");
}

// MARK: - Watch page

function applyToWatchPage(mode: AiContentTreatment, lookup: AiLookup): void {
  const videoId = getWatchVideoId();
  const owner = document.querySelector<HTMLElement>(YT_WATCH_OWNER_SELECTOR);
  // Once the page-world annotator has run, wait for it to read this video:
  // the owner row's link can still point at the previous video's channel.
  // Without it (not injected, e.g. older Firefox), fall back to that link.
  const annotatedFor = owner?.getAttribute(YT_ANNOTATED_FOR_ATTR);
  const channel =
    videoId && owner && (annotatedFor === videoId || annotatedFor === null)
      ? readChannel(owner, videoId)
      : null;

  if (!channel || !(channel.id || channel.handle) || !videoId || !owner) {
    watchContext = null;
    removeChannelRows("watch");
    // Drop a notice still fading from the previous video.
    if (!playerNoticeFor?.startsWith(`${videoId}|`)) removePlayerNotice();
    return;
  }

  // The visible name lags the annotation like the link does.
  const annotatedName =
    annotatedFor === videoId ? owner.getAttribute(YT_CHANNEL_NAME_ATTR) || null : null;
  watchContext = {
    videoId,
    channel,
    channelName:
      annotatedName ??
      owner
        .querySelector("ytd-channel-name #text, .slim-owner-channel-name")
        ?.textContent?.trim() ??
      "",
  };
  backfillChannel(channel, annotatedName);

  // A row of its own: under the title and channel row on desktop, under the
  // channel and actions bar on mobile.
  const anchor = owner.closest<HTMLElement>("ytd-watch-metadata #top-row") ?? owner;
  const context = watchContext;
  renderChannelRow(
    "watch",
    anchor,
    mode,
    lookup,
    context.channel,
    context.channelName,
    context.videoId,
  );

  // The viewer picked this video to get here, so it plays: just a brief note.
  if (shownVideoIds.has(videoId)) return;
  if (lookup.isChannelHidden(channel)) {
    showPlayerNotice(
      `${videoId}|blocked`,
      { title: t("domShared_ytBlockedCoverTitle") },
      createBanSvg(),
    );
    return;
  }
  const verdict =
    mode === AiContentTreatment.Off ? null : lookup.verdict(channel);
  if (
    verdict &&
    !labelOnly(verdict) &&
    (mode === AiContentTreatment.Cover || mode === AiContentTreatment.Hide)
  ) {
    const reviewed = !!lookup.listed(channel)?.reviewed;
    showPlayerNotice(
      `${videoId}|${verdict}|${reviewed}`,
      coverText(verdict, reviewed),
      createRobotIconSvg(true, true),
    );
  }
}

/** The video and verdict the player notice was last shown for. */
let playerNoticeFor: string | null = null;

function removePlayerNotice(): void {
  document.querySelectorAll(`.${PLAYER_NOTICE_CLASS}`).forEach((el) => el.remove());
}

/**
 * A label over the top of the player that fades out by itself. It never takes
 * the pointer, so the player works the whole time. Once per video and verdict.
 */
function showPlayerNotice(key: string, text: CoverText, icon: SVGSVGElement): void {
  if (playerNoticeFor === key) return;
  const player = document.querySelector<HTMLElement>("#movie_player");
  if (!player) return; // Not ready: the next pass tries again.
  playerNoticeFor = key;
  removePlayerNotice();
  injectCoverStyleOnce();

  const notice = document.createElement("div");
  notice.className = PLAYER_NOTICE_CLASS;
  notice.setAttribute("role", "status");
  const title = document.createElement("div");
  title.className = "rl-ai-title";
  const iconWrap = document.createElement("span");
  iconWrap.className = "rl-ai-icon";
  iconWrap.appendChild(icon);
  title.append(iconWrap, text.title);
  notice.appendChild(title);
  if (text.reason) {
    const reason = document.createElement("div");
    reason.className = "rl-ai-reason";
    reason.textContent = text.reason;
    notice.appendChild(reason);
  }
  player.appendChild(notice);
  // The animation fades it out; the timer is in case animations don't run.
  notice.addEventListener("animationend", () => notice.remove());
  window.setTimeout(() => notice.remove(), PLAYER_NOTICE_MS + 500);
}

// MARK: - Channel page

/** The channel whose page is shown, or null when not on one (or still loading). */
function getChannelPageChannel(): ChannelRef | null {
  const key = getChannelPageKey();
  const header = key
    ? document.querySelector<HTMLElement>(YT_CHANNEL_HEADER_SELECTOR)
    : null;
  const channel = key && header ? readChannelPageChannel(header, key) : null;
  return channel && (channel.id || channel.handle) ? channel : null;
}

function applyToChannelPage(mode: AiContentTreatment, lookup: AiLookup): void {
  const key = getChannelPageKey();
  const header = key
    ? document.querySelector<HTMLElement>(YT_CHANNEL_HEADER_SELECTOR)
    : null;
  const channel = key && header ? readChannelPageChannel(header, key) : null;
  // A row of its own under Subscribe; without an actions row, under the title.
  const anchor =
    header?.querySelector<HTMLElement>("yt-flexible-actions-view-model") ??
    header?.querySelector<HTMLElement>(".ytPageHeaderViewModelTitle, h1");
  if (!key || !channel || !header || !anchor) {
    removeChannelRows("channel");
    return;
  }

  const annotatedName =
    header.getAttribute(YT_ANNOTATED_FOR_ATTR) === key
      ? header.getAttribute(YT_CHANNEL_NAME_ATTR) || null
      : null;
  backfillChannel(channel, annotatedName);
  const name = annotatedName ?? header.querySelector("h1")?.textContent?.trim() ?? "";
  renderChannelRow("channel", anchor, mode, lookup, channel, name, null);
}

/**
 * The channel page's channel: the page-world annotation once it was read for
 * this page (it adds the `UC…` id to a handle URL), otherwise the URL itself.
 * A header annotated for another channel was reused by an in-page navigation
 * and still shows that channel's name, so wait for the annotator.
 */
function readChannelPageChannel(header: Element, key: string): ChannelRef | null {
  const annotatedFor = header.getAttribute(YT_ANNOTATED_FOR_ATTR);
  if (annotatedFor !== null && annotatedFor !== key) return null;
  if (annotatedFor === key) {
    return {
      id: header.getAttribute(YT_CHANNEL_ID_ATTR) || undefined,
      handle: normalizeHandle(header.getAttribute(YT_CHANNEL_HANDLE_ATTR)),
    };
  }
  if (key.startsWith("@")) return { handle: normalizeHandle(key) };
  const id = key.match(/^channel\/(UC[\w-]+)$/)?.[1];
  // Legacy /c/ and /user/ URLs name neither: wait for the annotation.
  return id ? { id } : null;
}

// MARK: - Channel row

type RowPlace = "watch" | "channel";

function removeChannelRows(place: RowPlace): void {
  document
    .querySelectorAll(`.${CHANNEL_ROW_CLASS}[data-place="${place}"]`)
    .forEach((el) => el.remove());
}

/**
 * The row's colours: desktop YouTube's own variables, else light or dark
 * fallbacks matching the page. m.youtube.com defines none of those variables,
 * so fixed light-theme fallbacks left the buttons black on its dark theme.
 */
function rowThemeVars(anchor: HTMLElement): { dark: boolean; vars: Record<string, string> } {
  const [r, g, b] = (getComputedStyle(anchor).color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  // Light text means a dark page.
  const dark = (0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0)) / 255 > 0.5;
  const pick = (ytVar: string, light: string, darkValue: string) =>
    `var(${ytVar}, ${dark ? darkValue : light})`;
  return {
    dark,
    vars: {
      "--rl-yt-text": pick("--yt-spec-text-primary", "#0f0f0f", "#f1f1f1"),
      "--rl-yt-text-secondary": pick("--yt-spec-text-secondary", "#606060", "#aaaaaa"),
      "--rl-yt-chip-bg": pick(
        "--yt-spec-badge-chip-background",
        "rgba(0,0,0,0.05)",
        "rgba(255,255,255,0.1)",
      ),
      "--rl-yt-layer": pick("--yt-spec-10-percent-layer", "rgba(0,0,0,0.15)", "rgba(255,255,255,0.2)"),
      "--rl-yt-menu-bg": pick("--yt-spec-menu-background", "#ffffff", "#282828"),
      "--rl-yt-base-bg": pick("--yt-spec-base-background", "#ffffff", "#0f0f0f"),
    },
  };
}

/**
 * The row after `anchor`. With AI filtering on: the channel's status chip, the
 * AI / Not AI vote with counts (the viewer's own vote added) and a "What counts
 * as AI?" popover. Always: Block channel, which is the viewer's own call and
 * unrelated to AI.
 */
function renderChannelRow(
  place: RowPlace,
  anchor: HTMLElement,
  mode: AiContentTreatment,
  lookup: AiLookup,
  channel: ChannelRef,
  channelName: string,
  videoId: string | null,
): void {
  const voting = mode !== AiContentTreatment.Off;
  const listed = lookup.listed(channel);
  const mine = lookup.isChannelBlocked(channel)
    ? "ai"
    : lookup.isChannelAllowed(channel)
      ? "notAi"
      : null;
  const rowKey = channel.id ?? channel.handle ?? "";
  const blocked = lookup.isChannelHidden(channel);
  const aiVotes = (listed?.aiVotes ?? 0) + (mine === "ai" ? 1 : 0);
  const notAiVotes = (listed?.notAiVotes ?? 0) + (mine === "notAi" ? 1 : 0);
  const theme = rowThemeVars(anchor);
  const state = [
    videoId ?? channel.id ?? channel.handle,
    theme.dark,
    // A new width (a phone turned) re-measures whether the full row fits.
    anchor.clientWidth,
    channelName,
    voting,
    listed?.tier,
    listed?.reviewed,
    mine,
    blocked,
    aiVotes,
    notAiVotes,
    signInNoticeFor === rowKey && (signInOpening ? "opening" : "notice"),
  ].join("|");

  const existing = anchor.parentElement?.querySelector(
    `:scope > .${CHANNEL_ROW_CLASS}[data-place="${place}"]`,
  );
  if (existing?.getAttribute("data-state") === state && existing.previousElementSibling === anchor) {
    return;
  }
  // Also drops one left behind in a row YouTube has since replaced.
  removeChannelRows(place);

  const entry = () => channelEntry(channel, channelName);
  const onVote = (vote: "ai" | "notAi") => {
    const next = mine === vote ? "none" : vote;
    saveMarks(channelMarkPatch(currentSettings, entry(), next));
    if (next !== "none") void noticeIfSignedOut(rowKey);
  };
  const onBlock = () => saveMarks(channelBlockPatch(currentSettings, entry(), !blocked));

  const row = document.createElement("div");
  row.className = CHANNEL_ROW_CLASS;
  row.setAttribute("data-place", place);
  row.setAttribute("data-state", state);
  Object.assign(row.style, {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px",
    margin: isMobileSite() && place === "watch" ? "0 12px 12px" : "12px 0 0",
    fontFamily: YT_FONT,
    fontSize: "14px",
  });
  for (const [name, value] of Object.entries(theme.vars)) row.style.setProperty(name, value);
  row.style.color = YT_TEXT;

  const fill = (fit: RowFit) => {
    row.replaceChildren();
    if (voting) {
      if (listed) row.appendChild(createStatusChip(listed, fit));
      row.appendChild(
        createVoteControl(mine, aiVotes, notAiVotes, onVote, fit >= RowFit.TightVote),
      );
      const disputeUrl = aiDisputeUrl(channel, channelName, listed);
      if (fit >= RowFit.Menu) {
        row.appendChild(createRowMenu(blocked, onBlock, disputeUrl));
      } else {
        row.append(createHelpPopover(disputeUrl), createBlockButton(blocked, onBlock));
      }
    } else {
      row.appendChild(createBlockButton(blocked, onBlock));
    }
    if (voting && signInNoticeFor === rowKey) row.appendChild(createSignInNotice());
  };
  fill(RowFit.Full);
  anchor.after(row);
  // Each step only where the one before still wraps, so wide screens and
  // short languages keep the full row.
  for (let fit = RowFit.Menu; voting && fit <= RowFit.IconChip && rowWraps(row); fit++) {
    fill(fit);
  }
}

/**
 * How far the row is condensed to stay on one line. Measured with every
 * language on m.youtube.com: by TightVote all of them fit 360px phones with
 * 4-digit counts; IconChip is only needed at 320px.
 */
enum RowFit {
  Full,
  /** "What counts as AI?" and Block channel go in a "⋯" menu. */
  Menu,
  /** Very likely and Possibly use the thumbnail labels' wording ("AI", "AI?"). */
  ShortChip,
  /** No robot in the AI button, less padding. */
  TightVote,
  /** The chip is a styled robot; tapping it names the tier. */
  IconChip,
}

/** Whether the row's controls run onto a second line (the sign-in notice always does). */
function rowWraps(row: HTMLElement): boolean {
  const controls = Array.from(row.children).filter(
    (el) => el.getAttribute("role") !== "status",
  ) as HTMLElement[];
  const first = controls[0];
  const last = controls[controls.length - 1];
  return !!first && !!last && last.offsetTop > first.offsetTop + first.offsetHeight / 2;
}

/** After a vote: if it can't be shared, say so in that channel's row. */
async function noticeIfSignedOut(rowKey: string): Promise<void> {
  if (!account || (await account.isSignedIn())) return;
  signInNoticeFor = rowKey;
  runPass();
}

/**
 * "Your vote only applies for you", with Sign in and ×. The text and buttons
 * share a line when there's room; on a phone, or with a long translation, the
 * buttons wrap under the text, right-aligned.
 */
function createSignInNotice(): HTMLElement {
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  Object.assign(notice.style, {
    flexBasis: "100%",
    minWidth: "0",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px 12px",
    padding: "8px 8px 8px 14px",
    borderRadius: "12px",
    boxSizing: "border-box",
    background: YT_CHIP_BG,
    color: YT_TEXT,
    fontSize: "14px",
    lineHeight: "20px",
  });
  const text = document.createElement("span");
  text.textContent = t("domShared_ytAiSignInNotice");
  // Wide enough that phones always stack, so the spinner never reflows the row.
  Object.assign(text.style, { flex: "1 1 280px", minWidth: "0", overflowWrap: "anywhere" });

  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginLeft: "auto",
    maxWidth: "100%",
  });
  const signIn = document.createElement("button");
  signIn.type = "button";
  Object.assign(signIn.style, pillButtonStyle(), {
    position: "relative",
    height: "auto",
    minHeight: "36px",
    minWidth: "0",
    whiteSpace: "normal",
    textAlign: "center",
    background: RL_GRADIENT,
    color: "#0f0f0f",
  });
  const label = document.createElement("span");
  label.textContent = t("domShared_ytAiSignInButton");
  signIn.append(label);
  if (signInOpening) {
    // Native apps take a moment to bring up their account screen. The spinner
    // covers the hidden label so the button keeps its size.
    signIn.disabled = true;
    signIn.setAttribute("aria-busy", "true");
    signIn.style.cursor = "default";
    label.style.visibility = "hidden";
    signIn.append(createSpinner());
  }
  signIn.addEventListener("click", () => {
    if (signInOpening || !account) return;
    signInOpening = true;
    runPass();
    void account
      .openSignIn()
      .catch(() => false)
      .then((opened) => {
        signInOpening = false;
        if (opened) signInNoticeFor = null;
        runPass();
      });
  });
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", t("domShared_ytAiSignInDismiss"));
  close.title = t("domShared_ytAiSignInDismiss");
  Object.assign(close.style, pillButtonStyle(), {
    width: "36px",
    flexShrink: "0",
    padding: "0",
    fontSize: "20px",
  });
  close.addEventListener("click", () => {
    signInNoticeFor = null;
    runPass();
  });
  actions.append(signIn, close);
  notice.append(text, actions);
  return notice;
}

function createSpinner(): HTMLElement {
  const spinner = document.createElement("span");
  Object.assign(spinner.style, {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "16px",
    height: "16px",
    margin: "-8px 0 0 -8px",
    borderRadius: "50%",
    border: "2px solid currentColor",
    borderRightColor: "transparent",
    boxSizing: "border-box",
  });
  // Inline styles can't declare keyframes.
  spinner.animate?.([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
    duration: 800,
    iterations: Infinity,
  });
  return spinner;
}

const TIER_LABEL_KEYS = {
  possibly: "domShared_ytAiTierPossibly",
  likely: "domShared_ytAiTierLikely",
  veryLikely: "domShared_ytAiTierVeryLikely",
  disputed: "domShared_ytAiTierDisputed",
} as const;

/** Shorter labels for a narrow row: the same wording as the thumbnail labels. */
const TIER_SHORT_LABEL_KEYS = {
  ...TIER_LABEL_KEYS,
  possibly: "domShared_ytAiBadgePossibly",
  veryLikely: "domShared_ytAiBadge",
} as const;

/** The channel's tier as a read-only chip: no numbers, those are in the vote. */
function createStatusChip(listed: AiListedChannel, fit = RowFit.Full): HTMLElement {
  const iconOnly = fit >= RowFit.IconChip;
  const chip = document.createElement(iconOnly ? "button" : "span");
  Object.assign(chip.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    height: "28px",
    padding: iconOnly ? "0 8px" : "0 12px",
    margin: "0",
    border: "none",
    borderRadius: "14px",
    boxSizing: "border-box",
    fontSize: "13px",
    fontWeight: "500",
    whiteSpace: "nowrap",
    color: YT_TEXT,
    background: YT_CHIP_BG,
  });
  if (listed.tier === "veryLikely") {
    Object.assign(chip.style, { background: RL_GRADIENT, color: "#0f0f0f" });
  } else if (listed.tier === "likely") {
    Object.assign(chip.style, {
      background: "rgba(173, 148, 242, 0.15)",
      border: `1px solid ${RL_ACCENT_LAVENDER}`,
    });
  }
  const fullLabel = t(TIER_LABEL_KEYS[listed.tier]);
  if (iconOnly) {
    // Tapping names the tier, since there's no hover on a phone.
    const reviewed = listed.reviewed ? ` · ${t("domShared_ytAiReviewed")}` : "";
    chip.setAttribute("aria-label", fullLabel + reviewed);
    chip.title = fullLabel + reviewed;
    Object.assign(chip.style, { cursor: "pointer", fontFamily: YT_FONT });
    chip.appendChild(iconSpan(createRobotIconSvg(listed.tier !== "possibly"), 16));
  } else {
    chip.append(
      fit >= RowFit.ShortChip ? t(TIER_SHORT_LABEL_KEYS[listed.tier]) : fullLabel,
    );
  }
  if (listed.reviewed) {
    const check = document.createElement("span");
    check.title = t("domShared_ytAiReviewed");
    check.setAttribute("role", "img");
    check.setAttribute("aria-label", t("domShared_ytAiReviewed"));
    Object.assign(check.style, { width: "16px", height: "16px", lineHeight: "0" });
    check.appendChild(createBadgeCheckSvg());
    chip.appendChild(check);
  }
  if (!iconOnly) return chip;
  const panel = document.createElement("div");
  panel.textContent = chip.title;
  Object.assign(panel.style, {
    padding: "8px 12px",
    whiteSpace: "nowrap",
    fontFamily: YT_FONT,
    fontSize: "13px",
    fontWeight: "500",
  });
  return withPopover(chip as HTMLButtonElement, panel);
}

function pillButtonStyle(): Partial<CSSStyleDeclaration> {
  return {
    all: "unset",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    height: "36px",
    padding: "0 14px",
    borderRadius: "18px",
    boxSizing: "border-box",
    fontFamily: YT_FONT,
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    whiteSpace: "nowrap",
    color: YT_TEXT,
  };
}

function iconSpan(svg: SVGSVGElement, size = 18): HTMLSpanElement {
  const span = document.createElement("span");
  Object.assign(span.style, { width: `${size}px`, height: `${size}px`, lineHeight: "0" });
  span.appendChild(svg);
  return span;
}

/**
 * A vote count, compact ("1.2K") only where that's shorter: in some languages
 * it's longer than the plain number ("1,2 mil" against "1.234").
 */
function formatCount(n: number): string {
  const full = n.toLocaleString();
  try {
    const compact = new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
    return compact.length < full.length ? compact : full;
  } catch {
    return full;
  }
}

/** "AI | Not AI" with counts; the viewer's choice is filled in. */
function createVoteControl(
  mine: "ai" | "notAi" | null,
  aiVotes: number,
  notAiVotes: number,
  onVote: (vote: "ai" | "notAi") => void,
  tight = false,
): HTMLElement {
  const group = document.createElement("div");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", t("domShared_ytAiVoteQuestion"));
  group.title = t("domShared_ytAiVoteQuestion");
  Object.assign(group.style, {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "18px",
    background: YT_CHIP_BG,
  });

  const makeButton = (
    vote: "ai" | "notAi",
    label: string,
    count: number,
    withIcon: boolean,
  ): HTMLButtonElement => {
    const selected = mine === vote;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(selected));
    Object.assign(btn.style, pillButtonStyle(), {
      color: selected ? "#0f0f0f" : YT_TEXT,
      background: selected ? RL_GRADIENT : "transparent",
    });
    if (tight) btn.style.padding = "0 10px";
    if (withIcon && !tight) btn.appendChild(iconSpan(createRobotIconSvg()));
    btn.append(label);
    // Zero is left blank, like YouTube's own counts.
    if (count > 0) {
      const n = document.createElement("span");
      n.textContent = formatCount(count);
      Object.assign(n.style, {
        fontWeight: "400",
        color: selected ? "#0f0f0f" : YT_TEXT_SECONDARY,
      });
      btn.appendChild(n);
    }
    btn.addEventListener("click", () => onVote(vote));
    return btn;
  };

  const divider = document.createElement("span");
  Object.assign(divider.style, {
    width: "1px",
    height: "20px",
    background: YT_LAYER,
  });

  group.append(
    makeButton("ai", t("domShared_ytAiVoteAi"), aiVotes, true),
    divider,
    makeButton("notAi", t("domShared_ytAiNotAi"), notAiVotes, false),
  );
  return group;
}

function createRoundIconButton(svg: SVGSVGElement, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-expanded", "false");
  Object.assign(btn.style, pillButtonStyle(), {
    width: "36px",
    padding: "0",
    background: YT_CHIP_BG,
  });
  btn.appendChild(iconSpan(svg, 20));
  return btn;
}

/**
 * A button that opens `panel` below it. Clicks outside close it (see
 * closePopovers); it is nudged left if it would run off the screen.
 */
function withPopover(button: HTMLButtonElement, panel: HTMLElement): HTMLElement {
  const wrap = document.createElement("div");
  wrap.setAttribute(POPOVER_ATTR, "");
  wrap.style.position = "relative";
  panel.hidden = true;
  Object.assign(panel.style, {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: "0",
    zIndex: "2300",
    boxSizing: "border-box",
    borderRadius: "12px",
    background: YT_MENU_BG,
    boxShadow: "0 4px 32px rgba(0,0,0,0.2)",
    color: YT_TEXT,
  });
  button.addEventListener("click", () => {
    const open = panel.hidden;
    closePopovers();
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) fitPopover(panel);
  });
  wrap.append(button, panel);
  return wrap;
}

/** Nudges an open popover left if it would run off the screen. */
function fitPopover(panel: HTMLElement): void {
  panel.style.left = "0";
  const overflow = panel.getBoundingClientRect().right - (window.innerWidth - 8);
  if (overflow > 0) panel.style.left = `${-overflow}px`;
}

function closePopovers(e?: Event): void {
  document.querySelectorAll<HTMLElement>(`[${POPOVER_ATTR}]`).forEach((wrap) => {
    // The path, not the target: a menu item may have replaced itself by now.
    if (e && e.composedPath().includes(wrap)) return;
    const [button, panel] = Array.from(wrap.children) as HTMLElement[];
    if (panel) panel.hidden = true;
    button?.setAttribute("aria-expanded", "false");
  });
}

const AI_DISPUTE_PAGE = "https://relockin.com/ai-dispute";

/**
 * The website's dispute form, filled in with this channel and the label the
 * viewer sees, for creators (or anyone) who think the label is wrong.
 */
function aiDisputeUrl(
  channel: ChannelRef,
  channelName: string,
  listed: AiListedChannel | null | undefined,
): string {
  const params = new URLSearchParams({ platform: "youtube" });
  if (channel.id) params.set("channel", channel.id);
  if (channel.handle) params.set("handle", channel.handle);
  if (channelName) params.set("name", channelName);
  if (listed) params.set("tier", listed.tier);
  if (listed?.reviewed) params.set("reviewed", "1");
  params.set("source", isWebExtPlatform() ? "extension" : "mobile");
  return `${AI_DISPUTE_PAGE}?${params}`;
}

/** "What counts as AI?": how to vote, from an info button. */
function createHelpPopover(disputeUrl: string): HTMLElement {
  const panel = document.createElement("div");
  showHelpIn(panel, disputeUrl);
  return withPopover(createRoundIconButton(createInfoSvg(), t("domShared_ytAiHelpTitle")), panel);
}

/** Fills `panel` with the "What counts as AI?" explainer and the dispute link. */
function showHelpIn(panel: HTMLElement, disputeUrl: string): void {
  const title = t("domShared_ytAiHelpTitle");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  Object.assign(panel.style, {
    width: "320px",
    maxWidth: "calc(100vw - 16px)",
    padding: "14px 16px",
    fontFamily: YT_FONT,
    fontSize: "14px",
    lineHeight: "1.45",
  });
  const heading = (text: string) => {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, { fontWeight: "600", marginBottom: "4px" });
    return el;
  };
  const bullets = (items: string[]) => {
    const ul = document.createElement("ul");
    Object.assign(ul.style, { margin: "0 0 10px", paddingLeft: "20px" });
    for (const text of items) {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    }
    return ul;
  };
  const intro = document.createElement("div");
  intro.textContent = t("domShared_ytAiHelpAiIntro");
  const footer = document.createElement("div");
  footer.textContent = t("domShared_ytAiHelpEffect");
  Object.assign(footer.style, { fontSize: "12px", color: YT_TEXT_SECONDARY });
  const dispute = document.createElement("a");
  dispute.href = disputeUrl;
  dispute.target = "_blank";
  dispute.rel = "noopener";
  dispute.textContent = t("domShared_ytAiDisputeLink");
  Object.assign(dispute.style, {
    display: "inline-block",
    marginTop: "8px",
    fontSize: "12px",
    color: YT_TEXT,
    textDecoration: "underline",
  });
  panel.replaceChildren(
    heading(title),
    intro,
    bullets([
      t("domShared_ytAiHelpAiScript"),
      t("domShared_ytAiHelpAiVoice"),
      t("domShared_ytAiHelpAiVisuals"),
      t("domShared_ytAiHelpAiMusic"),
    ]),
    heading(t("domShared_ytAiHelpNotAiTitle")),
    bullets([t("domShared_ytAiHelpNotAiAbout"), t("domShared_ytAiHelpNotAiTouches")]),
    footer,
    dispute,
  );
}

/**
 * The compact row's "⋯": "What counts as AI?", which opens the explainer in
 * its place, and Block / Unblock channel.
 */
function createRowMenu(blocked: boolean, onBlock: () => void, disputeUrl: string): HTMLElement {
  const panel = document.createElement("div");
  const item = (svg: SVGSVGElement, label: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    Object.assign(btn.style, {
      all: "unset",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      width: "100%",
      padding: "10px 16px",
      fontFamily: YT_FONT,
      fontSize: "14px",
      color: YT_TEXT,
      cursor: "pointer",
    });
    btn.append(iconSpan(svg, 20), label);
    btn.addEventListener("click", onClick);
    return btn;
  };
  // withPopover's styles, kept when swapping between the menu and the explainer.
  let baseStyle = "";
  const showMenu = () => {
    panel.setAttribute("role", "menu");
    panel.removeAttribute("aria-label");
    if (baseStyle) panel.style.cssText = baseStyle;
    Object.assign(panel.style, { width: "", minWidth: "220px", padding: "8px 0" });
    panel.replaceChildren(
      item(createInfoSvg(), t("domShared_ytAiHelpTitle"), () => {
        showHelpIn(panel, disputeUrl);
        fitPopover(panel);
      }),
      item(
        createBanSvg(),
        blocked ? t("domShared_ytUnblockChannel") : t("domShared_ytBlockChannel"),
        onBlock,
      ),
    );
  };
  showMenu();
  const button = createRoundIconButton(createEllipsisSvg(), t("domShared_ytMoreOptions"));
  const wrap = withPopover(button, panel);
  baseStyle = panel.style.cssText;
  // Opening shows the menu again, not the explainer it last showed.
  button.addEventListener(
    "click",
    () => {
      if (!panel.hidden) return;
      showMenu();
      panel.hidden = true;
    },
    { capture: true },
  );
  return wrap;
}

/** Block channel / Blocked: the personal blocklist, unrelated to AI. */
function createBlockButton(blocked: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(blocked));
  if (blocked) btn.title = t("domShared_ytUnblockChannel");
  Object.assign(btn.style, pillButtonStyle(), {
    background: blocked ? YT_TEXT : YT_CHIP_BG,
    color: blocked ? YT_BASE_BG : YT_TEXT,
  });
  btn.append(
    iconSpan(createBanSvg()),
    blocked ? t("domShared_ytBlockedChannel") : t("domShared_ytBlockChannel"),
  );
  btn.addEventListener("click", onClick);
  return btn;
}

// MARK: - Icons (Lucide, ISC licence), drawn in the text colour

const SVG_NS = "http://www.w3.org/2000/svg";

function createStrokeSvg(shapes: [string, Record<string, string>][]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: "100%",
    height: "100%",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })) {
    svg.setAttribute(name, value);
  }
  for (const [tag, attrs] of shapes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    svg.appendChild(el);
  }
  return svg;
}

/** "info" */
function createInfoSvg(): SVGSVGElement {
  return createStrokeSvg([
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ]);
}

/** "ellipsis": the compact row's menu. */
function createEllipsisSvg(): SVGSVGElement {
  return createStrokeSvg([
    ["circle", { cx: "12", cy: "12", r: "1" }],
    ["circle", { cx: "19", cy: "12", r: "1" }],
    ["circle", { cx: "5", cy: "12", r: "1" }],
  ]);
}

/** "ban": Block channel. */
function createBanSvg(): SVGSVGElement {
  return createStrokeSvg([
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "m4.9 4.9 14.2 14.2" }],
  ]);
}

/** "badge-check": RelockIn reviewed the channel. */
function createBadgeCheckSvg(): SVGSVGElement {
  return createStrokeSvg([
    [
      "path",
      {
        d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
      },
    ],
    ["path", { d: "m9 12 2 2 4-4" }],
  ]);
}
