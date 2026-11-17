// --- New-reddit feed style (Titles only / Thumbnails / Expanded) -------------
//
// New reddit has its own Card and Compact views (each shreddit-post carries
// view-type="cardView" | "compactView"). Reddit remembers the choice in a
// non-HttpOnly `compact=true|false` cookie on `.reddit.com`, which its view
// menu writes. The `?feedViewType=` param switches the page it's on but doesn't
// update the cookie. Our feed style maps onto the views:
//
//   Titles only  Reddit Compact, and we hide its [slot="thumbnail"]
//   Thumbnails   Reddit Compact
//   Expanded     Reddit Card
//
// We write the cookie when the RelockIn setting changes (see
// syncNewRedditFeedView); from then on Reddit's own menu wins, so we don't
// fight it. The one exception: when our style wants Compact (Titles only /
// Thumbnails), switching to Card from Reddit's menu only lasts
// CARD_OVERRIDE_TTL_MS, after which we put Compact back. The CSS keys off each
// post's actual view-type rather than our setting, so a feed the user switched
// to Card is left as Reddit renders it.
//
// The two underlying booleans (ExpandMediaByDefault / HideOldRedditThumbnails)
// are shared with old reddit and surfaced as root classes by
// applyAnyActiveRedditSettings.
//
// The Preview swipe gesture toggles a single post's media regardless of view,
// via per-post override classes (see toggleNewRedditPostMedia).

import type { RelockrSettings } from "@/types/RelockrSettings";
import { SettingsKey } from "../../settings/settingsKey";
import { injectStyle } from "../utils/injectStyle";

export const NEW_REDDIT_FEED_STYLE_STYLE_ID = "my-new-reddit-feed-style-css";

// Per-post gesture overrides.
const FORCE_MEDIA_CLASS = "relockr-reddit-force-media";
const COLLAPSE_MEDIA_CLASS = "relockr-reddit-collapse-media";

const EXPAND_CLASS = "relockr-reddit-expand-media";
const THUMBS_HIDDEN_CLASS = "relockr-reddit-thumbs-hidden";

type NewRedditFeedView = "cardView" | "compactView";
const COMPACT = `[view-type="compactView"]`;
const CARD = `:not([view-type="compactView"])`;

const COMPACT_COOKIE = "compact";
const COMPACT_COOKIE_DOMAIN = ".reddit.com";
const COMPACT_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;
const FEED_VIEW_PARAM = "feedViewType";
// Which view we last pushed to Reddit, in reddit.com's own localStorage so it
// works unchanged in the mobile WebViews. Per device and origin, like Reddit's
// cookie.
// (v2: v1 was recorded by a build that wrote the cookie to the wrong domain,
// so those devices need to sync again.)
const SYNCED_VIEW_STORAGE_KEY = "relockin.feedViewTypeSynced.v2";
// When we first saw Reddit's own menu switch a Compact-wanting style to Card.
const CARD_OVERRIDE_STORAGE_KEY = "relockin.cardViewOverrideSince";
const CARD_OVERRIDE_TTL_MS = 60 * 60 * 1000;

// Only the first apply after a page load may end a temporary Card view, so the
// feed never switches under someone mid-scroll; the next page load does it.
let firstApplyThisPage = true;

export const NEW_REDDIT_FEED_STYLE_CSS = `
  /* Titles only: hide Reddit's compact-view thumbnail, unless the user
   * force-expanded the post with the Preview gesture. */
  html.${THUMBS_HIDDEN_CLASS}:not(.${EXPAND_CLASS}) shreddit-feed shreddit-post${COMPACT}:not(.${FORCE_MEDIA_CLASS}) [slot="thumbnail"] {
    display: none !important;
  }

  /* Preview gesture on a compact post: show its media inline in place of the
   * thumbnail. */
  shreddit-feed shreddit-post${COMPACT}.${FORCE_MEDIA_CLASS} [slot="post-media-container"] {
    display: block !important;
  }
  shreddit-feed shreddit-post${COMPACT}.${FORCE_MEDIA_CLASS} [slot="thumbnail"] {
    display: none !important;
  }

  /* Preview gesture on a card post: collapse its media. */
  shreddit-feed shreddit-post${CARD}.${COLLAPSE_MEDIA_CLASS} [slot="post-media-container"] {
    display: none !important;
  }
`;

export function applyNewRedditFeedStyle(settings: RelockrSettings): void {
  injectStyle(NEW_REDDIT_FEED_STYLE_STYLE_ID, NEW_REDDIT_FEED_STYLE_CSS);
  const isFirstApply = firstApplyThisPage;
  firstApplyThisPage = false;
  syncNewRedditFeedView(settings, isFirstApply);
}

export function desiredNewRedditFeedView(
  settings: RelockrSettings,
): NewRedditFeedView {
  return settings[SettingsKey.Reddit.ExpandMediaByDefault]
    ? "cardView"
    : "compactView";
}

// Push our feed style to Reddit once per change of the RelockIn setting.
// Until the setting changes again we leave Reddit's view alone, except for
// ending a temporary Card view (see expireTemporaryCardView).
function syncNewRedditFeedView(
  settings: RelockrSettings,
  isFirstApply: boolean,
): void {
  const desired = desiredNewRedditFeedView(settings);
  if (readSyncedView() !== desired) {
    // Record before reloading so this happens once. If storage is unavailable
    // we can't remember it, so don't touch anything rather than reload forever.
    if (!writeSyncedView(desired)) return;
    removeStored(CARD_OVERRIDE_STORAGE_KEY);
    pushNewRedditFeedView(desired);
    return;
  }
  if (desired === "compactView") expireTemporaryCardView(isFirstApply);
}

// Titles only / Thumbnails want Compact. If the user switches to Card with
// Reddit's own menu, honour it for CARD_OVERRIDE_TTL_MS from when we first
// notice, then put Compact back on the next page load.
function expireTemporaryCardView(isFirstApply: boolean): void {
  if (readCookie(COMPACT_COOKIE) === "true") {
    // Still (or back) on Compact: nothing temporary going on.
    removeStored(CARD_OVERRIDE_STORAGE_KEY);
    return;
  }
  const since = Number(readStored(CARD_OVERRIDE_STORAGE_KEY));
  if (!since) {
    writeStored(CARD_OVERRIDE_STORAGE_KEY, String(Date.now()));
    return;
  }
  if (!isFirstApply || Date.now() - since < CARD_OVERRIDE_TTL_MS) return;
  if (!removeStored(CARD_OVERRIDE_STORAGE_KEY)) return; // avoid a reload loop
  pushNewRedditFeedView("compactView");
}

// Write Reddit's own `compact` cookie, which makes the view stick. If a feed
// page is currently showing the other view, reload it with `?feedViewType=`
// too, so the change shows immediately.
function pushNewRedditFeedView(desired: NewRedditFeedView): void {
  // An earlier build wrote a host-only duplicate that shadows Reddit's cookie.
  deleteHostOnlyCookie(COMPACT_COOKIE);

  // What this page was rendered with: the posts say so once they exist;
  // before that, the cookie the request carried (Reddit defaults to Card).
  const renderedView =
    document.querySelector("shreddit-post[view-type]")?.getAttribute("view-type") ??
    (readCookie(COMPACT_COOKIE) === "true" ? "compactView" : "cardView");

  writeCookie(COMPACT_COOKIE, String(desired === "compactView"));
  if (renderedView !== desired && isNewRedditFeedPath(window.location.pathname)) {
    const url = new URL(window.location.href);
    url.searchParams.set(FEED_VIEW_PARAM, desired);
    window.location.replace(url.href);
  }
}

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// Same domain and path as Reddit's cookie, so ours replaces it rather than
// sitting beside it.
function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; domain=${COMPACT_COOKIE_DOMAIN}; path=/; max-age=${COMPACT_COOKIE_MAX_AGE_S}; secure; samesite=lax`;
}

function deleteHostOnlyCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; secure; samesite=lax`;
}

const FEED_SORTS = "best|hot|new|top|rising|controversial";
const FEED_PATH = new RegExp(
  `^/(?:(?:${FEED_SORTS})/?|r/[^/]+/?(?:(?:${FEED_SORTS})/?)?)?$`,
  "i",
);

/** Home, sorted home feeds, and subreddit (incl. popular/all) listings. */
export function isNewRedditFeedPath(pathname: string): boolean {
  return FEED_PATH.test(pathname);
}

function readSyncedView(): string | null {
  return readStored(SYNCED_VIEW_STORAGE_KEY);
}

function writeSyncedView(view: NewRedditFeedView): boolean {
  return writeStored(SYNCED_VIEW_STORAGE_KEY, view);
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStored(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// Preview gesture: flip this post's media between shown and hidden. Card posts
// show media by default and compact posts don't; we only ever set an override
// that differs from that default, so clearing both classes returns the post to
// Reddit's rendering.
export function toggleNewRedditPostMedia(post: HTMLElement): void {
  const shownByDefault = post.getAttribute("view-type") !== "compactView";
  const forced = post.classList.contains(FORCE_MEDIA_CLASS);
  const collapsed = post.classList.contains(COLLAPSE_MEDIA_CLASS);
  const currentlyShown = forced || (shownByDefault && !collapsed);

  post.classList.remove(FORCE_MEDIA_CLASS, COLLAPSE_MEDIA_CLASS);
  if (currentlyShown) {
    if (shownByDefault) post.classList.add(COLLAPSE_MEDIA_CLASS);
  } else {
    if (!shownByDefault) post.classList.add(FORCE_MEDIA_CLASS);
  }
}
