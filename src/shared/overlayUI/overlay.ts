import type { RuleSessionStatus } from "~/types/messages";
import { RL_CARD_BG, RL_CARD_BORDER, RL_FONT_BODY } from "./designTokens";
import { applyUiLanguage } from "./utils/domHelpers";
import {
  createVideoControls,
  isVideoControlsPage,
} from "./showYouTubeControls";
import { rlog } from "../rlog";
import { showBlockedScreen } from "./screens/blockedScreen";
import { createAppUpsell } from "./components/appUpsell";
import { makeCardHeader } from "./components/cardParts";
import {
  getActiveRestrictions,
  type BlockFlow,
  type RestrictionKind,
} from "./restrictions";
import { isChallengeModalOpen } from "~/shared/challenges/ui/ChallengeModal";

export const SESSION_OVERLAY_ID = "relockr-session-overlay";

export type OnStartSession = (
  ruleId: string,
  durationSeconds: number,
  override?: boolean,
  scheduleOverride?: boolean,
) => void;

/**
 * Lifts the quick-return pause after the user passes its challenge. Resolves
 * once the background has recorded the bypass.
 */
export type OnClearQuickReturnBlock = () => Promise<void>;

/**
 * Shows the session-picker overlay for a rule that needs an active session.
 *
 * Safe to call on every status check: an existing overlay is left alone
 * (so the user's place in the flow isn't lost) unless the restrictions it was
 * built for no longer match — e.g. the tab sat on a schedule block overnight
 * and the window has since ended — in which case it is rebuilt.
 */
export function showSessionOverlay(
  status: RuleSessionStatus,
  onStartSession: OnStartSession,
  onClearQuickReturnBlock: OnClearQuickReturnBlock,
): void {
  const active = getActiveRestrictions(status);
  const existing = document.getElementById(SESSION_OVERLAY_ID);
  if (existing) {
    if (!overlayIsStale(existing, status.ruleId, active)) {
      existing.dataset.restrictions = active.join(",");
      return;
    }
    // Don't yank a challenge out from under the user; the next status check
    // will rebuild once they've finished or cancelled it.
    if (isChallengeModalOpen()) return;
    existing.remove();
  }

  const overlay = document.createElement("div");
  overlay.id = SESSION_OVERLAY_ID;
  overlay.dataset.ruleId = status.ruleId;
  overlay.dataset.restrictions = active.join(",");
  applyUiLanguage(overlay);
  Object.assign(overlay.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100vw",
    height: "100vh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    padding: "16px",
    overflowY: "auto",
    zIndex: "2147483648",
    fontFamily: RL_FONT_BODY,
  });
  applyBackdrop(overlay);

  // Every screen renders into `container`; the card around it and its header
  // stay put as the user moves between screens.
  overlay.appendChild(makePageTitle(overlay));

  const card = document.createElement("div");
  Object.assign(card.style, CARD_STYLE);
  overlay.appendChild(card);

  const domain = new URL(document.URL).hostname.replace("www.", "");
  card.appendChild(makeCardHeader(status.ruleName, domain));

  const container = document.createElement("div");
  Object.assign(container.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "18px",
  });
  card.appendChild(container);

  // Every restriction currently blocking a start is handled as one gate: the
  // block screen fronts the first of them and the override behind it clears
  // the whole set. Defusing them one at a time would leave the ones the
  // screen doesn't know about silently refusing the session.
  const flow: BlockFlow = {
    status,
    active,
    onStartSession,
    onClearQuickReturnBlock,
  };

  // Falls through to the initial "Start a session" screen when nothing is
  // blocking.
  showBlockedScreen(container, flow);
  finalizeOverlay(overlay, card);
}

const CARD_STYLE: Partial<CSSStyleDeclaration> = {
  display: "flex",
  flexDirection: "column",
  gap: "18px",
  width: "440px",
  maxWidth: "100%",
  flexShrink: "0",
  boxSizing: "border-box",
  padding: "28px 32px 24px",
  borderRadius: "24px",
  background: RL_CARD_BG,
  border: `1px solid ${RL_CARD_BORDER}`,
  boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
  textAlign: "start",
};

const PAGE_TITLE_ID = "relockr-overlay-page-title";

/**
 * The blocked page's own title (the video, the post…) in subdued text above
 * the card, since the card header only names the domain. Follows title
 * changes, as SPAs like YouTube and Reddit retitle the tab after the overlay
 * is already up. Hidden when the page has no title worth showing.
 */
function makePageTitle(overlay: HTMLElement): HTMLDivElement {
  const el = document.createElement("div");
  el.id = PAGE_TITLE_ID;
  Object.assign(el.style, {
    width: "440px",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "0 8px",
    flexShrink: "0",
    fontFamily: RL_FONT_BODY,
    fontSize: "13px",
    lineHeight: "1.4",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  const update = () => {
    const title = cleanPageTitle(document.title);
    el.textContent = title;
    el.title = title;
    el.style.visibility = title ? "visible" : "hidden";
  };
  update();

  let mounted = false;
  const observer = new MutationObserver(() => {
    if (!overlay.isConnected) {
      // Not mounted yet, or removed for good (a new overlay is built rather
      // than this one being re-mounted).
      if (mounted) observer.disconnect();
      return;
    }
    mounted = true;
    if (el.textContent !== cleanPageTitle(document.title)) update();
  });
  observer.observe(document.head ?? document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return el;
}

/** Drops the unread-count prefix sites like YouTube add, e.g. "(3) ". */
function cleanPageTitle(raw: string): string {
  const title = raw.replace(/^\(\d+\+?\)\s*/, "").trim();
  const host = location.hostname.replace(/^www\./, "");
  return title === host || title === location.hostname ? "" : title;
}

/**
 * Blurs and greys out the page rather than blacking it out, so it reads as
 * paused instead of gone: nothing behind stays legible, and the colour that
 * pulls you back in is drained. Video pages get a heavier tint, since a
 * regular YouTube video keeps playing and its motion would show through.
 * Browsers without backdrop-filter fall back to near-opaque black.
 */
function applyBackdrop(overlay: HTMLDivElement): void {
  const filter = "blur(18px) saturate(0.25) brightness(0.55)";
  const supported =
    CSS.supports("backdrop-filter", filter) ||
    CSS.supports("-webkit-backdrop-filter", filter);
  if (!supported) {
    overlay.style.background = "rgba(0, 0, 0, 0.96)";
    return;
  }
  const tint = isVideoControlsPage() ? 0.85 : 0.5;
  overlay.style.background = `rgba(10, 10, 14, ${tint})`;
  overlay.style.setProperty("backdrop-filter", filter);
  overlay.style.setProperty("-webkit-backdrop-filter", filter);
}

/**
 * Whether the mounted overlay was built for a different rule or restriction
 * set than `active`. A quick-return pause lapsing on its own doesn't count
 * when it fronts the overlay: its screen already counts down and moves on by
 * itself, and rebuilding would throw the user out of whatever they clicked
 * into next. Behind another restriction's screen nothing counts it down, so
 * there it does count — otherwise the screen keeps listing it and the gate
 * keeps charging its challenge after it has lifted.
 */
function overlayIsStale(
  overlay: HTMLElement,
  ruleId: string,
  active: RestrictionKind[],
): boolean {
  if (overlay.dataset.ruleId !== ruleId) return true;
  const shown = (overlay.dataset.restrictions ?? "")
    .split(",")
    .filter(Boolean) as RestrictionKind[];
  const selfAdvancing = (kind: RestrictionKind) =>
    kind === "quickReturn" && shown[0] === "quickReturn";
  const gained = active.some((kind) => !shown.includes(kind));
  const lapsed = shown.some(
    (kind) => !selfAdvancing(kind) && !active.includes(kind),
  );
  return gained || lapsed;
}

/**
 * Attaches the video controls (when applicable) OR the mobile-app upsell
 * under the card, then mounts the overlay. The upsell is skipped on
 * video-control pages because both compete for the space below the card.
 */
function finalizeOverlay(
  overlay: HTMLDivElement,
  card: HTMLDivElement,
): void {
  const videoAttached = attachVideoControlsIfApplicable(overlay, card);
  if (!videoAttached) overlay.appendChild(createAppUpsell());
  (document.body || document.documentElement).appendChild(overlay);
}

/**
 * Puts a video-control panel under the card when the blocked page is a
 * YouTube or TikTok video. Attached to the overlay itself (not
 * the session card) so it survives screen transitions (initial →
 * breath → time picker → etc.).
 *
 * On short, wide viewports the controls move beside the card instead of
 * below it, so they don't overlap the initial screen content.
 */
function attachVideoControlsIfApplicable(
  overlay: HTMLDivElement,
  card: HTMLDivElement,
): boolean {
  rlog("TryYTRules!");
  if (!isVideoControlsPage()) return false;
  const yt = createVideoControls();
  if (!yt) return false;
  rlog("created controls");
  overlay.appendChild(yt);

  // Short landscape viewports (phone in landscape, small laptop windows):
  // sit the panels side-by-side and let them flex-shrink to share width,
  // rather than letting the YT panel overlap the session content.
  const mql = window.matchMedia(
    "(max-height: 600px) and (orientation: landscape)",
  );
  // The overlay isn't mounted yet, so look it up from the overlay itself.
  const pageTitle = overlay.querySelector<HTMLElement>(`#${PAGE_TITLE_ID}`);
  const apply = () => {
    // Side by side there's no room above the card, and the title would
    // become a third column.
    if (pageTitle) pageTitle.style.display = mql.matches ? "none" : "";
    if (mql.matches) {
      overlay.style.flexDirection = "row";
      overlay.style.gap = "16px";
      overlay.style.padding = "12px";
      Object.assign(card.style, {
        flex: "1 1 0",
        minWidth: "0",
        width: "auto",
        maxWidth: "380px",
        padding: "18px 20px",
        gap: "12px",
      });
      Object.assign(yt.style, {
        position: "static",
        bottom: "",
        left: "",
        transform: "",
        flex: "1 1 0",
        minWidth: "0",
        width: "auto",
        maxWidth: "360px",
      });
    } else {
      overlay.style.flexDirection = "column";
      overlay.style.gap = "20px";
      overlay.style.padding = "16px";
      Object.assign(card.style, CARD_STYLE, { flex: "", minWidth: "" });
      Object.assign(yt.style, {
        position: "static",
        bottom: "",
        left: "",
        transform: "",
        flex: "0 0 auto",
        minWidth: "",
        width: "100%",
        maxWidth: "440px",
      });
    }
  };
  apply();
  // Each overlay gets its own listener, so a removed overlay drops its own.
  const onChange = () => {
    if (!overlay.isConnected) {
      mql.removeEventListener("change", onChange);
      return;
    }
    apply();
  };
  mql.addEventListener("change", onChange);
  return true;
}

export function removeSessionOverlay(): void {
  document.getElementById(SESSION_OVERLAY_ID)?.remove();
}

export function isSessionOverlayVisible(): boolean {
  return document.getElementById(SESSION_OVERLAY_ID) !== null;
}
