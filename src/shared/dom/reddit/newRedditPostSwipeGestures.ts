// New-reddit (shreddit) post swipe profile. Mirrors postSwipeGestures.ts but
// targets `<article data-post-id>` wrappers and their inner `<shreddit-post>`
// card, dispatching via new-reddit's action-bar controls instead of old
// reddit's `.midcol` / `.entry .save-button` etc.
//
// Selector caveat: new reddit's action bar loads asynchronously and Reddit
// has churned through several button-naming conventions for it. The
// dispatchers below try several known patterns and stop at the first match;
// if any action consistently no-ops in practice, adjust the matching
// selector array rather than the engine.

import { t } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import { PostSwipeAction } from "@/types/enums";
import { SettingsKey } from "../../settings/settingsKey";
import { SETTINGS_DEFAULTS } from "../../settings/settingsDefaults";
import {
  ICON_DOWNVOTE,
  ICON_DOWNVOTE_OUTLINE,
  ICON_EXPAND,
  ICON_EXTERNAL_LINK,
  ICON_HIDE,
  ICON_OPEN_COMMENTS,
  ICON_SAVE,
  ICON_SAVE_OUTLINE,
  ICON_SHARE,
  ICON_UPVOTE,
  ICON_UPVOTE_OUTLINE,
} from "./svgIcons";
import {
  activate,
  deepQuerySelector,
  DOWNVOTE_ICONS,
  findButtonByIcon,
  findFirstMatch,
  OVERFLOW_ICONS,
  SHARE_ICONS,
  UPVOTE_ICONS,
} from "./newRedditDomUtils";
import {
  attachSwipeGestures,
  type SwipeActionContext,
  type SwipeProfile,
  type SwipeZone,
} from "./swipeGestures";
import { toggleNewRedditPostMedia } from "./newRedditFeedStyle";

const POST_ACTION_TINT: Record<PostSwipeAction, string> = {
  [PostSwipeAction.Upvote]: "relockr-swipe-action-upvote",
  [PostSwipeAction.Downvote]: "relockr-swipe-action-downvote",
  [PostSwipeAction.Save]: "relockr-swipe-action-save",
  [PostSwipeAction.Hide]: "relockr-swipe-action-hide",
  [PostSwipeAction.Share]: "relockr-swipe-action-share",
  [PostSwipeAction.OpenComments]: "relockr-swipe-action-opencomments",
  [PostSwipeAction.OpenSource]: "relockr-swipe-action-opensource",
  [PostSwipeAction.ExpandPreview]: "relockr-swipe-action-expandpreview",
};

const POST_INDICATOR_BG: Record<PostSwipeAction, string> = {
  [PostSwipeAction.Upvote]: "relockr-swipe-indicator-upvote",
  [PostSwipeAction.Downvote]: "relockr-swipe-indicator-downvote",
  [PostSwipeAction.Save]: "relockr-swipe-indicator-save",
  [PostSwipeAction.Hide]: "relockr-swipe-indicator-hide",
  [PostSwipeAction.Share]: "relockr-swipe-indicator-share",
  [PostSwipeAction.OpenComments]: "relockr-swipe-indicator-opencomments",
  [PostSwipeAction.OpenSource]: "relockr-swipe-indicator-opensource",
  [PostSwipeAction.ExpandPreview]: "relockr-swipe-indicator-expandpreview",
};

const DEFAULT_POST_ZONE_ACTIONS: Record<SwipeZone, PostSwipeAction> = {
  "right-short": PostSwipeAction.Upvote,
  "right-long": PostSwipeAction.Downvote,
  "left-short": PostSwipeAction.Save,
  "left-long": PostSwipeAction.ExpandPreview,
};

let postZoneActionMap: Record<SwipeZone, PostSwipeAction> = {
  ...DEFAULT_POST_ZONE_ACTIONS,
};

const UPVOTE_FALLBACK_SELECTORS = [
  "shreddit-post-vote-buttons button[upvote]",
  "button[upvote]",
  'faceplate-tracker[noun="upvote"] button',
  'button[name="vote"][value="1"]',
] as const;
const DOWNVOTE_FALLBACK_SELECTORS = [
  "shreddit-post-vote-buttons button[downvote]",
  "button[downvote]",
  'faceplate-tracker[noun="downvote"] button',
  'button[name="vote"][value="-1"]',
] as const;
const SHARE_FALLBACK_SELECTORS = [
  'faceplate-tracker[noun="share"] button',
  'shreddit-async-loader[bundlename*="share" i] button',
] as const;
const OVERFLOW_FALLBACK_SELECTORS = [
  "shreddit-post-overflow-menu button",
  'button[aria-label*="post actions" i]',
] as const;

function findUpvoteButton(article: HTMLElement): HTMLElement | null {
  return (
    findFirstMatch(article, UPVOTE_FALLBACK_SELECTORS) ??
    findButtonByIcon(article, UPVOTE_ICONS)
  );
}
function findDownvoteButton(article: HTMLElement): HTMLElement | null {
  return (
    findFirstMatch(article, DOWNVOTE_FALLBACK_SELECTORS) ??
    findButtonByIcon(article, DOWNVOTE_ICONS)
  );
}
function findShareButton(article: HTMLElement): HTMLElement | null {
  return (
    findFirstMatch(article, SHARE_FALLBACK_SELECTORS) ??
    findButtonByIcon(article, SHARE_ICONS)
  );
}
function findOverflowTrigger(article: HTMLElement): HTMLElement | null {
  return (
    findFirstMatch(article, OVERFLOW_FALLBACK_SELECTORS) ??
    findButtonByIcon(article, OVERFLOW_ICONS)
  );
}

function openComments(article: HTMLElement): void {
  // Tap-to-open: new reddit overlays the post with `<a slot="full-post-link">`
  // pointing at the same permalink. Clicking it preserves any tracking
  // handlers reddit attached, which a raw `location.href = ...` would skip.
  const fullPostLink = article.querySelector(
    "a[slot='full-post-link']",
  ) as HTMLAnchorElement | null;
  if (fullPostLink) {
    fullPostLink.click();
    return;
  }
  const post = article.querySelector("shreddit-post");
  const permalink = post?.getAttribute("permalink");
  if (permalink) window.location.href = permalink;
}

// Save / Hide live inside the post's `<shreddit-post-overflow-menu>`. The
// menu opens as a `<faceplate-bottom-sheet>` rendered into the overflow
// menu's shadow root. Each item is shaped:
//   <li id="post-overflow-{save|unsave|hide|unhide}" role="presentation">
//     <div role="menuitem" tabindex="0" class="…cursor-pointer…">…</div>
//   </li>
// shreddit flips the LI's id between save/unsave (and hide/unhide) based on
// state, so we pass both candidates and select whichever appears.
//
// Activation sequence mirrors the comment overflow profile — the same
// recipe is needed here for the same reason. Earlier this dispatcher used a
// single activate() on the inner `[role="menuitem"]` div; that opened the
// menu but never fired save/hide (the bottom-sheet was dismissing on our
// pointerdown before the click could complete). Diagnosed with click-trace
// instrumentation on the comment menu; same fix applies here.
//
// Generous 500ms initial delay so the bottom-sheet's open animation
// completes and handler wiring settles before we dispatch. Retry loop
// (~2.5s budget) covers slower loads.
const OVERFLOW_INITIAL_DELAY_MS = 500;
const OVERFLOW_RETRY_DELAY_MS = 100;
const OVERFLOW_MAX_TRIES = 20;

// Delay between the focus/LI-click setup and the inner-div click that
// actually triggers the action. Empirically: focus + immediate click did
// NOT work for the comment menu (which is the same shape); a ~200ms gap
// was required. Same here.
const POST_OVERFLOW_CLICK_GAP_MS = 200;

function triggerOverflowAction(
  article: HTMLElement,
  itemIds: readonly string[],
): void {
  // Each post in the feed renders its own `<shreddit-post-overflow-menu>`
  // with its own bottom-sheet inside its own shadow root. A document-wide
  // deep search returns the first matching `<li>` in DOM order, which is
  // the inactive sheet of the topmost post — clicking it does nothing.
  // Scope the menu lookup to THIS article's overflow menu shadow root so
  // we always hit the bottom-sheet that the trigger we just clicked owns.
  const overflowMenu = article.querySelector("shreddit-post-overflow-menu");
  const trigger = findOverflowTrigger(article);
  if (!trigger) return;
  // Overflow trigger is a real `<button>` — `.click()` reliably opens the
  // bottom-sheet. Using activate() here would risk double-firing if the
  // tracker also listens on pointerdown.
  trigger.click();
  // Pass multiple candidate IDs so the same dispatcher works regardless of
  // the post's current state — shreddit flips the `<li>` id between
  // `post-overflow-save` / `post-overflow-unsave` (and the same for
  // hide/unhide) when the post's saved/hidden state changes. We target the
  // LI itself (not the inner div) because the working comment recipe
  // dispatches click on both, in a specific order.
  const selector = itemIds.map((id) => `li#${id}`).join(", ");
  let tries = 0;
  const attempt = () => {
    // Bottom-sheet menu items live inside the overflow custom element's
    // shadow root. Prefer this post's own shadow root; fall back to a
    // document-wide search only if the scoped lookup misses (shouldn't
    // happen, but covers unexpected DOM rearrangement).
    const root = overflowMenu?.shadowRoot ?? document;
    const item = (deepQuerySelector(root, selector) ??
      (root !== document ? deepQuerySelector(document, selector) : null)) as
      | HTMLElement
      | null;
    if (item) {
      // See newRedditCommentSwipeGestures.ts for the full diagnostic
      // story. All three steps are load-bearing:
      //   1. focus the inner focusable `[role="menuitem"]` div — shreddit
      //      gates handler eligibility on focused-item state.
      //   2. .click() on the LI — synchronously dispatches no observable
      //      click event, but is required for the next step to take effect.
      //   3. After POST_OVERFLOW_CLICK_GAP_MS, .click() on the inner div —
      //      THIS is the call that actually fires save/hide.
      // Pointer events (activate()) can't substitute: faceplate-bottom-
      // sheet's pointerdown listener dismisses the menu before any click
      // can complete.
      const focusable = item.querySelector(
        '[role="menuitem"]',
      ) as HTMLElement | null;
      focusable?.focus?.();
      item.click();
      setTimeout(() => focusable?.click?.(), POST_OVERFLOW_CLICK_GAP_MS);
      return;
    }
    if (tries++ < OVERFLOW_MAX_TRIES)
      setTimeout(attempt, OVERFLOW_RETRY_DELAY_MS);
  };
  setTimeout(attempt, OVERFLOW_INITIAL_DELAY_MS);
}

const POST_DISPATCHERS: Record<
  PostSwipeAction,
  (article: HTMLElement) => void
> = {
  [PostSwipeAction.Upvote]: (a) => {
    const btn = findUpvoteButton(a);
    if (!btn) return;
    activate(btn);
    // Record after the click succeeds so a missing-button case doesn't
    // pollute the tracker.
    recordVoteIntent(a, "up");
  },
  [PostSwipeAction.Downvote]: (a) => {
    const btn = findDownvoteButton(a);
    if (!btn) return;
    activate(btn);
    recordVoteIntent(a, "down");
  },
  [PostSwipeAction.Save]: (a) =>
    triggerOverflowAction(a, ["post-overflow-save", "post-overflow-unsave"]),
  [PostSwipeAction.Hide]: (a) =>
    triggerOverflowAction(a, ["post-overflow-hide", "post-overflow-unhide"]),
  [PostSwipeAction.Share]: (a) => {
    const btn = findShareButton(a);
    if (btn) activate(btn);
  },
  [PostSwipeAction.OpenComments]: openComments,
  // shreddit-post exposes the post's external destination as `content-href`
  // (absent / equal to the permalink for self posts).
  [PostSwipeAction.OpenSource]: (a) => {
    const url = a.querySelector("shreddit-post")?.getAttribute("content-href");
    if (url) window.location.assign(url);
  },
  // Toggle this post's media shown/hidden, whatever the feed style.
  [PostSwipeAction.ExpandPreview]: (a) => {
    const post = a.querySelector("shreddit-post");
    if (post instanceof HTMLElement) toggleNewRedditPostMedia(post);
  },
};

const VALID_POST_ACTIONS = new Set<string>(Object.values(PostSwipeAction));

function resolvePostSwipeAction(
  settings: RelockrSettings,
  key: string,
  zone: SwipeZone,
): PostSwipeAction {
  const val = settings[key] ?? SETTINGS_DEFAULTS[key];
  if (typeof val === "string" && VALID_POST_ACTIONS.has(val)) {
    return val as PostSwipeAction;
  }
  return DEFAULT_POST_ZONE_ACTIONS[zone];
}

export function configureNewRedditPostSwipeActions(
  settings: RelockrSettings,
): void {
  postZoneActionMap = {
    "right-short": resolvePostSwipeAction(
      settings,
      SettingsKey.Reddit.PostSwipeShortRight,
      "right-short",
    ),
    "right-long": resolvePostSwipeAction(
      settings,
      SettingsKey.Reddit.PostSwipeLongRight,
      "right-long",
    ),
    "left-short": resolvePostSwipeAction(
      settings,
      SettingsKey.Reddit.PostSwipeShortLeft,
      "left-short",
    ),
    "left-long": resolvePostSwipeAction(
      settings,
      SettingsKey.Reddit.PostSwipeLongLeft,
      "left-long",
    ),
  };
}

// --- State detection ------------------------------------------------------
//
// Save: `<shreddit-post-overflow-menu>` carries `is-post-saved=""` as a
// boolean attribute when the post is saved. This is in light DOM and
// shreddit updates it reactively when the user saves/unsaves through any
// path (overflow click, our dispatch, mobile app sync), so it stays in sync.
//
// Vote: shreddit doesn't expose vote state in light DOM at all — no
// `is-upvoted`, `vote-direction`, etc. on `<shreddit-post>` or its children.
// The signal lives inside the vote button in shadow DOM. We try
// `aria-pressed="true"` first (works if shreddit's Lit component sets it),
// then fall back to an in-memory map keyed on `data-post-id` that tracks
// votes the user dispatched in this session. Initial state for an already-
// voted post we never saw is unknown — we treat that as "not voted", which
// degrades the indicator label for the first swipe but stays consistent
// afterward.
//
// Earlier attempt: `svg[icon-name="upvote-fill"]` presence. That false-
// positived on every post (shadow DOM appears to render both `-outline`
// and `-fill` variants always, with CSS toggling visibility), so every
// indicator showed "un-vote". Removed.

type TrackedVote = "up" | "down" | "none";
const trackedVotes = new Map<string, TrackedVote>();

function postId(article: HTMLElement): string | null {
  return article.getAttribute("data-post-id");
}

function getTrackedVote(article: HTMLElement): TrackedVote {
  const id = postId(article);
  return (id && trackedVotes.get(id)) || "none";
}

// Apply the toggle semantics shreddit uses: voting the same direction again
// clears it; voting the opposite direction flips it.
function recordVoteIntent(
  article: HTMLElement,
  intent: "up" | "down",
): void {
  const id = postId(article);
  if (!id) return;
  trackedVotes.set(id, trackedVotes.get(id) === intent ? "none" : intent);
}

function isPostUpvoted(article: HTMLElement): boolean {
  const btn = findUpvoteButton(article);
  if (btn?.getAttribute("aria-pressed") === "true") return true;
  return getTrackedVote(article) === "up";
}
function isPostDownvoted(article: HTMLElement): boolean {
  const btn = findDownvoteButton(article);
  if (btn?.getAttribute("aria-pressed") === "true") return true;
  return getTrackedVote(article) === "down";
}
function isPostSaved(article: HTMLElement): boolean {
  const overflow = article.querySelector("shreddit-post-overflow-menu");
  return !!overflow?.hasAttribute("is-post-saved");
}

function resolvePostSwipeContext(
  action: PostSwipeAction,
  article: HTMLElement,
): SwipeActionContext {
  switch (action) {
    case PostSwipeAction.Upvote:
      return isPostUpvoted(article)
        ? { icon: ICON_UPVOTE_OUTLINE, label: t("domShared_redditActionUnvote") }
        : { icon: ICON_UPVOTE, label: t("domShared_redditActionUpvote") };
    case PostSwipeAction.Downvote:
      return isPostDownvoted(article)
        ? { icon: ICON_DOWNVOTE_OUTLINE, label: t("domShared_redditActionUnvote") }
        : { icon: ICON_DOWNVOTE, label: t("domShared_redditActionDownvote") };
    case PostSwipeAction.Save:
      return isPostSaved(article)
        ? { icon: ICON_SAVE_OUTLINE, label: t("domShared_redditActionUnsave") }
        : { icon: ICON_SAVE, label: t("domShared_redditActionSave") };
    case PostSwipeAction.Hide:
      return { icon: ICON_HIDE, label: t("domShared_redditActionHide") };
    case PostSwipeAction.Share:
      return { icon: ICON_SHARE, label: t("domShared_redditActionShare") };
    case PostSwipeAction.OpenComments:
      return { icon: ICON_OPEN_COMMENTS, label: t("domShared_redditActionComments") };
    case PostSwipeAction.OpenSource:
      return { icon: ICON_EXTERNAL_LINK, label: t("domShared_redditActionSource") };
    case PostSwipeAction.ExpandPreview:
      return { icon: ICON_EXPAND, label: t("domShared_redditActionPreview") };
  }
}

// Reject buttons / form controls so native vote / save / share / overflow
// clicks still work. Anchors are NOT rejected because shreddit overlays the
// whole post with `<a slot="full-post-link">` for tap-to-open; rejecting it
// would block swipes from almost every pixel of the card.
function isNewRedditPostInteractive(el: Element | null): boolean {
  if (!el) return false;
  return !!el.closest("button, input, textarea, select, [role='button']");
}

// Article wrapper hosts the indicator; shreddit-post is the visible card we
// translate and tint. Resolved together so a missing shreddit-post short-
// circuits attach cleanly.
function resolveShredditPost(article: HTMLElement): HTMLElement | null {
  const post = article.querySelector("shreddit-post");
  return post instanceof HTMLElement ? post : null;
}

const NEW_REDDIT_POST_PROFILE: SwipeProfile<PostSwipeAction> = {
  initFlag: "relockrNewPostGestures",
  resolveSwipeElement: resolveShredditPost,
  resolveEntry: resolveShredditPost,
  isOwnEvent: (target, article) =>
    target.closest?.("article[data-post-id]") === article,
  resolveContext: resolvePostSwipeContext,
  dispatch: (action, article) => POST_DISPATCHERS[action](article),
  isInteractiveTarget: isNewRedditPostInteractive,
  actionTintClass: POST_ACTION_TINT,
  indicatorBgClass: POST_INDICATOR_BG,
  zoneActions: () => postZoneActionMap,
};

export function attachNewRedditPostSwipes(article: HTMLElement): void {
  attachSwipeGestures(article, NEW_REDDIT_POST_PROFILE);
}
