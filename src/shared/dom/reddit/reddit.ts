import type { RelockrSettings } from "@/types/RelockrSettings";
import { SettingsKey } from "../../settings/settingsKey";
import { isHiddenSettingOn } from "../utils/hiddenSetting";
import { isWebExtPlatform } from "../../platform/platform";
import { injectStyle } from "../utils/injectStyle";
import { setMediaGreyscale } from "../utils/mediaGreyscale";
import {
  ACTION_BAR_CSS,
  attachActionBar,
  OLD_REDDIT_ACTION_BAR_STYLE_ID,
} from "./commentActionBar";
import {
  GESTURE_CSS,
  NEW_REDDIT_GESTURE_OVERFLOW_CSS,
  NEW_REDDIT_GESTURE_OVERFLOW_STYLE_ID,
  OLD_REDDIT_GESTURE_STYLE_ID,
} from "./swipeGestures";
import {
  AUTH_TOAST_CSS,
  OLD_REDDIT_AUTH_TOAST_STYLE_ID,
} from "./oldRedditAuthGuard";
import {
  attachCommentSwipes,
  configureCommentSwipeActions,
} from "./commentSwipeGestures";
import {
  attachPostSwipes,
  configurePostSwipeActions,
} from "./postSwipeGestures";
import {
  attachPostActionBar,
  OLD_REDDIT_POST_ACTION_BAR_STYLE_ID,
  OLD_REDDIT_POST_VOTE_RELOCATE_STYLE_ID,
  POST_ACTION_BAR_CSS,
  POST_VOTE_RELOCATE_CSS,
} from "./postActionBar";
import {
  enhancePostTagline,
  OLD_REDDIT_POST_TAGLINE_STYLE_ID,
  POST_TAGLINE_CSS,
} from "./postTagline";
import { retargetPostTitleToComments } from "./postTitleLink";
import { applyNewRedditFeedStyle } from "./newRedditFeedStyle";
import { applyRedditFeedVisibility } from "./redditFeedVisibility";
import {
  attachNewRedditPostSwipes,
  configureNewRedditPostSwipeActions,
} from "./newRedditPostSwipeGestures";
import {
  attachNewRedditCommentSwipes,
  configureNewRedditCommentSwipeActions,
} from "./newRedditCommentSwipeGestures";
import {
  NEW_REDDIT_APP_SHEET_SELECTOR,
  NEW_REDDIT_GATE_SELECTOR,
  NEW_REDDIT_LIGHT_DOM_APP_SHEET_SELECTOR,
  showRedditAppWallToastIfPresent,
} from "./redditAppWallToast";

// Compile-time switches for handling Reddit's frequently-changing mobile prompts,
// so either can be turned off quickly while testing Reddit behavior or responding
// to a broken selector.
const ATTEMPT_APP_WALL_BYPASS = false;
const ATTEMPT_NSFW_WALL_BYPASS = false;

const OLD_REDDIT_SUBREDDIT_STYLESHEET_SELECTOR =
  'link[title="applied_subreddit_stylesheet"]';

// Cached so we can re-attach if the user later adds the subreddit to the allow list.
let removedSubredditStylesheet: HTMLLinkElement | null = null;
let removedSubredditHeaderImage: {
  wrapper: HTMLAnchorElement;
  image: HTMLElement;
} | null = null;
let subredditStylesAllowed = false;
let subredditStyleObserver: MutationObserver | null = null;

const OLD_REDDIT_MOBILE_STYLE_ID = "my-old-reddit-mobile-css";
const OLD_REDDIT_DEPTH_COLORS_STYLE_ID = "my-old-reddit-depth-colors-css";

// Apollo-style depth color coding. Each comment's .entry gets its own short
// colored stripe (rather than one long line spanning the whole subtree, which
// stacks visually when threads run deep). Colors cycle every 4 levels; each
// deeper rule wins purely on specificity, so the cascade picks the right color
// per depth without needing nth-child math. The .child default dotted border
// is suppressed so only the per-comment stripes show.
const OLD_REDDIT_DEPTH_COLORS_CSS = `
  .comment .child {
    border-left: none !important;
  }
  .comment > .entry {
    border-left: 3px solid #ff8b60;
    padding-left: 6px;
    margin-left: 0px !important;
  }
  .comment .child .comment > .entry {
    border-left-color: #5fa8d3;
  }
  .comment .child .comment .child .comment > .entry {
    border-left-color: #6ec19a;
  }
  .comment .child .comment .child .comment .child .comment > .entry {
    border-left-color: #c885d8;
  }
  .comment .child .comment .child .comment .child .comment .child .comment > .entry {
    border-left-color: #ff8b60;
  }
  .comment .child .comment .child .comment .child .comment .child .comment .child .comment > .entry {
    border-left-color: #5fa8d3;
  }
  .comment .child .comment .child .comment .child .comment .child .comment .child .comment .child .comment > .entry {
    border-left-color: #6ec19a;
  }
  .comment .child .comment .child .comment .child .comment .child .comment .child .comment .child .comment .child .comment > .entry {
    border-left-color: #c885d8;
  }
`;

const OLD_REDDIT_MOBILE_CSS = `

  div#header-bottom-right {
    font-size: 0.75rem;
  }

  /* The button telling people to try New Reddit. We assume our users don't need it */
  #redesign-beta-optin-btn {
    display: none !important;
  }

  /* Sidebar "Submit a link" / "Create your own subreddit" - not useful on mobile */
  div.side {
    display: none !important;
  }

  /* Useless generic signup CTA bar */
  section.listingsignupbar {
    display: none !important;
  }

  /* Post ranking numbers (1, 2, 3...) - too narrow on mobile */
  span.rank {
    display: none !important;
  }

  a.thumbnail > img {
    border-radius: 8px;
  }

  /* Listing chooser sidebar */
  div.listing-chooser {
    visibility: hidden !important;
  }

  html {
    width: fit-content !important;
    max-width: 100vw;
  }

  div.content {
    margin-left: 4px !important;
  }

  div.thing.link {
    margin-left: -12px !important;
  }

  /* Divider line between posts for visual separation on mobile */
  body.listing-page .thing.link {
    border-bottom: 1px solid #d9d9d9;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }

  /* When "expand media by default" is on we open every post's expando, which
   * would flood the feed with long self-text. Clamp it to a few lines with a
   * soft fade instead; full text is one tap away on the post page (which isn't
   * a listing-page, so it stays unclamped). Gated on the root class so it's
   * inert unless the setting is active. */
  html.relockr-reddit-expand-media body.listing-page .thing.link .expando .usertext-body .md {
    max-height: 4.5em;
    overflow: hidden;
    -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent);
    mask-image: linear-gradient(to bottom, #000 55%, transparent);
  }

  /* Thumbnails feed style: a post's thumbnail is redundant once the user
   * expands its media inline, so hide it while expanded and bring it back when
   * collapsed. Scoped to Thumbnails mode (neither expand-media nor thumbs-hidden
   * is set); the expando-button carries the .expanded class while open. */
  html:not(.relockr-reddit-expand-media):not(.relockr-reddit-thumbs-hidden) .thing.link:has(.expando-button.expanded) > a.thumbnail {
    display: none !important;
  }

  /* Was 10px, makes comments less indented outwards */
  .comment, .content .details {
    margin-left: 4px !important;
  }

  /* Overall child comment positioning & border */
  .comment .child, .comment .showreplies {
    margin-left: 4px !important; /* was 15. */
    margin-top: 8px; /* was 8 */
  }

  /* Children of a reddit comment in the tree hierarchy */
  div.child {
    margin-left: -2px;
  }

  div.commentarea {
    margin-left: -4px;
  }

  textarea {
    max-width: 90vw !important;
  }

  div.usertext-edit {
    max-width: 95vw !important;
  }

  @media (max-width: 900px) {

  /* box with "you are viewing a single comments thread" */
  .infobar {
    margin-right: 10px !important;
    margin-left: 10px !important;
  }

  /* Make the buttons in header more legible */
    #sr-header-area {
      font-size: 110% !important;
    }

    .drop-choices a.choice {
      font-size: 1.5rem;
    }

    /* Put user section of header in new row */
    #header-bottom-right {
      position: static !important;
    }

    body.with-listing-chooser #header .pagename {
      position: static;
    }

    .panestack-title {
      margin-right: 10px !important;
    }
    .menuarea {
      margin-right: 10px !important;
    }
    #noresults {
      margin-right: 10px !important;
      margin-left: 10px !important;
    }

    /* media expando (eg video). The negative margin compensates for floats
     * sitting on .entry's left side (.midcol vote column ~58px and/or
     * .thumbnail 70px) so the expando reclaims the post's full width. The
     * "ideal" target is votes-col + thumbnail-hidden at -44px (the original
     * tuning); every ~70px of float on the left needs an equal increment
     * of negative margin to keep the expando in the same screen column.
     * The vote-relocate stylesheet adds 12px padding-left to .thing.link
     * which factors into the "votes-under" rows.
     *
     * Order: state-class rules first so they win over the no-flags fallback. */
    :root.relockr-reddit-vote-under-posts.relockr-reddit-thumbs-hidden .expando {
      margin-left: 0 !important;
    }
    :root.relockr-reddit-vote-under-posts:not(.relockr-reddit-thumbs-hidden) .expando {
      margin-left: -68px !important;
    }
    :root.relockr-reddit-thumbs-hidden:not(.relockr-reddit-vote-under-posts) .expando {
      margin-left: -44px !important;
    }
    /* No flags: midcol + thumbnail both visible. */
    .expando {
      margin-left: -114px !important;
    }
    :root.relockr-reddit-vote-under-posts .thing.link.relockr-no-thumbnail .expando {
      margin-left: 0 !important;
    }
    :root:not(.relockr-reddit-vote-under-posts) .thing.link.relockr-no-thumbnail .expando {
      margin-left: -44px !important;
    }

    /* Thumbnails mode hides a post's thumbnail while it's expanded (see the
     * :has(.expando-button.expanded) > a.thumbnail rule further up). That
     * removes the ~70px float from .entry's left edge, so the expando's
     * negative margin has to shrink by the same amount — otherwise the media
     * hangs off the left of the screen. Same values as the no-thumbnail rows
     * above; last in the block so they win over the has-thumbnail tunings. */
    html.relockr-reddit-vote-under-posts:not(.relockr-reddit-expand-media):not(.relockr-reddit-thumbs-hidden) .thing.link:has(.expando-button.expanded) .expando {
      margin-left: 0 !important;
    }
    html:not(.relockr-reddit-vote-under-posts):not(.relockr-reddit-expand-media):not(.relockr-reddit-thumbs-hidden) .thing.link:has(.expando-button.expanded) .expando {
      margin-left: -44px !important;
    }

    /* undo media expando effects for text (e.g. text post content) */
    .thing[data-type='link'][data-context='comments'] .expando div.usertext-body {
      margin-left: 40px !important;
    }

    .usertext-body .md {
      max-width: 100%;
      overflow-wrap: anywhere;
    }

    .usertext-body .md table {
      display: block;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
      touch-action: pan-x pan-y pinch-zoom;
      white-space: nowrap;
    }

    .usertext-body .md th,
    .usertext-body .md td {
      white-space: nowrap;
    }

    .thing .title {
     color: #1D2242;
    }

    /* stop expando cutoff. Flow root needed to keep entry in Block Formatting Context */
    .entry {
      overflow: visible !important;
      display: flow-root;
    }

    .media-preview,
    .media-preview-content,
    .media-preview-content .may-blank,
    .media-preview .no-constraints-when-pinned {
      min-width: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
    }

    .media-preview img.preview,
    .media-preview img.censored-preview,
    .media-preview video.preview {
      max-width: min(100%, calc(100vw - 8px)) !important;
      width: 100% !important;
      height: auto !important;
      object-fit: contain !important;
    }

    .expando iframe.media-embed {
      max-width: min(100%, calc(100vw - 8px)) !important;
      width: 100% !important;
      height: auto !important;
      aspect-ratio: 16 / 9;
      border: 0;
    }

    .thing.link > a.thumbnail.relockr-synthesized-thumbnail img {
      max-width: 70px !important;
      max-height: 70px !important;
      object-fit: cover !important;
    }

    .gallery-nav-bar .gallery-navigation {
      font-size: 15px !important;
    }

    .interstitial {
      max-width: 90% !important;
    }

    .interstitial .buttons {
      flex-direction: column !important;
    }

    .interstitial .buttons .c-btn {
      max-width: 80% !important;
    }

    div.footer-parent {
      margin-left: 8px !important;
      margin-right: 8px;
    }

    /* Chat / messages. Old Reddit pins chat.reddit.com in a fixed-width
     * iframe anchored to the bottom-right, which on a phone hangs off the
     * left edge. The page inside already renders its mobile layout, so we only
     * need to resize the frame: a full-width bottom sheet. Stopping short of
     * the top keeps the chat's own close/minimize controls clear of our
     * session timer. The minimized "Chat" pill is a <section>, not affected. */
    iframe.chat-app-window:not(.minimized) {
      position: fixed !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      top: auto !important;
      width: 90% !important;
      max-width: none !important;
      height: 85dvh !important;
      max-height: none !important;
      margin: 0 !important;
      border: 0 !important;
      border-radius: 12px 12px 0 0 !important;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.25) !important;
    }
    section.chat-app-window.minimized {
      right: 8px !important;
      max-width: calc(100vw - 16px) !important;
    }
  }
`;

const NEW_REDDIT_SHARED_XPROMO_GATE_STYLE_ID =
  "my-new-reddit-shared-xpromo-gate-css";
const NEW_REDDIT_APP_WALL_STYLE_ID = "my-new-reddit-app-wall-css";

// New reddit shows logged-out visitors xpromo dialogs (sign-in, app-download and
// NSFW prompts). The dialog mounts as a
// <div class="rpl-dialog configured-xpromo ..."> whose shadow root holds the
// overlay tint + blur (part="overlay") and the card (part="panel"); reddit also
// stamps `class="rpl-scroll-lock"` on <body> (just `overflow: hidden !important`
// plus scrollbar-width padding) to freeze the page beneath. The separate "View in
// Reddit App" prompt is a <faceplate-bottom-sheet id="xpromo-bottom-sheet"> that
// uses the same body scroll lock.
//
// The overlay/panel live in a shadow root, so plain descendant selectors can't
// reach them — but they expose ::part(overlay) / ::part(panel), which a document
// stylesheet can pierce via the host. Reddit reuses this generic host for app,
// sign-in, and NSFW prompts, so this shared rule is injected only when both
// flags are enabled. Turning either flag off therefore cannot leave the generic
// selector hiding that prompt.
const NEW_REDDIT_SHARED_XPROMO_GATE_CSS = `
  ${NEW_REDDIT_GATE_SELECTOR}::part(overlay) {
    background-color: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    pointer-events: none !important;
  }
  ${NEW_REDDIT_GATE_SELECTOR}::part(panel) {
    visibility: hidden !important;
  }
`;

// App-specific bottom sheets plus the scroll unlock they apply. Unlike the
// generic xpromo host above, these selectors are known app-wall variants and
// are controlled solely by ATTEMPT_APP_WALL_BYPASS.
const NEW_REDDIT_APP_WALL_CSS = `
  ${NEW_REDDIT_APP_SHEET_SELECTOR}[open] {
    display: none !important;
  }
  /* Newer "get the app" nudge is a light-DOM .rpl-bottom-sheet. Hiding it at the
   * document level is safe: the overflow-menu bottom sheets our swipe save/hide
   * drive live inside shadow roots, which document CSS can't reach. */
  ${NEW_REDDIT_LIGHT_DOM_APP_SHEET_SELECTOR} {
    display: none !important;
  }
  /* Keep the page scrollable no matter what scroll-lock reddit applies for these
   * gates. We also strip the scroll-lock classes in JS (stripBodyScrollLock);
   * this blanket override is the belt-and-suspenders in case a class reappears
   * for a frame or the lock rides on html rather than body. */
  html,
  body {
    overflow: auto !important;
  }
`;

// NSFW post images are covered by an <xpromo-nsfw-blocking-container> whose shadow
// root holds a div.prompt overlay. It has no `part` attribute, so ::part() can't
// reach it and a document stylesheet can't cross the shadow boundary — we have to
// inject a <style> directly into the (open) shadow root.
const NSFW_PROMPT_CONTAINER_SELECTOR = "xpromo-nsfw-blocking-container";
const NSFW_PROMPT_SHADOW_STYLE_ID = "relockr-nsfw-prompt-hide";
const NSFW_PROMPT_SHADOW_CSS = `.prompt { visibility: hidden !important; }`;

function hideNsfwPostPrompt(container: Element): void {
  const root = container.shadowRoot;
  if (!root) return; // closed / not yet attached — retried on the next mutation.
  if (root.getElementById(NSFW_PROMPT_SHADOW_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = NSFW_PROMPT_SHADOW_STYLE_ID;
  style.textContent = NSFW_PROMPT_SHADOW_CSS;
  root.appendChild(style);
}

function hideAllNsfwPostPrompts(): void {
  document
    .querySelectorAll(NSFW_PROMPT_CONTAINER_SELECTOR)
    .forEach(hideNsfwPostPrompt);
}

// We deliberately do NOT auto-reveal media. Reddit keeps a native "View NSFW
// content" button on <shreddit-blurred-container>; letting the user press it means
// reddit runs its own reveal (which projects the `revealed` slot and sizes the
// media correctly) and the user opts in per post rather than every NSFW item on a
// feed auto-loading a third-party embed.
//
// The one gap that button leaves for video/gif posts (e.g. RedGIFs): the real
// media lives in the `revealed` slot behind a deferred third-party embed. Reddit's
// signed-in reveal builds the embed's <iframe> from its `html` attribute; the
// signed-out path un-blurs the container but never fires that reveal, so the
// <shreddit-embed> shadow root stays empty — the embed
// component only renders in response to reddit's trigger, not to us clearing its
// `data-embed-obscured-deferred` flag.
//
// So once the user reveals a post (reddit removes `blurred`) we finish the job the
// signed-in path would have: drop the defer flags (`embed-obscured` on the
// container, `data-embed-obscured-deferred` on the embed) to match a working
// reveal, and render the iframe ourselves from the embed's `html` attribute into
// its shadow root — exactly the node reddit injects when signed in. Leaving
// still-`blurred` posts untouched means each keeps its button and stays gated.
const NSFW_BLURRED_CONTAINER_SELECTOR =
  'shreddit-blurred-container[reason="nsfw"]';

// Build the embed's iframe from its `html` attribute (reddit's own embed markup)
// into its shadow root, matching what the signed-in reveal produces. The `html`
// attribute is the plain iframe markup; a <template> parses it inertly (no script
// execution) and we graft only the iframe element across.
function renderDeferredEmbedIframe(embed: Element): void {
  const root = embed.shadowRoot;
  if (!root) return; // closed / not upgraded yet — retried on the next mutation.
  if (root.querySelector("iframe")) return; // already rendered.
  const html = embed.getAttribute("html");
  if (!html) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  const iframe = template.content.querySelector("iframe");
  if (iframe) root.appendChild(iframe);
}

function undeferRevealedEmbed(container: Element): void {
  if (container.hasAttribute("blurred")) return; // not revealed yet — leave gated.
  container.removeAttribute("embed-obscured");
  container.querySelectorAll("shreddit-embed").forEach((embed) => {
    embed.removeAttribute("data-embed-obscured-deferred");
    renderDeferredEmbedIframe(embed);
  });
}

function undeferAllRevealedEmbeds(): void {
  document
    .querySelectorAll(NSFW_BLURRED_CONTAINER_SELECTOR)
    .forEach(undeferRevealedEmbed);
}

// Scroll-lock classes reddit stamps on <body> while an xpromo gate is up.
const SCROLL_LOCK_CLASSES = ["rpl-scroll-lock", "scroll-is-blocked"];
let scrollLockObserver: MutationObserver | null = null;
let scrollLockWatchStarted = false;

function stripBodyScrollLock(): void {
  const body = document.body;
  if (!body) return;
  for (const cls of SCROLL_LOCK_CLASSES) body.classList.remove(cls);
}

// Strip reddit's scroll-lock classes and keep them off as reddit re-applies them.
// A dedicated
// observer on <body>'s class attribute is cheap (single node); if <body> isn't
// up yet we wait for it.
function watchBodyScrollLock(): void {
  if (scrollLockWatchStarted) return;
  scrollLockWatchStarted = true;

  const begin = () => {
    stripBodyScrollLock();
    scrollLockObserver = new MutationObserver(stripBodyScrollLock);
    scrollLockObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  };

  if (document.body) {
    begin();
    return;
  }
  const wait = new MutationObserver(() => {
    if (!document.body) return;
    wait.disconnect();
    begin();
  });
  wait.observe(document.documentElement, { childList: true, subtree: true });
}

let blockingGateObserver: MutationObserver | null = null;

// Safe at document_start: injectStyle appends to documentElement, and the CSS
// rules activate reactively whenever reddit mounts a prompt later. One conditional
// observer serves both flags: childList/open changes detect app sheets, while
// childList/blurred changes detect NSFW prompts and newly revealed embeds.
export function neutralizeNewRedditBlockingGates(): void {
  if (!ATTEMPT_APP_WALL_BYPASS && !ATTEMPT_NSFW_WALL_BYPASS) return;

  if (ATTEMPT_APP_WALL_BYPASS && ATTEMPT_NSFW_WALL_BYPASS) {
    injectStyle(
      NEW_REDDIT_SHARED_XPROMO_GATE_STYLE_ID,
      NEW_REDDIT_SHARED_XPROMO_GATE_CSS,
    );
  }

  if (ATTEMPT_APP_WALL_BYPASS) {
    injectStyle(NEW_REDDIT_APP_WALL_STYLE_ID, NEW_REDDIT_APP_WALL_CSS);
    watchBodyScrollLock();
    showRedditAppWallToastIfPresent();
  }

  if (ATTEMPT_NSFW_WALL_BYPASS) {
    hideAllNsfwPostPrompts();
    undeferAllRevealedEmbeds();
  }

  if (blockingGateObserver) return;
  blockingGateObserver = new MutationObserver(() => {
    if (ATTEMPT_NSFW_WALL_BYPASS) {
      hideAllNsfwPostPrompts();
      undeferAllRevealedEmbeds();
    }
    if (ATTEMPT_APP_WALL_BYPASS) {
      showRedditAppWallToastIfPresent();
    }
  });
  blockingGateObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["blurred", "open"],
  });
}

const VIEWPORT_CONTENT = "width=device-width, initial-scale=1";

// Safe to call at document_start - injectStyle appends a <style> to documentElement,
// which exists immediately. CSS rules apply to elements as they're parsed.
export function injectOldRedditMobileFriendlyStyles(): void {
  injectStyle(OLD_REDDIT_MOBILE_STYLE_ID, OLD_REDDIT_MOBILE_CSS);
  applyViewportMetaWhenReady();
}

export function injectOldRedditDepthColors(): void {
  injectStyle(OLD_REDDIT_DEPTH_COLORS_STYLE_ID, OLD_REDDIT_DEPTH_COLORS_CSS);
}

let viewportMetaApplied = false;
let viewportMetaObserver: MutationObserver | null = null;

function applyViewportMetaWhenReady(): void {
  if (viewportMetaApplied) return;
  if (upsertViewportMeta()) {
    viewportMetaApplied = true;
    return;
  }
  if (viewportMetaObserver) return;
  viewportMetaObserver = new MutationObserver(() => {
    if (upsertViewportMeta()) {
      viewportMetaApplied = true;
      viewportMetaObserver?.disconnect();
      viewportMetaObserver = null;
    }
  });
  viewportMetaObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function upsertViewportMeta(): boolean {
  const head = document.head;
  if (!head) return false;
  let meta = head.querySelector(
    "meta[name='viewport']",
  ) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "viewport");
    head.appendChild(meta);
  }
  meta.setAttribute("content", VIEWPORT_CONTENT);
  return true;
}

export function makeOldRedditMobileFriendly(settings: RelockrSettings) {
  injectOldRedditMobileFriendlyStyles();
  enableOldRedditCommentEnhancements(settings);
}

let thingObserver: MutationObserver | null = null;

// Config-global for the session — read by enhancePost when it decides whether
// to auto-open each post's expando. Kept module-scoped (rather than threaded
// through every enhance* signature) since it's constant for a given configure.
let expandMediaByDefault = false;

export function enableOldRedditCommentEnhancements(
  settings: RelockrSettings,
): void {
  injectStyle(OLD_REDDIT_GESTURE_STYLE_ID, GESTURE_CSS);
  injectStyle(OLD_REDDIT_AUTH_TOAST_STYLE_ID, AUTH_TOAST_CSS);
  injectStyle(OLD_REDDIT_ACTION_BAR_STYLE_ID, ACTION_BAR_CSS);
  injectStyle(OLD_REDDIT_POST_ACTION_BAR_STYLE_ID, POST_ACTION_BAR_CSS);
  injectStyle(OLD_REDDIT_POST_TAGLINE_STYLE_ID, POST_TAGLINE_CSS);

  const enableCommentSwipes =
    !!settings[SettingsKey.Reddit.EnableCommentSwipes];
  const enablePostSwipes = !!settings[SettingsKey.Reddit.EnablePostSwipes];
  const moveVoteUnderPosts =
    !!settings[SettingsKey.Reddit.MoveVoteCountUnderPosts];
  const hideThumbnails = !!settings[SettingsKey.Reddit.HideOldRedditThumbnails];
  expandMediaByDefault = !!settings[SettingsKey.Reddit.ExpandMediaByDefault];
  if (enableCommentSwipes) configureCommentSwipeActions(settings);
  if (enablePostSwipes) configurePostSwipeActions(settings);
  if (moveVoteUnderPosts) {
    injectStyle(OLD_REDDIT_POST_VOTE_RELOCATE_STYLE_ID, POST_VOTE_RELOCATE_CSS);
  }

  document
    .querySelectorAll(".thing.comment")
    .forEach((el) => enhanceComment(el as HTMLElement, enableCommentSwipes));
  document
    .querySelectorAll(".thing.link")
    .forEach((el) =>
      enhancePost(
        el as HTMLElement,
        enablePostSwipes,
        moveVoteUnderPosts,
        hideThumbnails,
      ),
    );

  if (thingObserver) return;
  thingObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        enhanceAddedNode(
          node,
          enableCommentSwipes,
          enablePostSwipes,
          moveVoteUnderPosts,
          hideThumbnails,
        );
        node
          .querySelectorAll?.(".thing.comment, .thing.link")
          .forEach((el) =>
            enhanceAddedNode(
              el as HTMLElement,
              enableCommentSwipes,
              enablePostSwipes,
              moveVoteUnderPosts,
              hideThumbnails,
            ),
          );
      }
    }
  });
  thingObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function enhanceAddedNode(
  el: HTMLElement,
  enableCommentSwipes: boolean,
  enablePostSwipes: boolean,
  moveVoteUnderPosts: boolean,
  hideThumbnails: boolean,
): void {
  if (!el.classList.contains("thing")) return;
  if (el.classList.contains("comment")) {
    enhanceComment(el, enableCommentSwipes);
  } else if (el.classList.contains("link")) {
    enhancePost(el, enablePostSwipes, moveVoteUnderPosts, hideThumbnails);
  }
}

function enhanceComment(thing: HTMLElement, enableSwipes: boolean): void {
  if (enableSwipes) attachCommentSwipes(thing);
  attachActionBar(thing);
}

function enhancePost(
  thing: HTMLElement,
  enableSwipes: boolean,
  moveVoteUnderPosts: boolean,
  hideThumbnails: boolean,
): void {
  normalizeOldRedditPostMediaChrome(thing, hideThumbnails);
  if (expandMediaByDefault) autoExpandPostMedia(thing);
  enhancePostTagline(thing);
  // Must run before the action bar so it can stash the source URL for the
  // Source button.
  retargetPostTitleToComments(thing);
  if (enableSwipes) attachPostSwipes(thing);
  attachPostActionBar(thing, moveVoteUnderPosts);
}

// Open a post's expando by default (feed only). Reuses reddit's own expand
// handler by clicking the button — the same path a manual tap (or the
// Expand/Collapse swipe) takes — so lazy-loaded media (video/embeds) loads
// correctly. Self-text is clamped to a few lines purely via CSS (see the
// mobile stylesheet); the click just makes the expando visible. Runs once per
// post. On a post's own page reddit already shows the content, so we restrict
// to listing pages.
function autoExpandPostMedia(thing: HTMLElement): void {
  if (thing.dataset.relockrAutoExpanded) return;
  if (!document.body?.classList.contains("listing-page")) return;
  const button = thing.querySelector(
    ":scope > .entry .expando-button",
  ) as HTMLElement | null;
  if (!button) return;
  thing.dataset.relockrAutoExpanded = "1";
  if (button.classList.contains("collapsed")) {
    button.click();
    suppressExpandoAutoplay(thing);
  }
}

// Auto-expanding a video post makes reddit's inline <video> autoplay — with a
// feed full of them, they all start blaring audio at once. Since we triggered
// the expansion, we cancel that initial autoplay. The media loads async after
// the click, so we watch the expando for a short window and pause any video
// that tries to play; after the window we stop interfering so the user's own
// playback works normally.
const AUTOPLAY_SUPPRESS_WINDOW_MS = 3000;

function suppressExpandoAutoplay(thing: HTMLElement): void {
  const expando = thing.querySelector(":scope > .entry > .expando");
  if (!(expando instanceof HTMLElement)) return;

  const cleanups: Array<() => void> = [];
  const guard = (video: HTMLVideoElement) => {
    if (video.dataset.relockrNoAutoplay) return;
    video.dataset.relockrNoAutoplay = "1";
    video.autoplay = false;
    video.removeAttribute("autoplay");
    const onPlay = () => video.pause();
    video.addEventListener("play", onPlay);
    cleanups.push(() => video.removeEventListener("play", onPlay));
    if (!video.paused) video.pause();
  };

  const scan = () =>
    expando
      .querySelectorAll("video")
      .forEach((v) => guard(v as HTMLVideoElement));

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(expando, { childList: true, subtree: true });

  setTimeout(() => {
    observer.disconnect();
    cleanups.forEach((fn) => fn());
  }, AUTOPLAY_SUPPRESS_WINDOW_MS);
}

function normalizeOldRedditPostMediaChrome(
  thing: HTMLElement,
  hideThumbnails: boolean,
): void {
  if (!hideThumbnails) ensureOldRedditThumbnail(thing);
  ensureOldRedditExpandoButton(thing);
  updateThumbnailPresenceClass(thing);
}

function ensureOldRedditThumbnail(thing: HTMLElement): void {
  if (thing.querySelector(":scope > a.thumbnail")) return;

  const entry = thing.querySelector(":scope > .entry");
  if (!(entry instanceof HTMLElement)) return;

  const preview = thing.querySelector(
    ":scope > .entry .media-preview img.preview, :scope > .entry .media-preview img.censored-preview",
  ) as HTMLImageElement | null;
  const thumbnailSrc = preview?.currentSrc || preview?.src || "";
  if (!thumbnailSrc) return;

  const previewLink = thing.querySelector(
    ":scope > .entry .media-preview a.may-blank, :scope > .entry a.title",
  ) as HTMLAnchorElement | null;
  const href = previewLink?.href || thing.dataset.url || "";
  if (!href) return;

  const thumbnail = document.createElement("a");
  thumbnail.className = "thumbnail may-blank relockr-synthesized-thumbnail";
  thumbnail.href = href;

  const img = document.createElement("img");
  img.src = thumbnailSrc;
  img.alt = "";
  thumbnail.appendChild(img);

  thing.insertBefore(thumbnail, entry);
}

function ensureOldRedditExpandoButton(thing: HTMLElement): void {
  const topMatter = thing.querySelector(":scope > .entry > .top-matter");
  if (!(topMatter instanceof HTMLElement)) return;
  if (topMatter.querySelector(":scope > .expando-button")) return;

  const expando = thing.querySelector(":scope > .entry > .expando");
  if (!(expando instanceof HTMLElement)) return;

  const button = document.createElement("div");
  const isExpanded =
    expando.style.display !== "none" && !expando.hidden && expando.offsetParent;
  const kind =
    expando.querySelector(".media-preview, iframe.media-embed, video") !== null
      ? "video"
      : "selftext";
  button.className = `expando-button ${
    isExpanded ? "expanded" : "collapsed"
  } hide-when-pinned ${kind}`;

  const title = topMatter.querySelector(":scope > .title");
  if (title) {
    title.after(button);
  } else {
    topMatter.prepend(button);
  }
}

function updateThumbnailPresenceClass(thing: HTMLElement): void {
  const hasThumbnail = !!thing.querySelector(":scope > a.thumbnail");
  thing.classList.toggle("relockr-has-thumbnail", hasThumbnail);
  thing.classList.toggle("relockr-no-thumbnail", !hasThumbnail);
}

function isNewRedditHost(hostname: string): boolean {
  return (
    hostname === "www.reddit.com" ||
    hostname === "reddit.com" ||
    hostname === "sh.reddit.com"
  );
}

let newRedditPostObserver: MutationObserver | null = null;

function attachNewRedditPostSwipesToAll(): void {
  document
    .querySelectorAll("article[data-post-id]")
    .forEach((el) => attachNewRedditPostSwipes(el as HTMLElement));
}

export function enableNewRedditPostSwipes(settings: RelockrSettings): void {
  injectStyle(OLD_REDDIT_GESTURE_STYLE_ID, GESTURE_CSS);
  injectStyle(
    NEW_REDDIT_GESTURE_OVERFLOW_STYLE_ID,
    NEW_REDDIT_GESTURE_OVERFLOW_CSS,
  );
  configureNewRedditPostSwipeActions(settings);
  attachNewRedditPostSwipesToAll();

  if (newRedditPostObserver) return;
  newRedditPostObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.("article[data-post-id]")) {
          attachNewRedditPostSwipes(node);
        }
        node
          .querySelectorAll?.("article[data-post-id]")
          .forEach((el) => attachNewRedditPostSwipes(el as HTMLElement));
      }
    }
  });
  newRedditPostObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

let newRedditCommentObserver: MutationObserver | null = null;

function attachNewRedditCommentSwipesToAll(): void {
  document
    .querySelectorAll("shreddit-comment")
    .forEach((el) => attachNewRedditCommentSwipes(el as HTMLElement));
}

export function enableNewRedditCommentSwipes(settings: RelockrSettings): void {
  injectStyle(OLD_REDDIT_GESTURE_STYLE_ID, GESTURE_CSS);
  injectStyle(
    NEW_REDDIT_GESTURE_OVERFLOW_STYLE_ID,
    NEW_REDDIT_GESTURE_OVERFLOW_CSS,
  );
  configureNewRedditCommentSwipeActions(settings);
  attachNewRedditCommentSwipesToAll();

  if (newRedditCommentObserver) return;
  newRedditCommentObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.("shreddit-comment")) {
          attachNewRedditCommentSwipes(node);
        }
        node
          .querySelectorAll?.("shreddit-comment")
          .forEach((el) => attachNewRedditCommentSwipes(el as HTMLElement));
      }
    }
  });
  newRedditCommentObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function hideOldRedditThumbnails() {
  injectStyle(
    "my-old-reddit-hide-thumbnails-css",
    `a.thumbnail { display: none !important; }`,
  );
}

const GREYSCALE_STYLE_ID = "relockr-reddit-media-greyscale";

// Post media only: avatars, community icons and awards stay in colour.
// Filtering a container also covers what it renders in shadow roots (video
// players, galleries), which selectors can't reach.
const GREYSCALE_SELECTORS = [
  // New reddit: card media (images, galleries, videos, link previews) and
  // compact-view thumbnails, in feeds and on the post page.
  'shreddit-post [slot="post-media-container"]',
  'shreddit-post [slot="thumbnail"]',
  'shreddit-post [slot="post-media-carousel-k2"]',
  // New reddit's full-screen image viewer.
  "shreddit-media-lightbox",
  // New reddit thumbnails outside posts, e.g. the "Recent posts" sidebar.
  '[data-testid="post-thumbnail"]',
  // New reddit ads: feed ads (shreddit-ad-post, laid out like posts), the ad
  // on a post's page, and promoted links. Their media sits in a few different
  // slots, so match the media itself; the advertiser's avatar is a rounded
  // icon, which we leave alone like other avatars.
  ':is(shreddit-ad-post, shreddit-comments-page-ad, shreddit-dynamic-ad-link) :is(img, video, shreddit-player, shreddit-player-2):not(.rounded-full img, [avatar] img)',
  // Old reddit: thumbnails (including link previews) and expanded media.
  ".thing.link > a.thumbnail",
  ".thing.link .expando :is(img, video, iframe, .media-preview)",
];

/** Greyscale post images, thumbnails, link previews and videos. */
export function applyRedditMediaGreyscale(settings: RelockrSettings): void {
  setMediaGreyscale(
    GREYSCALE_STYLE_ID,
    settings[SettingsKey.Reddit.GreyscaleMedia] ? GREYSCALE_SELECTORS : [],
  );
}

export function applyAnyActiveRedditSettings(
  relockrSettings: RelockrSettings,
  node: Element,
) {
  const hostname = window.location.hostname;

  // Old Reddit redirect is webext-only. On mobile the guard is false so a stale
  // cached UseOldReddit value can never trigger a JS-side redirect.
  if (
    isWebExtPlatform() &&
    relockrSettings[SettingsKey.Reddit.UseOldReddit]
  ) {
    redirectToOldReddit(hostname);
  }
  if (
    relockrSettings[SettingsKey.Reddit.MakeOldRedditMobileFriendly] &&
    hostname === "old.reddit.com"
  ) {
    makeOldRedditMobileFriendly(relockrSettings);
    const allowed = parseAllowedSubredditList(
      relockrSettings[SettingsKey.Reddit.AllowedCustomCssSubreddits],
    );
    applySubredditStyleException(allowed);
  }

  if (
    relockrSettings[SettingsKey.Reddit.HideOldRedditThumbnails] &&
    hostname === "old.reddit.com"
  ) {
    hideOldRedditThumbnails();
  }

  // State classes drive the case-specific .expando margin overrides above —
  // each ~70px-wide float removed/added on the left needs a matching shift.
  document.documentElement.classList.toggle(
    "relockr-reddit-vote-under-posts",
    !!relockrSettings[SettingsKey.Reddit.MoveVoteCountUnderPosts],
  );
  document.documentElement.classList.toggle(
    "relockr-reddit-thumbs-hidden",
    !!relockrSettings[SettingsKey.Reddit.HideOldRedditThumbnails],
  );
  document.documentElement.classList.toggle(
    "relockr-reddit-expand-media",
    !!relockrSettings[SettingsKey.Reddit.ExpandMediaByDefault],
  );

  if (
    relockrSettings[SettingsKey.Reddit.ColorCodeCommentDepth] &&
    hostname === "old.reddit.com"
  ) {
    injectOldRedditDepthColors();
  }

  applyRedditFeedVisibility(relockrSettings);
  applyRedditMediaGreyscale(relockrSettings);

  if (isNewRedditHost(hostname)) {
    // Hidden setting; also needs the compile-time switches at the top of this
    // file, which are currently off.
    if (
      isHiddenSettingOn(relockrSettings, SettingsKey.Reddit.NeutralizeBlockingGates)
    ) {
      neutralizeNewRedditBlockingGates();
    }
    applyNewRedditFeedStyle(relockrSettings);
  }

  if (
    relockrSettings[SettingsKey.Reddit.EnablePostSwipes] &&
    isNewRedditHost(hostname)
  ) {
    enableNewRedditPostSwipes(relockrSettings);
  }

  if (
    relockrSettings[SettingsKey.Reddit.EnableCommentSwipes] &&
    isNewRedditHost(hostname)
  ) {
    enableNewRedditCommentSwipes(relockrSettings);
  }
}

function redirectToOldReddit(host: string): void {
  if (host === "www.reddit.com" || host === "reddit.com") {
    // New reddit's media viewer (`/media?url=https://i.redd.it/…`) has no old
    // reddit equivalent: old reddit misroutes `/media` into a bogus comments
    // URL. Opening the file directly doesn't work either — browser visits to
    // i.redd.it get bounced back to this viewer, looping. So stay put.
    if (window.location.pathname === "/media") return;
    const newUrl = window.location.href.replace(host, "old.reddit.com");
    window.location.replace(newUrl);
  }
}

export function parseAllowedSubredditList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function currentSubreddit(): string | null {
  const match = window.location.pathname.match(/^\/r\/([^/]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function applySubredditStyleException(allowedSubreddits: string[]): void {
  const sub = currentSubreddit();
  subredditStylesAllowed = sub !== null && allowedSubreddits.includes(sub);
  syncSubredditCustomizations();
  observeSubredditCustomizations();
}

function syncSubredditCustomizations(): void {
  syncSubredditStylesheet();
  syncSubredditHeaderImage();
}

function syncSubredditStylesheet(): void {
  const head = document.head || document.documentElement;
  if (!head) return;

  const linkInDom = head.querySelector(
    OLD_REDDIT_SUBREDDIT_STYLESHEET_SELECTOR,
  );
  const stylesheet = linkInDom instanceof HTMLLinkElement ? linkInDom : null;

  if (subredditStylesAllowed) {
    if (removedSubredditStylesheet && !removedSubredditStylesheet.parentNode) {
      head.appendChild(removedSubredditStylesheet);
    }
    removedSubredditStylesheet = null;
    return;
  }

  if (stylesheet) {
    removedSubredditStylesheet = stylesheet;
    stylesheet.remove();
  }
}

function syncSubredditHeaderImage(): void {
  const wrapperInDom = document.getElementById("header-img-a");
  const wrapper =
    wrapperInDom instanceof HTMLAnchorElement ? wrapperInDom : null;
  const imageInDom = document.getElementById("header-img");
  const image = imageInDom instanceof HTMLElement ? imageInDom : null;

  if (subredditStylesAllowed) {
    if (
      removedSubredditHeaderImage &&
      !removedSubredditHeaderImage.image.parentNode
    ) {
      const { wrapper, image } = removedSubredditHeaderImage;
      wrapper.id = "header-img-a";
      wrapper.classList.remove("default-header");
      wrapper.appendChild(image);
    }
    removedSubredditHeaderImage = null;
    return;
  }

  if (wrapper && image && image.parentNode === wrapper) {
    removedSubredditHeaderImage = { wrapper, image };
    image.remove();
    wrapper.id = "header-img";
    wrapper.classList.add("default-header");
  }
}

function observeSubredditCustomizations(): void {
  if (subredditStyleObserver) return;

  subredditStyleObserver = new MutationObserver(() => {
    if (!subredditStylesAllowed) syncSubredditCustomizations();
  });

  const root = document.documentElement;
  subredditStyleObserver.observe(root, {
    childList: true,
    subtree: true,
  });
}
