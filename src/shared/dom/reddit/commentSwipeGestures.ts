// Comment-side configuration of the swipe engine: action set, state-aware
// icon/label resolver, native-control dispatchers, and tap-to-toggle on the
// tagline.

import { t } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import { SwipeGestureAction } from "@/types/enums";
import { SettingsKey } from "../../settings/settingsKey";
import { SETTINGS_DEFAULTS } from "../../settings/settingsDefaults";
import { clickFirstMatch } from "../utils/clickFirstMatch";
import {
  isSignedInToOldReddit,
  showOldRedditSignInToast,
} from "./oldRedditAuthGuard";
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

const COMMENT_DISPATCHERS: Record<
  SwipeGestureAction,
  (comment: HTMLElement) => void
> = {
  [SwipeGestureAction.Upvote]: (c) =>
    clickFirstMatch(c, ":scope > .midcol > [data-event-action='upvote']"),
  [SwipeGestureAction.Downvote]: (c) =>
    clickFirstMatch(c, ":scope > .midcol > [data-event-action='downvote']"),
  [SwipeGestureAction.Save]: (c) =>
    clickFirstMatch(
      c,
      ":scope > .entry .save-button > a, :scope > .entry .unsave-button > a",
    ),
  [SwipeGestureAction.Reply]: (c) =>
    clickFirstMatch(c, ":scope > .entry .reply-button > a"),
  [SwipeGestureAction.Collapse]: toggleCollapse,
};

// Collapse is purely client-side; everything else hits reddit's authenticated
// endpoints and would bounce the user to /login if dispatched while signed out.
const COMMENT_ACTIONS_REQUIRING_SIGN_IN = new Set<SwipeGestureAction>([
  SwipeGestureAction.Upvote,
  SwipeGestureAction.Downvote,
  SwipeGestureAction.Save,
  SwipeGestureAction.Reply,
]);

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

export function configureCommentSwipeActions(settings: RelockrSettings): void {
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

// For toggleable actions the icon + label flip based on the comment's current
// state, so the indicator promises the *result* of the swipe rather than just
// the action name. Upvoting an already-upvoted comment clears the vote, etc.
function resolveCommentSwipeContext(
  action: SwipeGestureAction,
  thing: HTMLElement,
): SwipeActionContext {
  switch (action) {
    case SwipeGestureAction.Upvote:
      return isCommentUpvoted(thing)
        ? { icon: ICON_UPVOTE_OUTLINE, label: t("domShared_redditActionUnvote") }
        : { icon: ICON_UPVOTE, label: t("domShared_redditActionUpvote") };
    case SwipeGestureAction.Downvote:
      return isCommentDownvoted(thing)
        ? { icon: ICON_DOWNVOTE_OUTLINE, label: t("domShared_redditActionUnvote") }
        : { icon: ICON_DOWNVOTE, label: t("domShared_redditActionDownvote") };
    case SwipeGestureAction.Save:
      return isCommentSaved(thing)
        ? { icon: ICON_SAVE_OUTLINE, label: t("domShared_redditActionUnsave") }
        : { icon: ICON_SAVE, label: t("domShared_redditActionSave") };
    case SwipeGestureAction.Collapse:
      return isCommentCollapsed(thing)
        ? { icon: ICON_EXPAND, label: t("domShared_redditActionExpand") }
        : { icon: ICON_COLLAPSE, label: t("domShared_redditActionCollapse") };
    case SwipeGestureAction.Reply:
      return { icon: ICON_REPLY, label: t("domShared_redditActionReply") };
  }
}

function isCommentUpvoted(thing: HTMLElement): boolean {
  return !!thing.querySelector(":scope > .entry.likes");
}
function isCommentDownvoted(thing: HTMLElement): boolean {
  return !!thing.querySelector(":scope > .entry.dislikes");
}
// Reddit doesn't reliably swap the save/unsave LI class on every save toggle,
// but it does always swap the anchor text. Detecting via text mirrors what
// commentActionBar's more-menu does.
function isCommentSaved(thing: HTMLElement): boolean {
  const saveLink = thing.querySelector(
    ":scope > .entry .comment-save-button > a, :scope > .entry .save-button > a, :scope > .entry .unsave-button > a",
  );
  return saveLink?.textContent?.trim().toLowerCase() === "unsave";
}
function isCommentCollapsed(thing: HTMLElement): boolean {
  return thing.classList.contains("collapsed");
}

// Mirror reddit's togglecomment: flip the collapsed/noncollapsed classes and
// the [–]/[+] indicator. We can't just click the .expand anchor because its
// href is `javascript:void(0)` and programmatic .click() triggers a navigation
// attempt that gets blocked by CSP.
function toggleCollapse(comment: HTMLElement): void {
  const willBeCollapsed = !comment.classList.contains("collapsed");
  comment.classList.toggle("collapsed");
  comment.classList.toggle("noncollapsed");
  const expand = comment.querySelector(":scope > .entry .tagline > .expand");
  if (expand instanceof HTMLElement) {
    expand.textContent = willBeCollapsed ? "[+]" : "[–]";
  }
}

// Comments protect link / button / expand-toggle taps inside the body so
// users can still select text and click inline links without triggering a
// swipe. Posts can't afford this — almost every pixel of the post row is a
// link — so they fall back to the engine's narrower default.
function isCommentInteractiveTarget(el: Element | null): boolean {
  if (!el) return false;
  return !!el.closest(
    "a, button, input, textarea, select, .midcol, .arrow, .expand, [role='button']",
  );
}

const COMMENT_PROFILE: SwipeProfile<SwipeGestureAction> = {
  initFlag: "relockrGestures",
  // Translate only the .entry so reply threads sitting inside the same .thing
  // (under .child) stay put while the parent comment slides.
  resolveSwipeElement: (thing) => {
    const entry = thing.querySelector(":scope > .entry");
    return entry instanceof HTMLElement ? entry : null;
  },
  resolveContext: resolveCommentSwipeContext,
  dispatch: (action, thing) => {
    if (
      COMMENT_ACTIONS_REQUIRING_SIGN_IN.has(action) &&
      !isSignedInToOldReddit()
    ) {
      showOldRedditSignInToast();
      return;
    }
    COMMENT_DISPATCHERS[action](thing);
  },
  onTaglineTap: toggleCollapse,
  isInteractiveTarget: isCommentInteractiveTarget,
  actionTintClass: COMMENT_ACTION_TINT,
  indicatorBgClass: COMMENT_INDICATOR_BG,
  zoneActions: () => commentZoneActionMap,
};

export function attachCommentSwipes(thing: HTMLElement): void {
  attachSwipeGestures(thing, COMMENT_PROFILE);
}
