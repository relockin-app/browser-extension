// New-reddit (shreddit) comment swipe profile. Mirrors commentSwipeGestures.ts
// but targets `<shreddit-comment>` custom elements and dispatches via the
// comment action row + overflow bottom-sheet instead of old reddit's
// `.midcol` / `.entry .save-button` selectors.
//
// Swipe element: only the `<div slot="comment">` body translates. Earlier
// attempts translated the whole `<shreddit-comment>`, which dragged every
// nested reply along visually AND — when we slot-copied the indicator into
// the parent comment's `children-*` slot to make it render — broke
// shreddit's ::slotted styling on the reply tree, squishing/hiding subtrees.
// Swiping just the body sidesteps both problems: the body is a normal div,
// its translation is self-contained, and replies stay put.
//
// Indicator placement: prepended INSIDE the body div. Coordinates then match
// because the indicator and body div share a positioning context (the body
// div itself, position: relative via SWIPE_ENTRY_CLASS), and the engine's
// `indicatorCountersSwipe` branch counter-translates the indicator so it
// stays anchored to the body div's original position while the body slides
// over. The body div's Tailwind `overflow-hidden` would clip the indicator
// once it counter-translates outside the body's box, so we relax it to
// `visible` at attach time. Tradeoff: long URLs in comment text can now
// overflow horizontally — acceptable for swipe to work correctly.
//
// Slotting the indicator into the `comment` slot alongside the body div
// (tried earlier) doesn't work: the indicator's containing block ends up
// in shreddit's shadow-DOM slot container, while body div.offsetLeft/Top
// are measured against shreddit-comment (light DOM, via our
// SWIPE_TARGET_CLASS). The two coord systems are offset by the slot
// container's position in shadow DOM, so the same numbers landed in the
// wrong spot (below-and-right of the body).

import { t } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import { SwipeGestureAction } from "@/types/enums";
import { SettingsKey } from "../../settings/settingsKey";
import { SETTINGS_DEFAULTS } from "../../settings/settingsDefaults";
import {
  activate,
  deepQuerySelector,
  DOWNVOTE_ICONS,
  findButtonByIcon,
  findFirstMatch,
  OVERFLOW_ICONS,
  UPVOTE_ICONS,
} from "./newRedditDomUtils";
import {
  ICON_COLLAPSE,
  ICON_DOWNVOTE,
  ICON_DOWNVOTE_OUTLINE,
  ICON_EXPAND,
  ICON_REPLY,
  ICON_SAVE,
  ICON_SAVE_OUTLINE,
  ICON_UPVOTE,
  ICON_UPVOTE_OUTLINE,
} from "./svgIcons";
import {
  attachSwipeGestures,
  type SwipeActionContext,
  type SwipeProfile,
  type SwipeZone,
} from "./swipeGestures";

const COMMENT_ACTION_TINT: Record<SwipeGestureAction, string> = {
  [SwipeGestureAction.Upvote]: "relockr-swipe-action-upvote",
  [SwipeGestureAction.Downvote]: "relockr-swipe-action-downvote",
  [SwipeGestureAction.Save]: "relockr-swipe-action-save",
  [SwipeGestureAction.Collapse]: "relockr-swipe-action-collapse",
  [SwipeGestureAction.Reply]: "relockr-swipe-action-reply",
};

const COMMENT_INDICATOR_BG: Record<SwipeGestureAction, string> = {
  [SwipeGestureAction.Upvote]: "relockr-swipe-indicator-upvote",
  [SwipeGestureAction.Downvote]: "relockr-swipe-indicator-downvote",
  [SwipeGestureAction.Save]: "relockr-swipe-indicator-save",
  [SwipeGestureAction.Collapse]: "relockr-swipe-indicator-collapse",
  [SwipeGestureAction.Reply]: "relockr-swipe-indicator-reply",
};

const DEFAULT_COMMENT_ZONE_ACTIONS: Record<SwipeZone, SwipeGestureAction> = {
  "right-short": SwipeGestureAction.Upvote,
  "right-long": SwipeGestureAction.Downvote,
  "left-short": SwipeGestureAction.Save,
  "left-long": SwipeGestureAction.Collapse,
};

let commentZoneActionMap: Record<SwipeZone, SwipeGestureAction> = {
  ...DEFAULT_COMMENT_ZONE_ACTIONS,
};

// Vote / reply / overflow controls. Vote buttons live in the shadow root of
// `<shreddit-comment-action-row>`; reply is a light-DOM faceplate-tracker
// button; overflow trigger is in `<shreddit-overflow-menu source="comment">`.
// Selector lists go first then icon-name fallback — anchor on icon-name
// because aria-labels rot across redesigns.
const UPVOTE_FALLBACK_SELECTORS = [
  "shreddit-comment-action-row button[upvote]",
  "button[upvote]",
  'faceplate-tracker[noun="upvote"] button',
  'button[name="vote"][value="1"]',
] as const;
const DOWNVOTE_FALLBACK_SELECTORS = [
  "shreddit-comment-action-row button[downvote]",
  "button[downvote]",
  'faceplate-tracker[noun="downvote"] button',
  'button[name="vote"][value="-1"]',
] as const;
const REPLY_FALLBACK_SELECTORS = [
  'faceplate-tracker[noun="reply_comment"] button',
  'shreddit-comment-action-row button[data-action-id="cmt-reply-r9x"]',
  "shreddit-comment-action-row button[reply]",
] as const;
const OVERFLOW_FALLBACK_SELECTORS = [
  'shreddit-overflow-menu[source="comment"] button',
  'shreddit-overflow-menu button[aria-haspopup="true"]',
  'button[aria-label*="comment actions" i]',
  'button[aria-label*="more options" i]',
] as const;
const REPLY_ICONS = ["comment", "reply", "reply-new"] as const;

function findUpvoteButton(comment: HTMLElement): HTMLElement | null {
  return (
    findFirstMatch(comment, UPVOTE_FALLBACK_SELECTORS) ??
    findButtonByIcon(comment, UPVOTE_ICONS)
  );
}
function findDownvoteButton(comment: HTMLElement): HTMLElement | null {
  return (
    findFirstMatch(comment, DOWNVOTE_FALLBACK_SELECTORS) ??
    findButtonByIcon(comment, DOWNVOTE_ICONS)
  );
}
function findReplyButton(comment: HTMLElement): HTMLElement | null {
  return (
    findFirstMatch(comment, REPLY_FALLBACK_SELECTORS) ??
    findButtonByIcon(comment, REPLY_ICONS)
  );
}
function findOverflowTrigger(comment: HTMLElement): HTMLElement | null {
  return (
    findFirstMatch(comment, OVERFLOW_FALLBACK_SELECTORS) ??
    findButtonByIcon(comment, OVERFLOW_ICONS)
  );
}

// Save lives behind the overflow menu's bottom-sheet. The path is:
//   shreddit-comment.lightDOM > shreddit-comment-action-row.lightDOM >
//   shreddit-overflow-menu.shadowDOM > faceplate-bottom-sheet.lightDOM >
//   faceplate-menu.lightDOM > <li class="save-comment-menu-button"
//   role="menuitem"> > <div tabindex="-1">
// Each shadow root in the chain is open, and deepQuerySelector recurses
// through them. The LI carries `role="menuitem"` and the state-named class;
// the inner div has tabindex and `cursor-pointer` — it's the actual click
// target shreddit listens on (see the activation sequence below).
//
// Polling: generous 500ms initial delay so the bottom-sheet's open
// animation completes and shreddit's handler wiring settles. The retry loop
// (up to ~2.5s budget) covers slower loads.
const OVERFLOW_INITIAL_DELAY_MS = 500;
const OVERFLOW_RETRY_DELAY_MS = 100;
const OVERFLOW_MAX_TRIES = 20;

// Delay between the focus/LI-click setup and the inner-div click that
// actually triggers save. Empirically: focus + immediate click did NOT
// work; a ~200ms gap is required. Best guess: focus state needs to settle
// (Lit re-render tick, or shreddit promoting the menuitem to "active")
// before its click handler will fire.
const SAVE_CLICK_GAP_MS = 200;

function triggerOverflowAction(
  comment: HTMLElement,
  itemSelectors: readonly string[],
): void {
  // Scope the menu lookup to THIS comment's overflow shadow root so the
  // first matching menuitem in DOM order isn't mistaken for the sheet of
  // some other comment whose bottom-sheet is mounted but inert.
  const overflowMenu = comment.querySelector("shreddit-overflow-menu");
  const trigger = findOverflowTrigger(comment);
  if (!trigger) return;
  // Overflow trigger is a real <button>; .click() reliably opens the sheet
  // and avoids the double-fire risk of activate() if a tracker also listens
  // on pointerdown.
  trigger.click();

  const selector = itemSelectors.join(", ");
  let tries = 0;
  const attempt = () => {
    const root = overflowMenu?.shadowRoot ?? document;
    const item = (deepQuerySelector(root, selector) ??
      (root !== document ? deepQuerySelector(document, selector) : null)) as
      | HTMLElement
      | null;
    if (item) {
      // Diagnosed activation sequence — all three steps load-bearing. A
      // simpler "focus + immediate click on inner div" was tried first and
      // did NOT fire save; the working recipe came out of a click-trace
      // experiment (instrumented at LI / div / shadowRoot / document):
      //
      //   1. focus the inner focusable div — shreddit's menu appears to
      //      gate handler eligibility on focused-item state.
      //   2. .click() on the LI — synchronously this dispatches no
      //      observable click event (none of the four trace listeners
      //      fired), but removing it broke save dispatch in testing. Best
      //      guess: it nudges shreddit's component into a state the
      //      subsequent inner-div click can land on.
      //   3. After SAVE_CLICK_GAP_MS, .click() on the inner div — this is
      //      the call that dispatched a click event (visible in all four
      //      trace listeners with target=DIV, propagating up through LI →
      //      shadowRoot → document) AND triggered shreddit's save handler.
      //
      // Pointer events (activate()) can't substitute here: faceplate-
      // bottom-sheet's pointerdown listener dismisses the menu before any
      // click can complete.
      const focusable = item.querySelector("[tabindex]") as HTMLElement | null;
      focusable?.focus?.();
      item.click();
      setTimeout(() => focusable?.click?.(), SAVE_CLICK_GAP_MS);
      return;
    }
    if (tries++ < OVERFLOW_MAX_TRIES) {
      setTimeout(attempt, OVERFLOW_RETRY_DELAY_MS);
    }
  };
  setTimeout(attempt, OVERFLOW_INITIAL_DELAY_MS);
}

// The save menu LI. shreddit keeps the class as `save-comment-menu-button`
// regardless of saved/unsaved state (no `unsave-` variant), so a single
// selector covers both directions of the toggle.
const SAVE_COMMENT_MENU_SELECTORS = [
  "li.save-comment-menu-button",
] as const;

const COMMENT_DISPATCHERS: Record<
  SwipeGestureAction,
  (comment: HTMLElement) => void
> = {
  [SwipeGestureAction.Upvote]: (c) => {
    const btn = findUpvoteButton(c);
    if (btn) activate(btn);
  },
  [SwipeGestureAction.Downvote]: (c) => {
    const btn = findDownvoteButton(c);
    if (btn) activate(btn);
  },
  [SwipeGestureAction.Save]: (c) => {
    triggerOverflowAction(c, SAVE_COMMENT_MENU_SELECTORS);
    // Optimistic: shreddit doesn't reflect comment-save state in light DOM,
    // so we flip our in-memory tracker on dispatch. If the overflow miss-
    // fires (menu didn't load), the indicator will be one toggle out of
    // sync until the next real save event syncs it back.
    recordSaveIntent(c);
  },
  [SwipeGestureAction.Reply]: (c) => {
    const btn = findReplyButton(c);
    if (btn) activate(btn);
  },
  [SwipeGestureAction.Collapse]: toggleCollapse,
};

const VALID_COMMENT_ACTIONS = new Set<string>(Object.values(SwipeGestureAction));

function resolveCommentSwipeAction(
  settings: RelockrSettings,
  key: string,
  zone: SwipeZone,
): SwipeGestureAction {
  const val = settings[key] ?? SETTINGS_DEFAULTS[key];
  if (typeof val === "string" && VALID_COMMENT_ACTIONS.has(val)) {
    return val as SwipeGestureAction;
  }
  return DEFAULT_COMMENT_ZONE_ACTIONS[zone];
}

export function configureNewRedditCommentSwipeActions(
  settings: RelockrSettings,
): void {
  commentZoneActionMap = {
    "right-short": resolveCommentSwipeAction(
      settings,
      SettingsKey.Reddit.SwipeShortRight,
      "right-short",
    ),
    "right-long": resolveCommentSwipeAction(
      settings,
      SettingsKey.Reddit.SwipeLongRight,
      "right-long",
    ),
    "left-short": resolveCommentSwipeAction(
      settings,
      SettingsKey.Reddit.SwipeShortLeft,
      "left-short",
    ),
    "left-long": resolveCommentSwipeAction(
      settings,
      SettingsKey.Reddit.SwipeLongLeft,
      "left-long",
    ),
  };
}

// --- State detection ------------------------------------------------------
//
// Vote: `<shreddit-comment-action-row vote-state="UP|DOWN|NONE">` exposes
// the current state directly in light DOM and shreddit keeps it in sync on
// every vote, including external sources (mobile app, our dispatch). No
// in-memory tracker needed — unlike the post profile, which has to track
// vote intent because shreddit-post hides vote state behind shadow DOM.
//
// Save: not exposed in light DOM anywhere we can see (the overflow menu
// host has no `is-comment-saved` analog to the post case's
// `is-post-saved`). Tracker is keyed on `thingid`; initial state for a
// pre-saved comment we never dispatched against is unknown — first swipe
// shows the "save" label, then stays consistent.
//
// Collapse: `<shreddit-comment>` reflects its own collapsed state via the
// `collapsed` boolean attribute on the host. Toggling the attribute drives
// the visual collapse via shreddit's Lit reactivity.

type TrackedSave = "saved" | "unsaved";
const trackedSaves = new Map<string, TrackedSave>();

function commentId(comment: HTMLElement): string | null {
  return comment.getAttribute("thingid");
}

function recordSaveIntent(comment: HTMLElement): void {
  const id = commentId(comment);
  if (!id) return;
  trackedSaves.set(id, trackedSaves.get(id) === "saved" ? "unsaved" : "saved");
}

function getVoteState(comment: HTMLElement): "UP" | "DOWN" | "NONE" {
  const row = comment.querySelector("shreddit-comment-action-row");
  const state = row?.getAttribute("vote-state");
  if (state === "UP" || state === "DOWN") return state;
  return "NONE";
}

function isCommentUpvoted(comment: HTMLElement): boolean {
  return getVoteState(comment) === "UP";
}
function isCommentDownvoted(comment: HTMLElement): boolean {
  return getVoteState(comment) === "DOWN";
}
function isCommentSaved(comment: HTMLElement): boolean {
  const id = commentId(comment);
  return !!id && trackedSaves.get(id) === "saved";
}
// Newer reddit renders each comment inside a native `<details>` and collapses
// by closing it. Older builds reflected a `collapsed` boolean on the host.
function getCommentDetails(comment: HTMLElement): HTMLDetailsElement | null {
  const details = comment.querySelector(":scope > details");
  return details instanceof HTMLDetailsElement ? details : null;
}

function isCommentCollapsed(comment: HTMLElement): boolean {
  if (comment.hasAttribute("collapsed")) return true;
  const details = getCommentDetails(comment);
  return !!details && !details.open;
}

// Shreddit's collapse trigger lives in shreddit-comment's shadow DOM (the
// threadline / chevron). Aria-labels are the most stable hook across
// redesigns ("Collapse comment thread", "Expand comment thread", etc.).
const COLLAPSE_FALLBACK_SELECTORS = [
  'button[aria-label*="ollapse" i]',
  'button[aria-label*="xpand" i]',
  '[role="button"][aria-label*="ollapse" i]',
  '[role="button"][aria-label*="xpand" i]',
] as const;

function findCollapseButton(comment: HTMLElement): HTMLElement | null {
  return findFirstMatch(comment, COLLAPSE_FALLBACK_SELECTORS);
}

function toggleCollapse(comment: HTMLElement): void {
  // Prefer clicking shreddit's own collapse UI so any logic it attaches
  // (state, focus, analytics) runs normally. Older shadow-DOM builds expose a
  // chevron/threadline button with an aria-label.
  const btn = findCollapseButton(comment);
  if (btn) {
    activate(btn);
    return;
  }
  // Newer reddit collapses via a native `<details>`/`<summary>`. A plain
  // `.click()` on the summary toggles the disclosure exactly like a user tap
  // (and lets any shreddit summary listeners run once). We deliberately don't
  // use activate() here — its extra pointer events could make shreddit toggle
  // a second time and cancel out the native toggle.
  const details = getCommentDetails(comment);
  const summary = details?.querySelector(":scope > summary");
  if (summary instanceof HTMLElement) {
    summary.click();
    return;
  }
  // Last resort: flip the native open state, then the legacy attribute.
  if (details) {
    details.open = !details.open;
    return;
  }
  comment.toggleAttribute("collapsed");
}

function resolveCommentSwipeContext(
  action: SwipeGestureAction,
  comment: HTMLElement,
): SwipeActionContext {
  switch (action) {
    case SwipeGestureAction.Upvote:
      return isCommentUpvoted(comment)
        ? { icon: ICON_UPVOTE_OUTLINE, label: t("domShared_redditActionUnvote") }
        : { icon: ICON_UPVOTE, label: t("domShared_redditActionUpvote") };
    case SwipeGestureAction.Downvote:
      return isCommentDownvoted(comment)
        ? { icon: ICON_DOWNVOTE_OUTLINE, label: t("domShared_redditActionUnvote") }
        : { icon: ICON_DOWNVOTE, label: t("domShared_redditActionDownvote") };
    case SwipeGestureAction.Save:
      return isCommentSaved(comment)
        ? { icon: ICON_SAVE_OUTLINE, label: t("domShared_redditActionUnsave") }
        : { icon: ICON_SAVE, label: t("domShared_redditActionSave") };
    case SwipeGestureAction.Collapse:
      return isCommentCollapsed(comment)
        ? { icon: ICON_EXPAND, label: t("domShared_redditActionExpand") }
        : { icon: ICON_COLLAPSE, label: t("domShared_redditActionCollapse") };
    case SwipeGestureAction.Reply:
      return { icon: ICON_REPLY, label: t("domShared_redditActionReply") };
  }
}

// Reject buttons / overflow / vote bar / share dropdown so native taps still
// work. Links inside the body (author, time, permalink, inline markdown links)
// are also protected — unlike posts, where the whole row is one big
// `<a slot="full-post-link">` we can't afford to reject.
function isNewRedditCommentInteractive(el: Element | null): boolean {
  if (!el) return false;
  return !!el.closest(
    "a, button, input, textarea, select, [role='button']," +
      " shreddit-comment-action-row, shreddit-overflow-menu," +
      " shreddit-comment-share-button, faceplate-dropdown-menu",
  );
}

// The comment's own body: `<div slot="comment" id="{thingid}-comment-rtjson-
// content">`. Newer (details-based) reddit nests it a few levels inside the
// comment's `<details>`; older builds slotted it as a direct child. So match
// at any depth — but scope to THIS comment: a reply's body lives inside its
// own nested `<shreddit-comment>`, so keep only the body whose nearest
// shreddit-comment ancestor is us (querySelectorAll is document order, so our
// own body is the first hit regardless).
function resolveCommentBody(comment: HTMLElement): HTMLElement | null {
  const bodies = comment.querySelectorAll("[slot='comment']");
  for (const body of bodies) {
    if (
      body instanceof HTMLElement &&
      body.closest("shreddit-comment") === comment
    ) {
      return body;
    }
  }
  return null;
}

// Relax body div's Tailwind `overflow-hidden` so the counter-translated
// indicator isn't clipped when it paints outside the body's box. Idempotent
// — setting style.overflow repeatedly is fine.
function relaxBodyOverflow(body: HTMLElement): void {
  body.style.overflow = "visible";
}

const NEW_REDDIT_COMMENT_PROFILE: SwipeProfile<SwipeGestureAction> = {
  initFlag: "relockrNewCommentGestures",
  // Translate only the body. Avatar / meta / actionRow / nested replies are
  // separate slotted children and stay put. Listeners attach to the body
  // div, so swipes only initiate from a touch on the comment text — clearer
  // affordance than swiping anywhere on the comment row.
  resolveSwipeElement: resolveCommentBody,
  resolveEntry: resolveCommentBody,
  // Host the indicator inside the body div so it shares the body's
  // positioning context. Engine's external-host branch prepends it. Side
  // effect: we relax body div's overflow to visible so the indicator can
  // paint in the gap revealed by the swipe.
  resolveIndicatorHost: (comment) => {
    const body = resolveCommentBody(comment);
    if (body) relaxBodyOverflow(body);
    return body;
  },
  // Belt-and-braces: nested comments' bodies are inside their own
  // shreddit-comment, NOT inside the parent's body div, so pointerdown on a
  // reply doesn't even bubble to the parent's listener. This check just
  // formalizes that — closest("shreddit-comment") matches the deepest
  // ancestor, which equals `thing` only for the right comment.
  isOwnEvent: (target, comment) =>
    target.closest?.("shreddit-comment") === comment,
  resolveContext: resolveCommentSwipeContext,
  dispatch: (action, comment) => COMMENT_DISPATCHERS[action](comment),
  // Engine's tagline-tap detection is hardcoded to `.tagline` (old reddit).
  // New reddit's commentMeta slot has no equivalent class, and the body div
  // isn't where users tap-to-collapse anyway, so we skip the shortcut.
  isInteractiveTarget: isNewRedditCommentInteractive,
  actionTintClass: COMMENT_ACTION_TINT,
  indicatorBgClass: COMMENT_INDICATOR_BG,
  zoneActions: () => commentZoneActionMap,
};

export function attachNewRedditCommentSwipes(comment: HTMLElement): void {
  attachSwipeGestures(comment, NEW_REDDIT_COMMENT_PROFILE);
}
