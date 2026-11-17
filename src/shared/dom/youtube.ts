import { t } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import {
  ElementTreatment,
  CoverDifficulty,
  DisplayMode,
  ThumbnailFilter,
} from "@/types/enums";

import { rlog } from "../rlog";
import { delay, hideElement } from "./domUtils";
import { applyCover } from "./coverElement";
import { setHiddenBySelectors } from "./utils/hiddenStylesheet";
import { SettingsKey } from "../settings/settingsKey";
import { insertShortsRemovedBadge } from "./utils/shortsRemovedBadge";
import {
  applyYouTubeThumbnailFilter,
  applyYouTubePostImageGreyscale,
} from "./utils/youtubeThumbnailFilter";
import { isHiddenSettingOn } from "./utils/hiddenSetting";
import { disableYouTubeVideoPreviews } from "./utils/youtubeVideoPreviews";
import { applyYouTubeAiContent } from "./youtubeAiContent";
import {
  installFloatingSkipAdButton,
  uninstallFloatingSkipAdButton,
} from "./utils/youtubeSkipAdButton";

const SHORTS_PROCESSED_ATTR = "data-relockr-shorts-processed";
const SHELF_PROCESSED_ATTR = "data-relockr-shorts-shelf-processed";
const ROGUE_PROCESSED_ATTR = "data-relockr-shorts-rogue-processed";
const SHORTS_SELECTORS = [
  "ytm-shorts-lockup-view-model-v2",
  "ytm-shorts-lockup-view-model",
  'ytm-shorts-lockup-view-model[data-lockup-surface="sfv-c7r2"]',
  ".shortsLockupViewModelHost",
];
// Selectors for the *shelf* containers that hold groups of Shorts. We walk up
// from each Short to its enclosing shelf so we can replace the whole shelf
// (header + grid) with one badge, instead of stamping a badge next to each
// individual lockup card.
const SHELF_SELECTOR = [
  "grid-shelf-view-model",
  "ytd-reel-shelf-renderer",
  "ytd-rich-shelf-renderer",
  "ytm-reel-shelf-renderer",
  "ytm-shorts-lockup-shelf-renderer",
  "ytm-rich-section-renderer",
].join(",");
// "Rogue" Shorts are inline list items that ARE themselves a single Short
// (e.g. one Short mixed into a search-results list). They have no enclosing
// shorts shelf, so the shelf path above never sees them. Each rogue is its
// own list item; we coalesce *adjacent sibling* rogues into one badge so a
// burst of 3 in a row produces 1 badge, not 3.
// Channels' posts (text/image updates) as they appear in the Home feed. Mobile
// wraps each in a ytm-rich-section-renderer; desktop's are in a posts shelf.
const POST_SELECTOR = [
  "ytm-backstage-post-thread-renderer",
  "ytd-backstage-post-thread-renderer",
  "ytd-post-renderer",
].join(",");
const POST_CONTAINER_SELECTOR = [
  "ytm-rich-section-renderer",
  "ytd-rich-section-renderer",
  "ytd-rich-item-renderer",
].join(",");

const ROGUE_SHORTS_CONTAINER_SELECTOR = [
  "ytm-video-with-context-renderer:has(.big-shorts-singleton)",
  "ytm-video-with-context-renderer:has([data-style='SHORTS'])",
].join(",");

const NAV_TABS_STYLE_ID = "relockr-yt-hidden-nav-tabs";
const SHORTS_TAB_SELECTORS = [
  "div.pivot-bar-item-tab.pivot-shorts", // Mobile
  'a.ytd-mini-guide-entry-renderer[href~="/shorts/"]', // Desktop, narrow (icon) guide
  // Desktop, full guide (wide windows). Its link may have no href, and the
  // title is localized, so the Shorts icon's path is the language-neutral match.
  'ytd-guide-entry-renderer:has(> a#endpoint[href^="/shorts"])',
  'ytd-guide-entry-renderer:has(> a#endpoint[title="Shorts"])',
  'ytd-guide-entry-renderer:has(> a#endpoint path[d^="m13.467 1.19-8 4.7"])',
];
const HOME_TAB_SELECTORS = [
  "div.pivot-bar-item-tab.pivot-w2w", // Mobile
  'a.ytd-mini-guide-entry-renderer[href~="/"]', // Desktop, narrow (icon) guide
  'ytd-guide-entry-renderer:has(> a#endpoint[href="/"])', // Desktop, full guide
];

/** Hides the Shorts and Home tabs with a stylesheet (see setHiddenBySelectors). */
export function applyYouTubeNavTabStyles(relockrSettings: RelockrSettings): void {
  setHiddenBySelectors(NAV_TABS_STYLE_ID, [
    ...(relockrSettings[SettingsKey.YouTube.ShortsTab] ? SHORTS_TAB_SELECTORS : []),
    ...(relockrSettings[SettingsKey.YouTube.HomeTab] ? HOME_TAB_SELECTORS : []),
  ]);
}

export function applyAnyActiveYoutubeSettings(
  relockrSettings: RelockrSettings,
  node: Element,
): void {
  if (relockrSettings[SettingsKey.YouTube.Shorts]) {
    hideYouTubeShorts(relockrSettings, node);
  }
  applyYouTubeNavTabStyles(relockrSettings);
  if (relockrSettings[SettingsKey.YouTube.RedirectHomeToSubscriptions]) {
    redirectFromHomeToSubscriptionsIfNecessary();
  }
  if (relockrSettings[SettingsKey.YouTube.HideHomeFeedPosts]) {
    hideHomeFeedPosts(node);
  }
  if (relockrSettings[SettingsKey.YouTube.HideEndCard]) {
    hideYouTubeEndCard(node);
  }
  const displayMode = relockrSettings[SettingsKey.YouTube.DisplayMode] as
    DisplayMode | undefined;
  if (displayMode && displayMode !== DisplayMode.Default) {
    enforceYouTubeDisplayMode(displayMode);
  }
  const recommendationsTreatment = relockrSettings[
    SettingsKey.YouTube.RecommendedVideos
  ] as ElementTreatment | undefined;
  if (
    recommendationsTreatment &&
    recommendationsTreatment !== ElementTreatment.Show
  ) {
    const recommendationsDifficulty =
      (relockrSettings[SettingsKey.YouTube.RecommendedVideosCoverDifficulty] as
        CoverDifficulty | undefined) ?? CoverDifficulty.ShortWait;
    applyYouTubeRecommendedVideos(
      node,
      recommendationsTreatment,
      recommendationsDifficulty,
    );
  }
  if (relockrSettings[SettingsKey.YouTube.DisableAutoplay]) {
    disableAutoplayInRoot(node);
  }
  if (relockrSettings[SettingsKey.YouTube.DisableVideoPreviews]) {
    disableYouTubeVideoPreviews(node);
  }
  const thumbnailFilter = relockrSettings[
    SettingsKey.YouTube.ThumbnailFilter
  ] as ThumbnailFilter | undefined;
  if (thumbnailFilter) {
    applyYouTubeThumbnailFilter(thumbnailFilter);
  }
  // Posts' images aren't video thumbnails, so the filter misses them. Any
  // filter greys them out, wherever the posts still show.
  applyYouTubePostImageGreyscale(
    !!thumbnailFilter &&
      thumbnailFilter !== ThumbnailFilter.Visible &&
      isHiddenSettingOn(relockrSettings, SettingsKey.YouTube.GreyscalePostImages),
  );
  if (relockrSettings[SettingsKey.YouTube.MakeAdsSkippable]) {
    installFloatingSkipAdButton();
  } else {
    uninstallFloatingSkipAdButton();
  }
  applyYouTubeAiContent(relockrSettings);
}

function hideYouTubeShorts(settings: RelockrSettings, node: Element): void {
  const shelf = hideShortsInShelves(settings, node);
  const rogue = hideRogueInlineShorts(settings, node);

  const total = shelf.hidden + rogue.hidden;
  if (total === 0) return;
  rlog(
    `Hid YouTube Shorts: ${shelf.hidden} in ${shelf.shelves} shelf/shelves, ${rogue.hidden} inline rogue across ${rogue.runs} run(s), ${shelf.orphans} unrecognized orphan(s)`,
  );
}

function hideShortsInShelves(
  settings: RelockrSettings,
  node: Element,
): {
  hidden: number;
  shelves: number;
  orphans: number;
} {
  // Group every Short by its enclosing shelf so each shelf gets ONE badge,
  // not one per short. Shorts that have no recognizable shelf ancestor are
  // hidden silently (no badge) rather than spamming the page.
  const shelfToShorts = new Map<Element, HTMLElement[]>();
  let orphanCount = 0;

  for (const selector of SHORTS_SELECTORS) {
    const els = node.querySelectorAll<HTMLElement>(selector);
    for (const el of els) {
      const shelf = el.closest(SHELF_SELECTOR);
      if (!shelf) {
        if (el.getAttribute(SHORTS_PROCESSED_ATTR) !== "1") {
          hideElement(el, "YouTube Shorts (no shelf)");
          el.setAttribute(SHORTS_PROCESSED_ATTR, "1");
          orphanCount += 1;
        }
        continue;
      }
      if (shelf.getAttribute(SHELF_PROCESSED_ATTR) === "1") continue;
      const list = shelfToShorts.get(shelf) ?? [];
      list.push(el);
      shelfToShorts.set(shelf, list);
    }
  }

  let hidden = orphanCount;
  for (const [shelf, shorts] of shelfToShorts) {
    shelf.setAttribute(SHELF_PROCESSED_ATTR, "1");
    const shelfParent = shelf.parentElement;
    hideElement(shelf, "YouTube Shorts Shelf");
    hidden += shorts.length;

    if (!shelfParent) continue;
    insertShortsRemovedBadge(settings, shelfParent, shelf, shorts.length);
  }

  return { hidden, shelves: shelfToShorts.size, orphans: orphanCount };
}

function hideRogueInlineShorts(
  settings: RelockrSettings,
  node: Element,
): {
  hidden: number;
  runs: number;
} {
  // querySelectorAll returns matches in document order and deduplicated, so
  // we can detect adjacency by comparing each match's previousElementSibling
  // against the tail of the current run.
  const unprocessed: HTMLElement[] = [];
  node
    .querySelectorAll<HTMLElement>(ROGUE_SHORTS_CONTAINER_SELECTOR)
    .forEach((el) => {
      if (el.getAttribute(ROGUE_PROCESSED_ATTR) !== "1") unprocessed.push(el);
    });

  if (unprocessed.length === 0) return { hidden: 0, runs: 0 };

  const runs: HTMLElement[][] = [];
  let current: HTMLElement[] = [];
  for (const el of unprocessed) {
    if (
      current.length > 0 &&
      el.previousElementSibling === current[current.length - 1]
    ) {
      current.push(el);
    } else {
      if (current.length > 0) runs.push(current);
      current = [el];
    }
  }
  if (current.length > 0) runs.push(current);

  for (const run of runs) {
    const first = run[0];
    const parent = first.parentElement;
    for (const el of run) {
      hideElement(el, "YouTube Shorts (inline)");
      el.setAttribute(ROGUE_PROCESSED_ATTR, "1");
    }
    if (!parent) continue;
    insertShortsRemovedBadge(settings, parent, first, run.length);
  }

  return { hidden: unprocessed.length, runs: runs.length };
}

/** Only on Home: posts stay on channel pages and their own post pages. */
function hideHomeFeedPosts(node: Element): void {
  if (location.pathname !== "/") return;
  node.querySelectorAll<HTMLElement>(POST_SELECTOR).forEach((post) => {
    const container = post.closest<HTMLElement>(POST_CONTAINER_SELECTOR) ?? post;
    if (container.hasAttribute("data-hide-reason")) return;
    hideElement(container, "YouTube Home feed post");
  });
}

function redirectFromHomeToSubscriptionsIfNecessary(): void {
  if (location.hostname.includes("youtube.com") && location.pathname === "/") {
    // Only redirect if a Subscriptions entry point exists in the page, which
    // implies the user is logged in. Otherwise /feed/subscriptions is broken.
    // Desktop renders an <a href="/feed/subscriptions">; mobile renders a
    // pivot tab without an href, identified by the .pivot-subs class.
    const subscriptionsEntry = document.querySelector(
      'a[href="/feed/subscriptions"], div.pivot-bar-item-tab.pivot-subs',
    );
    if (!subscriptionsEntry) return;
    location.replace("/feed/subscriptions");
  }
}

function hideYouTubeEndCard(node: Element): void {
  const endCardsDesktop = node.querySelectorAll<Element>(
    "div.ytp-fullscreen-grid-stills-container",
  );
  const endCardsMobile = node.querySelectorAll<Element>(
    "div#player-endscreen-container",
  );
  const endCardContainers = [...endCardsDesktop, ...endCardsMobile];
  endCardContainers.forEach((el) => hideElement(el, "YouTube End Card"));
}

function enforceYouTubeDisplayMode(mode: DisplayMode): void {
  if (!location.hostname.includes("youtube.com")) return;

  const wantHost =
    mode === DisplayMode.Mobile ? "m.youtube.com" : "www.youtube.com";
  const wantApp = mode === DisplayMode.Mobile ? "m" : "desktop";

  const url = new URL(location.href);
  if (location.hostname === wantHost) return;

  url.hostname = wantHost;
  url.searchParams.set("persist_app", "1");
  url.searchParams.set("app", wantApp);
  rlog(`YT Display Mode, replacing url with = ${url.toString()}`);

  location.replace(url.toString());
}

function applyYouTubeRecommendedVideos(
  node: Element,
  treatment: ElementTreatment,
  difficulty: CoverDifficulty,
): void {
  const selectors = [
    "ytd-item-section-renderer.ytd-watch-next-secondary-results-renderer", // Desktop
    "div.related-items-container", // Mobile
  ];
  for (const selector of selectors) {
    const el = node.querySelector<Element>(selector);
    if (!el) continue;
    if (treatment === ElementTreatment.Remove) {
      hideElement(el, "YouTube Recommended Videos");
    } else if (treatment === ElementTreatment.Cover) {
      applyCover(
        el,
        t("domShared_youTubeCoverRecommendedTitle"),
        undefined,
        difficulty,
        1,
      );
    }
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
}

export interface AutoplayDisableResult {
  foundToggle: boolean;
  changed: boolean;
}

const defaultRetryOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  retryDelayMs: 1600,
};

export async function disableAutoplayInRoot(
  root: ParentNode,
  options: RetryOptions = {},
): Promise<AutoplayDisableResult> {
  const { maxAttempts, retryDelayMs } = { ...defaultRetryOptions, ...options };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const desktopToggle = root.querySelector<HTMLElement>(
      ".ytp-autonav-toggle-button",
    );
    if (desktopToggle) {
      const isEnabled = desktopToggle.getAttribute("aria-checked") === "true";
      if (isEnabled) {
        desktopToggle.click();
        await delay(retryDelayMs);
        continue;
      }

      return { foundToggle: true, changed: attempt > 0 };
    }

    const mobileToggle = root.querySelector<HTMLElement>(
      ".ytm-autonav-toggle-button-container",
    );
    if (mobileToggle) {
      const isEnabled = mobileToggle.getAttribute("aria-pressed") === "true";
      if (isEnabled) {
        mobileToggle.click();
        await delay(retryDelayMs);
        continue;
      }

      return { foundToggle: true, changed: attempt > 0 };
    }

    if (attempt < maxAttempts - 1) {
      await delay(retryDelayMs);
    }
  }

  const foundAnyToggle =
    !!root.querySelector(".ytp-autonav-toggle-button") ||
    !!root.querySelector(".ytm-autonav-toggle-button-container");

  return {
    foundToggle: foundAnyToggle,
    changed: false,
  };
}
