import { t } from "~/lib/i18n";
import { CoverDifficulty } from "@/types/enums";
import { RL_FONT_BODY, RL_FONT_TITLE } from "../overlayUI/designTokens";
import { isHTMLElement } from "./domUtils";
import { createRelockrIconSvg } from "./utils/relockrIconSvg";

const COVER_ATTR = "data-relockr-covered";
const COVER_DISMISSED_ATTR = "data-relockr-cover-dismissed";
const COVER_CLASS = "relockr-cover-overlay";
const SHORT_WAIT_SECONDS = 5;
const LONG_WAIT_SECONDS = 10;
const DEFAULT_COVER_Z_INDEX = 2147483646;

/**
 * Identity keys of content the user has dismissed during this page session.
 * Sites like Instagram re-render the same post as a brand-new element (e.g.
 * opening the comments view, or feed virtualisation), which loses the
 * per-element dismissed attribute. Kept in memory on purpose: a hard reload
 * re-arms the covers.
 */
const dismissedKeys = new Set<string>();

/**
 * Events that must not reach the page through the overlay. Some sites attach
 * click handlers to the covered element itself (e.g. Instagram's ad detail
 * view opens the ad on any click inside the article).
 */
export const CONTAINED_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "touchstart",
  "touchend",
  "keydown",
  "keyup",
] as const;

/**
 * How the cover hides the element.
 * - solid: an opaque panel, its label kept centred in the visible part as the
 *   page scrolls.
 * - blur: the element shows through blurred, under a label fixed at its
 *   centre. The blur says what's covered on its own, so the label needn't
 *   follow the scroll.
 */
export type CoverLook = "solid" | "blur";

/** Lines of subtitle the blur look's label shows before cutting off. */
const BLUR_SUBTITLE_MAX_LINES = 6;

/** On an element under a blur cover. */
const BLUR_COVER_ATTR = "data-relockr-blur-covered";
const BLUR_COVER_STYLE_ID = "relockr-blur-cover-style";
// A playing video keeps reshaping the blur, which pulls the eye. Hiding it
// leaves the element's own nodes and player untouched, and lifts by itself
// once the attribute goes.
const BLUR_COVER_CSS = `[${BLUR_COVER_ATTR}] video { opacity: 0 !important; }`;

function injectBlurCoverStyleOnce(): void {
  if (document.getElementById(BLUR_COVER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = BLUR_COVER_STYLE_ID;
  style.textContent = BLUR_COVER_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

type ResolvedDifficulty =
  | { kind: "instant" }
  | { kind: "delay"; seconds: number }
  | { kind: "permanent" };

function resolveDifficulty(difficulty: CoverDifficulty): ResolvedDifficulty {
  switch (difficulty) {
    case CoverDifficulty.Instant:
      return { kind: "instant" };
    case CoverDifficulty.ShortWait:
      return { kind: "delay", seconds: SHORT_WAIT_SECONDS };
    case CoverDifficulty.LongWait:
      return { kind: "delay", seconds: LONG_WAIT_SECONDS };
    case CoverDifficulty.Permanent:
      return { kind: "permanent" };
    case CoverDifficulty.Challenge:
      console.warn(
        `[relockr] CoverDifficulty.Challenge not yet implemented — falling back to ShortWait (${SHORT_WAIT_SECONDS}s)`,
      );
      return { kind: "delay", seconds: SHORT_WAIT_SECONDS };
    default:
      return { kind: "delay", seconds: SHORT_WAIT_SECONDS };
  }
}

/**
 * Applies a cover overlay on top of an element. The user must press a button
 * and wait before the cover is dismissed. Idempotent — will not add a second
 * cover if one is already present or was previously dismissed.
 *
 * @param element     The element to cover.
 * @param label       Human-readable name shown in the cover (e.g. "Recommended Videos").
 * @param subtitleText Optional subtitle displayed under the title.
 * @param difficulty  How hard it is to dismiss. Instant / ShortWait (5s) /
 *                    LongWait (10s) / Permanent are wired up. Challenge is
 *                    declared but not yet implemented and falls back to ShortWait.
 * @param zIndex      Optional z-index for the overlay. Defaults to near-max so
 *                    the cover sits above page chrome; pass a lower value to
 *                    keep specific UI (e.g. modals, nav bars) visible above it.
 * @param dismissKeys Optional stable identifiers for the covered content (e.g.
 *                    post ids), or a getter for them. If any key was dismissed
 *                    earlier in this page session, no cover is applied — so
 *                    re-rendered copies of the same content stay uncovered.
 *                    A getter is re-read on dismiss, for content whose ids
 *                    only appear after the element first renders.
 * @param look        Solid panel (default) or a blur with a fixed label.
 */
export function applyCover(
  element: unknown,
  label: string,
  subtitleText?: string,
  difficulty: CoverDifficulty = CoverDifficulty.ShortWait,
  zIndex: number = DEFAULT_COVER_Z_INDEX,
  dismissKeys: string[] | (() => string[]) = [],
  look: CoverLook = "solid",
): void {
  const resolveKeys = () =>
    typeof dismissKeys === "function" ? dismissKeys() : dismissKeys;

  if (!isHTMLElement(element)) return;

  if (
    element.hasAttribute(COVER_ATTR) ||
    element.hasAttribute(COVER_DISMISSED_ATTR)
  ) {
    return;
  }

  if (resolveKeys().some((key) => dismissedKeys.has(key))) {
    element.setAttribute(COVER_DISMISSED_ATTR, "true");
    return;
  }

  element.setAttribute(COVER_ATTR, label);

  const computed = getComputedStyle(element);
  if (computed.position === "static") {
    element.style.position = "relative";
  }

  const compact = element.offsetHeight < 160;
  const blur = look === "blur";

  const overlay = document.createElement("div");
  overlay.className = COVER_CLASS;
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    zIndex: String(zIndex),
    background: "rgb(12, 12, 14)",
    borderRadius: "12px",
    fontFamily: RL_FONT_BODY,
  });
  if (blur) {
    injectBlurCoverStyleOnce();
    element.setAttribute(BLUR_COVER_ATTR, "");
    const backdrop = "blur(28px) saturate(0.6)";
    Object.assign(overlay.style, {
      background: "rgba(12, 12, 14, 0.35)",
      backdropFilter: backdrop,
      webkitBackdropFilter: backdrop,
      // The blur samples past the edges; this keeps it inside the element.
      overflow: "hidden",
      // Square, so covered posts side by side meet without unblurred notches.
      borderRadius: "0",
    });
  }

  // Bubble phase (not capture) so our own button handlers still run first.
  for (const type of CONTAINED_EVENTS) {
    overlay.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === "click" || type === "auxclick") e.preventDefault();
    });
  }

  const inner = document.createElement("div");
  Object.assign(inner.style, {
    position: "absolute",
    left: "0",
    right: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: compact ? "8px" : "16px",
    padding: compact ? "8px" : "24px",
    boxSizing: "border-box",
  });

  if (blur) {
    Object.assign(inner.style, {
      right: "auto",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "max-content",
      maxWidth: compact ? "calc(100% - 16px)" : "min(360px, calc(100% - 32px))",
      gap: compact ? "6px" : "12px",
      padding: compact ? "8px 14px" : "20px 24px",
      borderRadius: compact ? "12px" : "16px",
      background: "rgba(20, 20, 24, 0.85)",
      border: "1px solid rgba(173, 148, 242, 0.35)",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
    });
  }

  const updateInnerPosition = () => {
    const overlayRect = overlay.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const visibleTop = Math.max(0, overlayRect.top);
    const visibleBottom = Math.min(viewportH, overlayRect.bottom);
    const visibleCenter = (visibleTop + visibleBottom) / 2;
    const innerH = inner.offsetHeight;
    let top = visibleCenter - overlayRect.top - innerH / 2;
    top = Math.max(0, Math.min(top, overlayRect.height - innerH));
    inner.style.top = `${top}px`;
  };

  if (!blur) {
    window.addEventListener("scroll", updateInnerPosition, { passive: true });
    window.addEventListener("resize", updateInnerPosition, { passive: true });
    updateInnerPosition();
    requestAnimationFrame(updateInnerPosition);
  }

  if (!compact) {
    const icon = document.createElement("div");
    Object.assign(icon.style, {
      width: "40px",
      height: "40px",
      lineHeight: "0",
      marginBottom: "-10px",
    });
    icon.appendChild(createRelockrIconSvg());
    inner.appendChild(icon);
  }

  const title = document.createElement("div");
  Object.assign(title.style, {
    fontFamily: RL_FONT_TITLE,
    fontSize: compact ? "14px" : "20px",
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    lineHeight: "1.3",
  });
  title.textContent = `${label}`;
  inner.appendChild(title);

  const subtitle = document.createElement("div");
  Object.assign(subtitle.style, {
    fontSize: compact ? "11px" : "13px",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    whiteSpace: "pre-line",
  });
  if (blur) {
    // A post's caption can run long; the label stays a label.
    Object.assign(subtitle.style, {
      color: "rgba(255,255,255,0.6)",
      display: "-webkit-box",
      webkitBoxOrient: "vertical",
      webkitLineClamp: String(compact ? 2 : BLUR_SUBTITLE_MAX_LINES),
      overflow: "hidden",
      overflowWrap: "anywhere",
    });
  }
  subtitle.textContent = subtitleText ?? t("domShared_coverSubtitleDefault");
  inner.appendChild(subtitle);

  const btn = document.createElement("button");
  btn.textContent = t("domShared_coverDismiss");
  Object.assign(btn.style, {
    all: "unset",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: compact ? "6px 18px" : "10px 28px",
    fontFamily: RL_FONT_BODY,
    fontSize: compact ? "12px" : "14px",
    fontWeight: "600",
    borderRadius: compact ? "8px" : "12px",
    userSelect: "none",
    textAlign: "center",
    color: "rgba(255,255,255,0.7)",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    cursor: "pointer",
    transition: "all 0.2s ease",
  });

  const dismiss = () => {
    window.removeEventListener("scroll", updateInnerPosition);
    window.removeEventListener("resize", updateInnerPosition);
    overlay.remove();
    element.removeAttribute(COVER_ATTR);
    element.removeAttribute(BLUR_COVER_ATTR);
    element.setAttribute(COVER_DISMISSED_ATTR, "true");
    for (const key of resolveKeys()) dismissedKeys.add(key);
  };

  const disableButton = () => {
    btn.style.cursor = "not-allowed";
    btn.style.color = "rgba(255,255,255,0.3)";
    btn.style.background = "rgba(255,255,255,0.05)";
    btn.style.border = "1px solid rgba(255,255,255,0.1)";
  };

  const resolved = resolveDifficulty(difficulty);

  if (resolved.kind === "permanent") {
    btn.textContent = t("domShared_coverCannotDismiss");
    disableButton();
  } else if (resolved.kind === "instant") {
    btn.textContent = t("domShared_coverDismiss");
    btn.addEventListener("click", dismiss, { once: true });
  } else {
    let countdownActive = false;
    btn.addEventListener("click", () => {
      if (countdownActive) return;
      countdownActive = true;
      disableButton();

      let remaining = resolved.seconds;
      btn.textContent = t(
        "domShared_coverDismissCountdownFormat",
        String(remaining),
      );

      const interval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
          btn.textContent = t(
            "domShared_coverDismissCountdownFormat",
            String(remaining),
          );
        } else {
          clearInterval(interval);
          dismiss();
        }
      }, 1000);
    });
  }

  inner.appendChild(btn);
  overlay.appendChild(inner);
  element.appendChild(overlay);
}
