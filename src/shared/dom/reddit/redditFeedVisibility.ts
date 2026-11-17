// --- Reddit feeds: hide whole feeds, or trim Home to joined communities -------
//
// HideFeeds (a RedditFeedVisibility) swaps a hidden feed's posts for a short
// note, in place: the header, search and sidebar stay usable, so going
// somewhere on purpose still works. We never redirect; landing somewhere
// unexpected reads as Reddit being broken. Each level hides what the level
// before it does:
//
//   HideDiscovery  r/all, r/popular, Explore, News
//   HideAll        also Home (the front page and its sorts) and custom feeds
//
// The links to those feeds in Reddit's navigation are hidden too, including
// Home's row in new reddit's left nav at HideAll. The logo still links Home,
// since it's how people get back to the site; there it just shows the note.
//
// HomeJoinedOnly (new reddit only; old reddit's front page is already just
// your subscriptions) hides Home posts that carry a Join button, which Reddit
// only renders for communities you haven't joined. Hidden posts take no
// space, so Reddit's infinite scroll would otherwise keep fetching page after
// page of them; once a long run of hidden posts piles up (or Reddit stops
// loading while the end of the feed is on screen) we stop loading and show a
// "You're all caught up" card.
//
// Everything is driven by root classes and CSS, so it applies at
// document_start with no flash of the feed. Reddit navigates client-side, so
// the classes are re-evaluated whenever the URL changes.

import type { RelockrSettings } from "@/types/RelockrSettings";
import { RedditFeedVisibility } from "@/types/enums";
import { t } from "~/lib/i18n";
import { SettingsKey } from "../../settings/settingsKey";
import { RL_FONT_BODY, RL_FONT_TITLE } from "../../overlayUI/designTokens";
import { injectStyle } from "../utils/injectStyle";
import { createRelockrIconSvg } from "../utils/relockrIconSvg";

const STYLE_ID = "my-reddit-feed-visibility-css";
const NOTE_ID = "relockr-reddit-feed-note";
const CAUGHT_UP_ID = "relockr-reddit-caught-up";

// Root classes.
const HIDE_DISCOVERY_LINKS_CLASS = "relockr-reddit-hide-discovery-links";
const FEED_HIDDEN_CLASS = "relockr-reddit-feed-hidden";
const JOINED_ONLY_CLASS = "relockr-reddit-home-joined-only";
const CAUGHT_UP_CLASS = "relockr-reddit-home-caught-up";

const JOIN_BUTTON = 'shreddit-join-button[data-testid="credit-bar-join-button"]';

// A run of this many hidden posts at the end of the feed counts as caught up.
const CAUGHT_UP_HIDDEN_RUN = 30;
// Or: the end of the feed has been on screen this long with nothing new.
const CAUGHT_UP_STALL_MS = 3000;

type FeedKind = "discovery" | "home" | "other";

const SORTS = "best|hot|new|top|rising|controversial";
// r/all and r/popular, including sorts and r/all-sub filters (r/all-funny).
const DISCOVERY_PATH = /^\/(?:r\/(?:all|popular)(?:[-+][^/]*)?|explore|news)(?:\/|$)/i;
const HOME_PATH = new RegExp(`^/(?:(?:${SORTS})/?)?$`, "i");
const CUSTOM_FEED_PATH = /^\/(?:(?:user|u)\/[^/]+|me)\/m\/[^/]+/i;

export function redditFeedKind(pathname: string): FeedKind {
  if (DISCOVERY_PATH.test(pathname)) return "discovery";
  if (HOME_PATH.test(pathname) || CUSTOM_FEED_PATH.test(pathname)) return "home";
  return "other";
}

function isOldReddit(): boolean {
  return window.location.hostname === "old.reddit.com";
}

function readVisibility(settings: RelockrSettings): RedditFeedVisibility {
  const val = settings[SettingsKey.Reddit.HideFeeds];
  return val === RedditFeedVisibility.HideDiscovery ||
    val === RedditFeedVisibility.HideAll
    ? val
    : RedditFeedVisibility.ShowAll;
}

function isFeedHidden(kind: FeedKind, visibility: RedditFeedVisibility): boolean {
  if (kind === "discovery") return visibility !== RedditFeedVisibility.ShowAll;
  if (kind === "home") return visibility === RedditFeedVisibility.HideAll;
  return false;
}

// --- CSS ---------------------------------------------------------------------

const DISCOVERY_NOUNS = ["popular_menu", "all_menu", "explore_menu", "news_menu"];
const DISCOVERY_HREFS = ["/r/popular/", "/r/all/", "/explore/", "/news/"];

function discoveryLinkSelectors(): string {
  const H = `html.${HIDE_DISCOVERY_LINKS_CLASS}`;
  const sel: string[] = [];
  for (const noun of DISCOVERY_NOUNS) {
    // New reddit's left nav wraps each link in a tracker.
    sel.push(`${H} faceplate-tracker[noun="${noun}"]`);
    sel.push(`${H} li:has(> faceplate-tracker[noun="${noun}"])`);
  }
  for (const href of DISCOVERY_HREFS) {
    const bare = href.replace(/\/$/, "");
    // Relative on new reddit, absolute on old reddit.
    for (const a of [`a[href="${href}"]`, `a[href="${bare}"]`, `a[href$="reddit.com${href}"]`]) {
      sel.push(`${H} ${a}`);
      // Old reddit's header bar and listing chooser: drop the whole item,
      // which carries its "-" separator.
      sel.push(`${H} li:has(> ${a})`);
    }
  }
  return sel.join(",\n  ");
}

const FEED_VISIBILITY_CSS = `
  ${discoveryLinkSelectors()} {
    display: none !important;
  }

  /* Hidden feed, new reddit: everything in the main column but our note. */
  html.${FEED_HIDDEN_CLASS} main#main-content > :not(#${NOTE_ID}),
  html.${FEED_HIDDEN_CLASS} #right-sidebar-container,
  html.${FEED_HIDDEN_CLASS} shreddit-feed {
    display: none !important;
  }
  /* Hidden feed, old reddit: the listing, its sort tabs and paging. */
  html.${FEED_HIDDEN_CLASS} body.listing-page div.content[role="main"] > :not(#${NOTE_ID}) {
    display: none !important;
  }

  /* Home, joined communities only: posts that offer to join. */
  html.${JOINED_ONLY_CLASS} shreddit-feed article:has(${JOIN_BUTTON}),
  html.${JOINED_ONLY_CLASS} shreddit-feed article:has(${JOIN_BUTTON}) + hr,
  html.${JOINED_ONLY_CLASS} shreddit-feed shreddit-post:has(${JOIN_BUTTON}) {
    display: none !important;
  }
  /* Caught up: hide Reddit's loaders so it stops fetching more. */
  html.${CAUGHT_UP_CLASS} shreddit-feed faceplate-partial,
  html.${CAUGHT_UP_CLASS} shreddit-feed ~ faceplate-partial,
  html.${CAUGHT_UP_CLASS} shreddit-feed [slot="load-more"],
  html.${CAUGHT_UP_CLASS} shreddit-feed ~ [slot="load-more"] {
    display: none !important;
  }
  html:not(.${JOINED_ONLY_CLASS}) #${CAUGHT_UP_ID},
  html:not(.${CAUGHT_UP_CLASS}) #${CAUGHT_UP_ID} {
    display: none !important;
  }

  #${NOTE_ID}, #${CAUGHT_UP_ID} {
    box-sizing: border-box;
    width: min(560px, calc(100% - 32px));
    margin: 32px auto;
    padding: 24px;
    background: rgb(12, 12, 14);
    color: rgba(255, 255, 255, 0.92);
    border-radius: 12px;
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    line-height: 1.45;
    text-align: left;
  }
  #${NOTE_ID} .relockr-feed-icon, #${CAUGHT_UP_ID} .relockr-feed-icon {
    width: 36px;
    height: 36px;
    margin-bottom: 12px;
  }
  #${NOTE_ID} .relockr-feed-title, #${CAUGHT_UP_ID} .relockr-feed-title {
    margin: 0 0 6px;
    font-family: ${RL_FONT_TITLE};
    font-size: 20px;
    font-weight: 700;
    line-height: 1.25;
    color: rgba(255, 255, 255, 0.92);
  }
  #${NOTE_ID} .relockr-feed-body, #${CAUGHT_UP_ID} .relockr-feed-body {
    margin: 0;
    color: rgba(255, 255, 255, 0.7);
  }
  /* Every box property is pinned: on the caught-up card this is a <button>,
     which otherwise picks up Reddit's own button height/line-height. */
  #${NOTE_ID} .relockr-feed-button, #${CAUGHT_UP_ID} .relockr-feed-button {
    appearance: none;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 8px 14px;
    vertical-align: middle;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
    font: inherit;
    font-weight: 600;
    line-height: 1.25;
    text-decoration: none;
    cursor: pointer;
  }
  #${NOTE_ID} .relockr-feed-button:hover, #${CAUGHT_UP_ID} .relockr-feed-button:hover {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }
  #${NOTE_ID} .relockr-feed-links, #${CAUGHT_UP_ID} .relockr-feed-links {
    margin: 12px 0 0;
  }
  #${NOTE_ID} .relockr-feed-hint {
    margin: 18px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
  }
`;

// --- State -------------------------------------------------------------------

let visibility = RedditFeedVisibility.ShowAll;
let homeJoinedOnly = false;
let lastHref = "";
let urlWatchStarted = false;

/**
 * Root classes + CSS. Safe at document_start: it only touches
 * documentElement, so no feed post renders before it applies.
 */
export function applyRedditFeedVisibilityEarly(settings: RelockrSettings): void {
  visibility = readVisibility(settings);
  homeJoinedOnly =
    !isOldReddit() && !!settings[SettingsKey.Reddit.HomeJoinedOnly];
  injectStyle(STYLE_ID, FEED_VISIBILITY_CSS);
  syncRootClasses();
}

/** Full apply: the root classes plus the note and caught-up card. */
export function applyRedditFeedVisibility(settings: RelockrSettings): void {
  applyRedditFeedVisibilityEarly(settings);
  syncLeftNavShadowStyle();
  syncPageContent();
  watchUrlChanges();
}

// New reddit's left nav renders its Home / Popular / News / Explore items in
// <left-nav-top-section>'s shadow root (the light DOM only holds invisible
// placeholders), where document CSS can't reach. So we put a <style> into the
// shadow root itself, like the NSFW prompt bypass does.
const LEFT_NAV_SELECTOR = "left-nav-top-section";
const LEFT_NAV_STYLE_ID = "relockr-left-nav-feed-links";

function leftNavHiddenFeeds(): { nouns: string[]; hrefs: string[] } {
  if (visibility === RedditFeedVisibility.ShowAll) return { nouns: [], hrefs: [] };
  const nouns = [...DISCOVERY_NOUNS];
  const hrefs = [...DISCOVERY_HREFS];
  if (visibility === RedditFeedVisibility.HideAll) {
    // The logo still goes Home (and shows the note); this is just the nav row.
    nouns.push("home_menu");
    hrefs.push("/");
  }
  return { nouns, hrefs };
}

function leftNavCss(): string {
  const { nouns, hrefs } = leftNavHiddenFeeds();
  if (nouns.length === 0) return "";
  // Popular's row is <li id="popular-posts">; the others probably follow suit.
  const sel: string[] = nouns.map(
    (noun) => `li#${noun.replace(/_menu$/, "")}-posts`,
  );
  for (const noun of nouns) {
    sel.push(`faceplate-tracker[noun="${noun}"]`);
    sel.push(`li:has(faceplate-tracker[noun="${noun}"])`);
  }
  for (const href of hrefs) {
    // The nav uses absolute links (https://www.reddit.com/r/popular/).
    const bare = href.replace(/\/$/, "");
    const links = [`a[href="${href}"]`, `a[href$="reddit.com${href}"]`];
    if (bare) links.push(`a[href="${bare}"]`, `a[href$="reddit.com${bare}"]`);
    for (const a of links) {
      sel.push(a);
      sel.push(`li:has(> ${a})`);
    }
  }
  return `${sel.join(",\n")} { display: none !important; }`;
}

function syncLeftNavShadowStyle(): void {
  const navs = document.querySelectorAll(LEFT_NAV_SELECTOR);
  if (navs.length === 0) return;
  const css = leftNavCss();
  navs.forEach((nav) => {
    const root = nav.shadowRoot;
    if (!root) return; // Closed or not upgraded yet; retried on the next mutation.
    let style = root.getElementById(LEFT_NAV_STYLE_ID);
    if (!style) {
      if (!css) return;
      style = document.createElement("style");
      style.id = LEFT_NAV_STYLE_ID;
      root.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  });
}

function syncRootClasses(): void {
  const root = document.documentElement;
  const kind = redditFeedKind(window.location.pathname);
  root.classList.toggle(
    HIDE_DISCOVERY_LINKS_CLASS,
    visibility !== RedditFeedVisibility.ShowAll,
  );
  root.classList.toggle(FEED_HIDDEN_CLASS, isFeedHidden(kind, visibility));
  const joinedOnly =
    homeJoinedOnly &&
    kind === "home" &&
    !isFeedHidden(kind, visibility) &&
    // Custom feeds are lists the user picked, so there's nothing to trim.
    !CUSTOM_FEED_PATH.test(window.location.pathname);
  root.classList.toggle(JOINED_ONLY_CLASS, joinedOnly);
  if (!joinedOnly) resetCaughtUp();
}

function syncPageContent(): void {
  const kind = redditFeedKind(window.location.pathname);
  if (isFeedHidden(kind, visibility)) {
    ensureNote(kind);
  } else {
    document.getElementById(NOTE_ID)?.remove();
  }
  if (document.documentElement.classList.contains(JOINED_ONLY_CLASS)) {
    watchJoinedOnlyFeed();
  }
}

// Reddit swaps pages client-side, so watch for the URL changing under us.
// Comparing location.href on each mutation batch is cheap.
function watchUrlChanges(): void {
  if (urlWatchStarted) return;
  urlWatchStarted = true;
  lastHref = window.location.href;
  const onMaybeNavigated = () => {
    // The left nav may mount (or re-mount) at any point.
    syncLeftNavShadowStyle();
    if (window.location.href === lastHref) return;
    lastHref = window.location.href;
    syncRootClasses();
    syncPageContent();
  };
  new MutationObserver(onMaybeNavigated).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener("popstate", onMaybeNavigated);
}

// --- Hidden-feed note --------------------------------------------------------

function feedContainer(): HTMLElement | null {
  const el = isOldReddit()
    ? document.querySelector('div.content[role="main"]')
    : document.querySelector("main#main-content");
  return el instanceof HTMLElement ? el : null;
}

function ensureNote(kind: FeedKind): void {
  const container = feedContainer();
  if (!container) return; // Not rendered yet; the next apply retries.
  const existing = document.getElementById(NOTE_ID);
  if (existing?.parentElement === container && existing.dataset.kind === kind) {
    return;
  }
  existing?.remove();
  container.prepend(buildNote(kind));
}

function buildNote(kind: FeedKind): HTMLElement {
  const note = document.createElement("section");
  note.id = NOTE_ID;
  note.dataset.kind = kind;

  note.append(buildIcon());

  const title = document.createElement("h2");
  title.className = "relockr-feed-title";
  title.textContent = t("domShared_redditFeedHiddenTitle");

  const body = document.createElement("p");
  body.className = "relockr-feed-body";
  body.textContent =
    kind === "discovery"
      ? t("domShared_redditFeedHiddenDiscoveryBody")
      : t("domShared_redditFeedHiddenAllBody");

  note.append(title, body);

  // Old reddit has a page listing your subscriptions. New reddit lists them in
  // the left sidebar, which stays visible.
  if (isOldReddit()) {
    const links = document.createElement("p");
    links.className = "relockr-feed-links";
    const communities = document.createElement("a");
    communities.className = "relockr-feed-button";
    communities.href = "/subreddits/mine/";
    communities.textContent = t("domShared_redditFeedHiddenCommunities");
    links.append(communities);
    note.append(links);
  }

  const hint = document.createElement("p");
  hint.className = "relockr-feed-hint";
  hint.textContent = t("domShared_redditFeedHiddenSettingsHint");
  note.append(hint);

  return note;
}

function buildIcon(): HTMLElement {
  const icon = document.createElement("div");
  icon.className = "relockr-feed-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.append(createRelockrIconSvg());
  return icon;
}

// --- Home: joined communities only -------------------------------------------

let feedObserver: MutationObserver | null = null;
let observedFeed: Element | null = null;
let stallTimer: number | null = null;
let postCountAtLastCheck = 0;
// "Check for more" restarts the count from here, so the posts already hidden
// don't immediately trip caught-up again.
let runStartIndex = 0;

function watchJoinedOnlyFeed(): void {
  const feed = document.querySelector("shreddit-feed");
  if (!feed) return; // Not rendered yet; the next apply retries.
  if (feed !== observedFeed) {
    feedObserver?.disconnect();
    observedFeed = feed;
    runStartIndex = 0;
    postCountAtLastCheck = 0;
    feedObserver = new MutationObserver(checkCaughtUp);
    feedObserver.observe(feed, { childList: true, subtree: true });
    window.addEventListener("scroll", scheduleStallCheck, { passive: true });
  }
  ensureCaughtUpCard(feed);
  checkCaughtUp();
}

function feedPosts(): Element[] {
  if (!observedFeed) return [];
  return Array.from(observedFeed.querySelectorAll("shreddit-post"));
}

function isHiddenPost(post: Element): boolean {
  return !!post.querySelector(JOIN_BUTTON);
}

function trailingHiddenRun(posts: Element[]): number {
  let run = 0;
  for (let i = posts.length - 1; i >= runStartIndex; i--) {
    if (!isHiddenPost(posts[i])) break;
    run++;
  }
  return run;
}

function checkCaughtUp(): void {
  if (!document.documentElement.classList.contains(JOINED_ONLY_CLASS)) return;
  if (document.documentElement.classList.contains(CAUGHT_UP_CLASS)) return;
  const posts = feedPosts();
  const run = trailingHiddenRun(posts);
  if (run >= CAUGHT_UP_HIDDEN_RUN) {
    setCaughtUp();
    return;
  }
  if (posts.length !== postCountAtLastCheck) {
    postCountAtLastCheck = posts.length;
    scheduleStallCheck();
  }
}

// Reddit may only load more when its last post scrolls into view, and a
// hidden post never does. If the end of the feed sits on screen with nothing
// new arriving, and what's there at the end is hidden, we're caught up.
function scheduleStallCheck(): void {
  if (stallTimer !== null) window.clearTimeout(stallTimer);
  stallTimer = window.setTimeout(() => {
    stallTimer = null;
    if (!observedFeed?.isConnected) return;
    if (!document.documentElement.classList.contains(JOINED_ONLY_CLASS)) return;
    const posts = feedPosts();
    if (posts.length !== postCountAtLastCheck) return checkCaughtUp();
    if (trailingHiddenRun(posts) === 0) return;
    const feedBottom = observedFeed.getBoundingClientRect().bottom;
    if (feedBottom <= window.innerHeight + 200) setCaughtUp();
  }, CAUGHT_UP_STALL_MS);
}

function setCaughtUp(): void {
  document.documentElement.classList.add(CAUGHT_UP_CLASS);
}

function resetCaughtUp(): void {
  document.documentElement.classList.remove(CAUGHT_UP_CLASS);
}

function ensureCaughtUpCard(feed: Element): void {
  const existing = document.getElementById(CAUGHT_UP_ID);
  if (existing && existing.previousElementSibling === feed) return;
  existing?.remove();
  feed.after(buildCaughtUpCard());
}

function buildCaughtUpCard(): HTMLElement {
  const card = document.createElement("section");
  card.id = CAUGHT_UP_ID;

  const title = document.createElement("h2");
  title.className = "relockr-feed-title";
  title.textContent = t("domShared_redditHomeCaughtUpTitle");

  const body = document.createElement("p");
  body.className = "relockr-feed-body";
  body.textContent = t("domShared_redditHomeCaughtUpBody");

  const links = document.createElement("p");
  links.className = "relockr-feed-links";
  const more = document.createElement("button");
  more.type = "button";
  more.className = "relockr-feed-button";
  more.textContent = t("domShared_redditHomeCaughtUpLoadMore");
  more.addEventListener("click", () => {
    runStartIndex = feedPosts().length;
    postCountAtLastCheck = runStartIndex;
    resetCaughtUp();
    scheduleStallCheck();
  });
  links.append(more);

  card.append(buildIcon(), title, body, links);
  return card;
}
