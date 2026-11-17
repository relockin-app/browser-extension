// --- Reddit swipe/tap gesture engine -------------------------------------
//
// Generic over the action set so the same gesture-handling, indicator, and
// snap-back machinery serves both comments (.thing.comment) and posts
// (.thing.link). Per-target specifics — which DOM action to dispatch, which
// icon/label/color to render, and whether tapping the tagline does anything —
// live in profiles assembled by the comment / post modules.
//
// Vote/save etc. are dispatched by clicking the native reddit control, so
// toggle semantics (re-upvote to undo, etc.) come for free.

import { RL_FONT_TITLE } from "../../overlayUI/designTokens";
import { createRedditIcon, type RedditIconName } from "./svgIcons";

export const OLD_REDDIT_GESTURE_STYLE_ID = "my-old-reddit-gestures-css";
export const NEW_REDDIT_GESTURE_OVERFLOW_STYLE_ID =
  "my-new-reddit-gestures-overflow-css";

// New-reddit swipes let content spill sideways: comment bodies get their
// `overflow-hidden` relaxed (long URLs poke out) and swiped posts translate
// off-screen. On mobile, any horizontal overflow widens the layout viewport,
// and reddit's `position: fixed; start-0 end-0` mobile header stretches to
// that width with its right-side buttons off-screen. Clip it at the page.
// `clip` (not `hidden`) on BOTH html and body: html alone doesn't stop mobile
// Chrome widening the viewport, and `hidden` on body would make body a scroll
// container (breaking sticky elements and window scroll).
export const NEW_REDDIT_GESTURE_OVERFLOW_CSS = `
  html, body {
    overflow-x: clip;
  }
`;

const SWIPE_LOCK_THRESHOLD_PX = 8;
const HORIZONTAL_LOCK_THRESHOLD_PX = 12;
// Direction lock is a ~45° split: whichever axis dominates wins. Horizontal
// only needs to edge out vertical (ratio 1.0) rather than beat it by 35%, so a
// thumb swipe with the mild downward drift real thumbs produce still reads as
// horizontal instead of being rejected or (worse) started and then cancelled.
// Deliberate scrolls sit well past 45° from horizontal, so they still lock
// vertical and scroll normally. Paired with the touchmove guard below, which
// stops the browser from seizing a horizontal swipe for vertical scroll.
const HORIZONTAL_INTENT_RATIO = 1.0;
const VERTICAL_INTENT_RATIO = 1.0;
const SHORT_ACTIVATION_PX = 15;
const LONG_ACTIVATION_PX = 80;
const MAX_TRANSLATE_PX = 120;
const RUBBER_BAND_RATIO = 0.3;
const TAP_MAX_MOVEMENT_PX = 10;
const TAP_MAX_DURATION_MS = 350;
const TEXT_SELECTION_GUARD_MS = 750;
const SNAP_BACK_MS = 200;
const ZONE_FADE_MS = 220;
// Bar width at which the action label fades in. Below this we just show the
// icon; "Downvote" is the longest label and fits comfortably above this.
const LABEL_VISIBLE_PX = 60;

const SWIPE_TARGET_CLASS = "relockr-swipe-target";
const SWIPE_ENTRY_CLASS = "relockr-swipe-entry";
const SWIPE_INDICATOR_HOST_CLASS = "relockr-swipe-indicator-host";

const activeTouchPointers = new Set<number>();
let activeTouchPointerListenersInstalled = false;

export type SwipeZone =
  | "right-short"
  | "right-long"
  | "left-short"
  | "left-long";

export type SwipeActionContext = { icon: RedditIconName; label: string };

export type SwipeProfile<A extends string> = {
  // Dataset key marking an element as already wired (prevents double-binding).
  initFlag: string;
  // The element that translates during a swipe and hosts pointer listeners.
  // Comments use the inner `.entry` so reply threads (siblings of .entry inside
  // the same .thing) don't slide with the parent. Posts use the whole `.thing`
  // so the thumbnail and vote arrows travel as one row and swipes fire from
  // any pixel in the post, not just the entry column.
  resolveSwipeElement: (thing: HTMLElement) => HTMLElement | null;
  // The element that hosts the action tint and acts as the indicator's
  // insertion anchor. Defaults to old-reddit's `:scope > .entry` child. New
  // reddit profiles point this at e.g. the `<shreddit-post>` card.
  resolveEntry?: (thing: HTMLElement) => HTMLElement | null;
  // Decides whether a pointerdown belongs to this `thing` vs. a nested
  // wrapper with its own handler. Defaults to old-reddit nesting semantics:
  // event target's closest `.thing` ancestor must equal this thing.
  isOwnEvent?: (target: Element, thing: HTMLElement) => boolean;
  // Action → icon + label, computed from the target's current state so the
  // indicator can promise the *result* of the swipe (e.g. "Unvote" when the
  // target is already upvoted).
  resolveContext: (action: A, target: HTMLElement) => SwipeActionContext;
  // Fire the action against the target.
  dispatch: (action: A, target: HTMLElement) => void;
  // Optional tap-on-tagline handler. Comments use it to toggle collapse; posts
  // don't define it.
  onTaglineTap?: (target: HTMLElement) => void;
  // Predicate identifying elements where pointerdown should NOT start tracking
  // (e.g. native vote arrows we don't want to hijack). Comments override this
  // with a broad check because their body is mostly selectable text; posts
  // accept the default narrow check because almost every visible pixel is a
  // link/button and rejecting all of them would block every swipe.
  isInteractiveTarget?: (el: Element | null) => boolean;
  // CSS class for the entry's translucent action tint.
  actionTintClass: Record<A, string>;
  // CSS class for the indicator's solid background color.
  indicatorBgClass: Record<A, string>;
  // Latest zone → action mapping. Read fresh on each pointermove so settings
  // changes mid-session are picked up without re-attaching listeners.
  zoneActions: () => Record<SwipeZone, A>;
  // Where to mount the indicator. Defaults to `thing`. New-reddit comments
  // need this because `<shreddit-comment>` is itself the swipe element AND
  // a shadow host — an unslotted child wouldn't render. They return the
  // comment's parentElement so the indicator becomes a sibling of the
  // comment in the parent's slot.
  resolveIndicatorHost?: (thing: HTMLElement) => HTMLElement | null;
  // Optional hook to mutate the indicator before it's inserted. New-reddit
  // comments use this to copy the `slot` attribute from the comment to the
  // indicator so nested comments' indicators get slotted into the right
  // parent slot.
  prepareIndicator?: (thing: HTMLElement, indicator: HTMLElement) => void;
};

const defaultIsOwnEvent = (target: Element, thing: HTMLElement): boolean =>
  target.closest?.(".thing") === thing;

const defaultResolveEntry = (thing: HTMLElement): HTMLElement | null => {
  const entry = thing.querySelector(":scope > .entry");
  return entry instanceof HTMLElement ? entry : null;
};

export function attachSwipeGestures<A extends string>(
  thing: HTMLElement,
  profile: SwipeProfile<A>,
): void {
  installActiveTouchPointerListeners();
  if (thing.dataset[profile.initFlag]) return;
  thing.dataset[profile.initFlag] = "1";
  thing.classList.add(SWIPE_TARGET_CLASS);

  const swipeElement = profile.resolveSwipeElement(thing);
  if (!(swipeElement instanceof HTMLElement)) return;
  // Entry hosts the translucent action tint and anchors the indicator. It can
  // be the same element as `thing` (e.g. new reddit, where `<article>` wraps a
  // single `<shreddit-post>` card we treat as both container and entry's
  // visual surface — but only when entry is a distinct child of thing, which
  // it always is when the engine is configured correctly).
  const entry = (profile.resolveEntry ?? defaultResolveEntry)(thing);
  if (!(entry instanceof HTMLElement)) return;
  entry.classList.add(SWIPE_ENTRY_CLASS);
  const isOwnEvent = profile.isOwnEvent ?? defaultIsOwnEvent;

  // Action indicator sits behind the swipe element, sized to fill exactly the
  // gap revealed by the translation. Default: insert as a child of `thing`
  // (before entry). Profiles can override via `resolveIndicatorHost`, or
  // return null to skip the indicator entirely (new-reddit comments do this
  // because shreddit-comment is itself a shadow host and any insertion site
  // we tried — slot-copy, parent slot — risked breaking shreddit's
  // ::slotted styling on the surrounding comment subtree).
  const indicator = document.createElement("div");
  indicator.className = "relockr-swipe-indicator";
  indicator.setAttribute("aria-hidden", "true");
  profile.prepareIndicator?.(thing, indicator);
  const indicatorHost: HTMLElement | null = profile.resolveIndicatorHost
    ? profile.resolveIndicatorHost(thing)
    : thing;
  if (indicatorHost) {
    if (indicatorHost === thing) {
      // Guard against the edge case where entry === thing (engine would
      // crash trying to insertBefore self) by prepending instead.
      if (entry === thing) {
        indicatorHost.insertBefore(indicator, indicatorHost.firstChild);
      } else {
        indicatorHost.insertBefore(indicator, entry);
      }
    } else {
      // External host: ensure it establishes a positioning context so the
      // indicator's absolute coordinates align with swipeElement.offsetLeft
      // /Top. If `thing` is a direct child of host, insert before it so DOM
      // order matches z-order (indicator paints first, thing paints over).
      // Otherwise prepend so DOM-order stacking still works.
      indicatorHost.classList.add(SWIPE_INDICATOR_HOST_CLASS);
      if (thing.parentNode === indicatorHost) {
        indicatorHost.insertBefore(indicator, thing);
      } else {
        indicatorHost.insertBefore(indicator, indicatorHost.firstChild);
      }
    }
  }

  // Counter-translate when the swipe element contains the indicator —
  // otherwise translating swipeElement would drag the indicator with it.
  // False when the indicator was skipped (host null) or mounted externally.
  const indicatorCountersSwipe = swipeElement.contains(indicator);

  const allActionClasses = Object.values(profile.actionTintClass) as string[];
  const allIndicatorClasses = Object.values(
    profile.indicatorBgClass,
  ) as string[];

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let locked: "h" | "v" | null = null;
  let currentAction: A | null = null;
  let downOnTagline = false;
  // Swipe-element bounds captured at gesture start. We measure once (avoids
  // forced layouts on every move) and use these to anchor the indicator to
  // the moving row's original position.
  let swipeLeft = 0;
  let swipeWidth = 0;
  // Suppress the synthetic click that the browser fires after our pointerup.
  // Without this, the click bubbles to reddit's body-click-collapse handler
  // (or fuzzy-targets a neighboring expand link) and undoes our toggle.
  let suppressNextClick = false;

  thing.addEventListener(
    "click",
    (e) => {
      if (!suppressNextClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressNextClick = false;
    },
    true,
  );

  const setActiveAction = (action: A | null) => {
    if (action === currentAction) return;
    for (const cls of allActionClasses) entry.classList.remove(cls);
    for (const cls of allIndicatorClasses) indicator.classList.remove(cls);
    indicator.classList.remove("relockr-swipe-indicator-visible");
    if (action) {
      const ctx = profile.resolveContext(action, thing);
      entry.classList.add(profile.actionTintClass[action]);
      indicator.classList.add(profile.indicatorBgClass[action]);
      indicator.classList.add("relockr-swipe-indicator-visible");
      indicator.replaceChildren(
        createRedditIcon(ctx.icon),
        makeIndicatorLabel(ctx.label),
      );
    }
    currentAction = action;
  };

  const snapBack = () => {
    swipeElement.classList.add("relockr-swipe-snap");
    entry.classList.add("relockr-swipe-snap");
    indicator.classList.add("relockr-swipe-snap");
    swipeElement.style.transform = "";
    indicator.style.transform = "";
    indicator.style.width = "0px";
    indicator.classList.remove("relockr-swipe-indicator-wide");
    window.setTimeout(() => {
      swipeElement.classList.remove("relockr-swipe-snap");
      entry.classList.remove("relockr-swipe-snap");
      indicator.classList.remove("relockr-swipe-snap");
      setActiveAction(null);
    }, SNAP_BACK_MS);
  };

  const resetWithoutAction = () => {
    pointerId = null;
    locked = null;
    swipeElement.style.transform = "";
    indicator.style.transform = "";
    indicator.style.width = "0px";
    indicator.classList.remove("relockr-swipe-indicator-wide");
    setActiveAction(null);
  };

  const isInteractive = profile.isInteractiveTarget ?? defaultInteractiveTarget;

  swipeElement.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    if (pointerId !== null) {
      if (activeTouchPointers.size > 1) resetWithoutAction();
      return;
    }
    if (activeTouchPointers.size > 1) return;
    // Skip events that belong to a nested thing (e.g. a reply comment inside
    // a parent comment's .child subtree) — its own listener will handle them.
    const target = e.target as Element;
    if (!isOwnEvent(target, thing)) return;
    if (isInteractive(target)) return;
    if (hasActiveTextSelection()) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTime = performance.now();
    locked = null;
    downOnTagline = !!target.closest?.(".tagline");
    suppressNextClick = false;
    swipeElement.classList.remove("relockr-swipe-snap");
    entry.classList.remove("relockr-swipe-snap");
    indicator.classList.remove("relockr-swipe-snap");
    // Cache the swipe element's bounds once per gesture so pointermove can
    // position the indicator without forcing layout on each frame. For comments
    // this picks up the entry's offset within .thing; for posts (where the
    // whole .thing slides) it captures 0 / thing.clientWidth.
    if (indicatorCountersSwipe) {
      swipeLeft = 0;
      swipeWidth = swipeElement.clientWidth;
      indicator.style.top = "0px";
      indicator.style.height = `${swipeElement.clientHeight}px`;
    } else {
      swipeLeft = swipeElement.offsetLeft;
      swipeWidth = swipeElement.offsetWidth;
      indicator.style.top = `${swipeElement.offsetTop}px`;
      indicator.style.height = `${swipeElement.offsetHeight}px`;
    }
  });

  swipeElement.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    if (activeTouchPointers.size > 1 || hasActiveTextSelection()) {
      resetWithoutAction();
      return;
    }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (locked === null) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < SWIPE_LOCK_THRESHOLD_PX && absY < SWIPE_LOCK_THRESHOLD_PX)
        return;
      if (performance.now() - startTime > TEXT_SELECTION_GUARD_MS) {
        resetWithoutAction();
        return;
      }
      if (absY >= absX * VERTICAL_INTENT_RATIO) {
        locked = "v";
        return;
      }
      if (
        absX < HORIZONTAL_LOCK_THRESHOLD_PX ||
        absX < absY * HORIZONTAL_INTENT_RATIO
      ) {
        return;
      }
      locked = "h";
      try {
        swipeElement.setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture can throw if pointer already released - safe to ignore
      }
    }
    if (locked === "h") {
      const clamped = rubberBandClamp(dx);
      swipeElement.style.transform = `translateX(${clamped}px)`;
      // When the swipe element contains the indicator, the indicator inherits
      // the translation. Counter-transform pins it to the row's original spot
      // so it stays parked over the revealed gap instead of sliding with the
      // row.
      if (indicatorCountersSwipe) {
        indicator.style.transform = `translateX(${-clamped}px)`;
      }
      const zone = zoneForDx(dx);
      const zoneActions = profile.zoneActions();
      setActiveAction(zone ? zoneActions[zone] : null);
      const width = Math.abs(clamped);
      // Indicator fills the gap revealed alongside the swipe element. For
      // right swipes it grows from the row's left edge rightward; for left
      // swipes it shrinks from the row's right edge leftward.
      if (dx >= 0) {
        indicator.style.left = `${swipeLeft}px`;
      } else {
        indicator.style.left = `${swipeLeft + swipeWidth - width}px`;
      }
      indicator.style.right = "";
      indicator.style.width = `${width}px`;
      indicator.classList.toggle(
        "relockr-swipe-indicator-wide",
        width >= LABEL_VISIBLE_PX,
      );
    }
  });

  // Keep the browser from stealing a horizontal swipe for vertical scroll.
  // `touch-action: pan-y` reserves vertical panning, so on a diagonal (left/
  // right with the downward drift a thumb naturally adds) the browser's own
  // angle heuristic can decide mid-gesture that this is a scroll — it seizes
  // the pointer, fires pointercancel, and our finish() snaps the row back even
  // though a horizontal swipe was clearly underway. Calling preventDefault on
  // an early touchmove cancels scrolling for the rest of the gesture, so once
  // the movement reads as horizontal we own it end-to-end. touchmove fires
  // before pointermove, so we mirror the pointermove lock predicate here (using
  // the live `locked` state once set) to preempt the browser on the very first
  // horizontal frame. Vertical-dominant gestures fall through untouched and
  // scroll normally, preserving the up/down guard.
  swipeElement.addEventListener(
    "touchmove",
    (e) => {
      if (pointerId === null || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const horizontalIntent =
        absX >= HORIZONTAL_LOCK_THRESHOLD_PX &&
        absX >= absY * HORIZONTAL_INTENT_RATIO;
      if ((locked === "h" || (locked === null && horizontalIntent)) && e.cancelable) {
        e.preventDefault();
      }
    },
    { passive: false },
  );

  const finish = (e: PointerEvent, canceled: boolean) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const duration = performance.now() - startTime;
    const wasLocked = locked;
    pointerId = null;
    locked = null;
    if (wasLocked === "h") {
      const zone = canceled ? null : zoneForDx(dx);
      if (zone) {
        const zoneActions = profile.zoneActions();
        profile.dispatch(zoneActions[zone], thing);
        suppressNextClick = true;
      }
      snapBack();
      return;
    }
    if (
      !canceled &&
      wasLocked === null &&
      downOnTagline &&
      profile.onTaglineTap &&
      Math.abs(dx) < TAP_MAX_MOVEMENT_PX &&
      Math.abs(dy) < TAP_MAX_MOVEMENT_PX &&
      duration < TAP_MAX_DURATION_MS
    ) {
      profile.onTaglineTap(thing);
      suppressNextClick = true;
    }
  };

  swipeElement.addEventListener("pointerup", (e) => finish(e, false));
  swipeElement.addEventListener("pointercancel", (e) => finish(e, true));
}

function installActiveTouchPointerListeners(): void {
  if (activeTouchPointerListenersInstalled) return;
  activeTouchPointerListenersInstalled = true;

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") activeTouchPointers.add(e.pointerId);
    },
    true,
  );

  const forgetTouchPointer = (e: PointerEvent) => {
    if (e.pointerType === "touch") activeTouchPointers.delete(e.pointerId);
  };
  document.addEventListener("pointerup", forgetTouchPointer, true);
  document.addEventListener("pointercancel", forgetTouchPointer, true);
  window.addEventListener("blur", () => activeTouchPointers.clear());
}

function hasActiveTextSelection(): boolean {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed;
}

function makeIndicatorLabel(label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "relockr-swipe-indicator-label";
  el.textContent = label;
  return el;
}

function rubberBandClamp(dx: number): number {
  const abs = Math.abs(dx);
  if (abs <= MAX_TRANSLATE_PX) return dx;
  return (
    Math.sign(dx) *
    (MAX_TRANSLATE_PX + (abs - MAX_TRANSLATE_PX) * RUBBER_BAND_RATIO)
  );
}

function zoneForDx(dx: number): SwipeZone | null {
  const abs = Math.abs(dx);
  if (abs < SHORT_ACTIVATION_PX) return null;
  const long = abs >= LONG_ACTIVATION_PX;
  if (dx > 0) return long ? "right-long" : "right-short";
  return long ? "left-long" : "left-short";
}

// Narrow default: only reject swipes that start on native vote arrows or form
// inputs. Profiles can supply a broader check (e.g. comments protect link/text
// taps inside the body) by setting `isInteractiveTarget`.
function defaultInteractiveTarget(el: Element | null): boolean {
  if (!el) return false;
  return !!el.closest(".midcol, .arrow, input, textarea, select");
}

// CSS covers both comment and post swipe action sets in a single sheet, keyed
// by the action class names that profiles plug into the gesture engine.
export const GESTURE_CSS = `
  .${SWIPE_TARGET_CLASS} {
    position: relative;
    touch-action: pan-y pinch-zoom;
    will-change: transform;
  }
  .${SWIPE_ENTRY_CLASS} {
    touch-action: pan-y pinch-zoom;
    will-change: transform;
    transition: background-color 120ms ease;
    position: relative;
    z-index: 1;
  }
  /* External indicator host (e.g. parent of a shreddit-comment) needs a
     positioning context so the indicator's absolute coordinates align with
     swipeElement.offsetLeft/Top. */
  .${SWIPE_INDICATOR_HOST_CLASS} {
    position: relative;
  }
  /* Snap-back: both the container (post swipes) and entry (comment swipes)
     may pick up the snap class on release — apply the transform transition
     to whichever element is the swipe target, and extend the entry's bg-color
     transition so the action tint fades out cleanly. */
  .${SWIPE_TARGET_CLASS}.relockr-swipe-snap,
  .${SWIPE_ENTRY_CLASS}.relockr-swipe-snap {
    transition: transform ${SNAP_BACK_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1),
                background-color ${ZONE_FADE_MS}ms ease;
  }
  .relockr-swipe-action-upvote {
    background-color: rgba(255, 139, 96, 0.45) !important;
  }
  .relockr-swipe-action-downvote {
    background-color: rgba(148, 148, 255, 0.45) !important;
  }
  .relockr-swipe-action-save {
    background-color: rgba(255, 200, 80, 0.45) !important;
  }
  .relockr-swipe-action-collapse {
    background-color: rgba(220, 80, 80, 0.45) !important;
  }
  .relockr-swipe-action-reply {
    background-color: rgba(96, 200, 130, 0.45) !important;
  }
  .relockr-swipe-action-hide {
    background-color: rgba(160, 160, 160, 0.45) !important;
  }
  .relockr-swipe-action-share {
    background-color: rgba(96, 165, 230, 0.45) !important;
  }
  .relockr-swipe-action-opencomments {
    background-color: rgba(120, 200, 220, 0.45) !important;
  }
  .relockr-swipe-action-opensource {
    background-color: rgba(126, 87, 194, 0.45) !important;
  }
  .relockr-swipe-action-expandpreview {
    background-color: rgba(70, 160, 110, 0.45) !important;
  }
  .relockr-swipe-indicator {
    position: absolute;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    overflow: hidden;
    opacity: 0;
    width: 0;
    box-sizing: border-box;
    z-index: 0;
    color: #fff;
    transition: opacity 80ms ease, background-color 120ms ease;
  }
  .relockr-swipe-indicator.relockr-swipe-indicator-visible {
    opacity: 1;
  }
  .relockr-swipe-indicator.relockr-swipe-snap {
    transition: width ${SNAP_BACK_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1),
                transform ${SNAP_BACK_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1),
                opacity ${ZONE_FADE_MS}ms ease,
                background-color 120ms ease;
  }
  .relockr-swipe-indicator svg {
    width: 28px;
    height: 28px;
    fill: currentColor;
    flex-shrink: 0;
  }
  .relockr-swipe-indicator-label {
    font-family: ${RL_FONT_TITLE};
    font-size: 12px;
    line-height: 1.1;
    margin-top: 3px;
    white-space: nowrap;
    font-weight: 400;
    letter-spacing: 0.2px;
    opacity: 0;
    transition: opacity 80ms ease;
  }
  .relockr-swipe-indicator.relockr-swipe-indicator-wide .relockr-swipe-indicator-label {
    opacity: 1;
  }
  .relockr-swipe-indicator-upvote { background-color: #ec672a; }
  .relockr-swipe-indicator-downvote { background-color: #4747b8; }
  .relockr-swipe-indicator-save { background-color: #b07d00; }
  .relockr-swipe-indicator-collapse { background-color: #a02020; }
  .relockr-swipe-indicator-reply { background-color: #1f6e3e; }
  .relockr-swipe-indicator-hide { background-color: #5a5a5a; }
  .relockr-swipe-indicator-share { background-color: #2563a8; }
  .relockr-swipe-indicator-opencomments { background-color: #2a8a9c; }
  .relockr-swipe-indicator-opensource { background-color: #7e57c2; }
  .relockr-swipe-indicator-expandpreview { background-color: #2e8b57; }
`;
