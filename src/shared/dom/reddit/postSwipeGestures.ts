// Post-side configuration of the swipe engine. Mirrors commentSwipeGestures
// but with the post's action set (Hide / Share / OpenComments in place of
// Collapse / Reply) and selectors targeting `.thing.link`'s native controls.

import { t } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import { PostSwipeAction } from "@/types/enums";
import { SettingsKey } from "../../settings/settingsKey";
import { SETTINGS_DEFAULTS } from "../../settings/settingsDefaults";
import { clickFirstMatch } from "../utils/clickFirstMatch";
import {
  isSignedInToOldReddit,
  showOldRedditSignInToast,
} from "./oldRedditAuthGuard";
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
  attachSwipeGestures,
  type SwipeActionContext,
  type SwipeProfile,
  type SwipeZone,
} from "./swipeGestures";

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

const POST_DISPATCHERS: Record<
  PostSwipeAction,
  (post: HTMLElement) => void
> = {
  [PostSwipeAction.Upvote]: (p) =>
    clickFirstMatch(p, ":scope > .midcol > [data-event-action='upvote']"),
  [PostSwipeAction.Downvote]: (p) =>
    clickFirstMatch(p, ":scope > .midcol > [data-event-action='downvote']"),
  // Posts use `.link-save-button` (and swap to `.unsave-button` once saved).
  [PostSwipeAction.Save]: (p) =>
    clickFirstMatch(
      p,
      ":scope > .entry .link-save-button > a, :scope > .entry .save-button > a, :scope > .entry .unsave-button > a",
    ),
  // `.hide-button` form has an anchor with reddit's inline change_state() call.
  // After hide, the class swaps to `.unhide-button`.
  [PostSwipeAction.Hide]: (p) =>
    clickFirstMatch(
      p,
      ":scope > .entry .hide-button a, :scope > .entry .unhide-button a",
    ),
  [PostSwipeAction.Share]: (p) =>
    clickFirstMatch(p, ":scope > .entry .post-sharing-button"),
  [PostSwipeAction.OpenComments]: (p) =>
    clickFirstMatch(p, ":scope > .entry a.comments"),
  // `data-url` is reddit's own untouched destination (external URL for link
  // posts, permalink for self posts), so it survives our title retargeting.
  [PostSwipeAction.OpenSource]: (p) => {
    const url = p.dataset.url;
    if (url) window.location.assign(url);
  },
  // Toggle the post's media/selftext expando via its button (native or the one
  // we synthesize in reddit.ts).
  [PostSwipeAction.ExpandPreview]: (p) =>
    clickFirstMatch(p, ":scope > .entry .expando-button"),
};

// Hide/Share/OpenComments work signed-out (Hide is a client-side preference
// reddit happily applies to anon visitors); only vote and save hit endpoints
// that bounce to /login when not authenticated.
const POST_ACTIONS_REQUIRING_SIGN_IN = new Set<PostSwipeAction>([
  PostSwipeAction.Upvote,
  PostSwipeAction.Downvote,
  PostSwipeAction.Save,
]);

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

export function configurePostSwipeActions(settings: RelockrSettings): void {
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

function resolvePostSwipeContext(
  action: PostSwipeAction,
  thing: HTMLElement,
): SwipeActionContext {
  switch (action) {
    case PostSwipeAction.Upvote:
      return isPostUpvoted(thing)
        ? { icon: ICON_UPVOTE_OUTLINE, label: t("domShared_redditActionUnvote") }
        : { icon: ICON_UPVOTE, label: t("domShared_redditActionUpvote") };
    case PostSwipeAction.Downvote:
      return isPostDownvoted(thing)
        ? { icon: ICON_DOWNVOTE_OUTLINE, label: t("domShared_redditActionUnvote") }
        : { icon: ICON_DOWNVOTE, label: t("domShared_redditActionDownvote") };
    case PostSwipeAction.Save:
      return isPostSaved(thing)
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

function isPostUpvoted(thing: HTMLElement): boolean {
  return !!thing.querySelector(":scope > .entry.likes");
}
function isPostDownvoted(thing: HTMLElement): boolean {
  return !!thing.querySelector(":scope > .entry.dislikes");
}
// Same caveat as comments: the LI class doesn't always swap on save toggle,
// so detect via the anchor's "save"/"unsave" text.
function isPostSaved(thing: HTMLElement): boolean {
  const saveLink = thing.querySelector(
    ":scope > .entry .link-save-button > a, :scope > .entry .save-button > a, :scope > .entry .unsave-button > a",
  );
  return saveLink?.textContent?.trim().toLowerCase() === "unsave";
}

function isPostInteractiveTarget(el: Element | null): boolean {
  if (!el) return false;
  if (isInHorizontallyScrollableMarkdown(el)) return true;
  return !!el.closest(".midcol, .arrow, input, textarea, select");
}

function isInHorizontallyScrollableMarkdown(el: Element): boolean {
  let node: HTMLElement | null = el instanceof HTMLElement ? el : null;
  while (node) {
    if (!node.closest(".usertext-body .md")) return false;
    const style = window.getComputedStyle(node);
    const canScrollX =
      /^(auto|scroll)$/.test(style.overflowX) &&
      node.scrollWidth > node.clientWidth + 1;
    if (canScrollX) return true;
    node = node.parentElement;
  }
  return false;
}

const POST_PROFILE: SwipeProfile<PostSwipeAction> = {
  initFlag: "relockrPostGestures",
  // Translate the entire .thing.link row so the thumbnail and vote column
  // travel with the post body, and so pointer events fire from any pixel in
  // the row rather than only inside .entry.
  resolveSwipeElement: (thing) => thing,
  resolveContext: resolvePostSwipeContext,
  dispatch: (action, thing) => {
    if (
      POST_ACTIONS_REQUIRING_SIGN_IN.has(action) &&
      !isSignedInToOldReddit()
    ) {
      showOldRedditSignInToast();
      return;
    }
    POST_DISPATCHERS[action](thing);
  },
  isInteractiveTarget: isPostInteractiveTarget,
  actionTintClass: POST_ACTION_TINT,
  indicatorBgClass: POST_INDICATOR_BG,
  zoneActions: () => postZoneActionMap,
};

export function attachPostSwipes(thing: HTMLElement): void {
  attachSwipeGestures(thing, POST_PROFILE);
}
