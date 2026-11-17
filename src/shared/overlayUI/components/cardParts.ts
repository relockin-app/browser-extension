import { makeText } from "../utils/domHelpers";
import {
  styleButtonCompactSecondary,
  styleButtonGradient,
} from "../utils/buttonStyles";
import {
  RL_FONT_BODY,
  RL_FONT_TITLE,
  RL_HAIRLINE,
  RL_TEXT_BODY,
  RL_TEXT_MUTED,
  RL_TEXT_PRIMARY,
} from "../designTokens";
import type { CloseTabMessage } from "~/types/messages";
import { t } from "~/lib/i18n";

// Building blocks for the block overlay's card. Every screen renders into the
// same card, so these keep headings, stats and actions consistent between them.

/**
 * Longer than this and a heading is set in the body face: Cascadia is wide,
 * and a question like "Is this the best use of your time right now?" wraps to
 * three cramped lines at title size.
 */
const MONO_HEADING_MAX_CHARS = 28;

export function makeHeading(text: string): HTMLDivElement {
  const mono = [...text].length <= MONO_HEADING_MAX_CHARS;
  return makeText(text, {
    fontFamily: mono ? RL_FONT_TITLE : RL_FONT_BODY,
    fontSize: mono ? "30px" : "26px",
    fontWeight: "700",
    letterSpacing: mono ? "-0.02em" : "-0.015em",
    lineHeight: mono ? "1.15" : "1.2",
    color: RL_TEXT_PRIMARY,
    textAlign: "start",
  });
}

export function makeBody(text: string): HTMLDivElement {
  return makeText(text, {
    fontSize: "15px",
    lineHeight: "1.55",
    color: RL_TEXT_BODY,
    textAlign: "start",
  });
}

/** Small secondary line, e.g. the time left under the time picker heading. */
export function makeCaption(text: string): HTMLDivElement {
  return makeText(text, {
    fontSize: "13px",
    color: RL_TEXT_MUTED,
    textAlign: "start",
  });
}

export function makeDivider(): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    height: "1px",
    background: RL_HAIRLINE,
    flexShrink: "0",
  });
  return el;
}

/**
 * A small caption over a large value (Cascadia, tabular). The caption goes
 * first, as a label, so captions like "resets at" read the same in every
 * language rather than trailing the value they introduce.
 */
export function makeStat(value: string, label: string): HTMLDivElement {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: "0",
  });
  wrap.appendChild(
    makeText(label, {
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.8px",
      textTransform: "uppercase",
      color: RL_TEXT_MUTED,
    }),
  );
  wrap.appendChild(
    makeText(value, {
      fontFamily: RL_FONT_TITLE,
      fontSize: "20px",
      fontWeight: "600",
      fontVariantNumeric: "tabular-nums",
      color: RL_TEXT_PRIMARY,
    }),
  );
  return wrap;
}

/** `makeStat` on a faint tile; lay several out in a row with `flex: 1`. */
export function makeStatTile(value: string, label: string): HTMLDivElement {
  const tile = makeStat(value, label);
  Object.assign(tile.style, {
    flex: "1 1 0",
    padding: "10px 12px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.05)",
  });
  return tile;
}

export function makeRow(gap = "10px"): HTMLDivElement {
  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", alignItems: "center", gap });
  return row;
}

/** The card's main action: a gradient button spanning the card. */
export function stylePrimaryBlock(btn: HTMLButtonElement): void {
  styleButtonGradient(btn);
  Object.assign(btn.style, {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px 20px",
    fontSize: "15px",
    borderRadius: "12px",
  });
}

/** A second full-width action under the primary one. */
export function styleSecondaryBlock(btn: HTMLButtonElement): void {
  styleButtonCompactSecondary(btn);
  Object.assign(btn.style, {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 20px",
    borderRadius: "12px",
  });
}

/**
 * Text-only button for the actions we don't want to encourage (overrides,
 * bypasses). Sits under a divider at the foot of the card.
 */
export function styleQuietButton(btn: HTMLButtonElement): void {
  btn.style.cssText = `
    all: unset;
    align-self: center;
    padding: 6px 10px;
    border-radius: 8px;
    font-family: ${RL_FONT_BODY};
    font-size: 12px;
    font-weight: 500;
    color: rgba(255,255,255,0.45) !important;
    cursor: pointer;
    user-select: none;
    text-align: center;
    transition: color 0.15s ease;
  `;
  btn.addEventListener("mouseenter", () => {
    btn.style.setProperty("color", "rgba(255,255,255,0.75)", "important");
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.setProperty("color", "rgba(255,255,255,0.45)", "important");
  });
}

/** "Close this tab": asks the background to close the tab we're on. */
export function makeCloseTabButton(
  variant: "primary" | "secondary",
): HTMLButtonElement {
  const btn = document.createElement("button");
  if (variant === "primary") stylePrimaryBlock(btn);
  else styleSecondaryBlock(btn);
  // The X makes it plain this closes the tab, not just the overlay, so it's
  // harder to hit by accident when it's the card's most prominent button.
  btn.style.gap = "8px";
  btn.appendChild(makeCloseIcon());
  const label = document.createElement("span");
  label.textContent = t("overlay_closeTab");
  btn.appendChild(label);
  btn.addEventListener("click", () => {
    browser.runtime
      .sendMessage({ type: "reelockr.closeTab" } satisfies CloseTabMessage)
      .catch((e) => console.warn("[RELOCKR] Close tab failed:", String(e)));
  });
  return btn;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A stroked X in the button's text colour. Built as SVG nodes (not
 * innerHTML) so it survives Trusted Types pages like YouTube, with fill and
 * stroke set as styles so page CSS like `svg { fill: … }` can't repaint it.
 */
function makeCloseIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = `
    display: block;
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
  `;
  for (const d of ["M6 6 18 18", "M18 6 6 18"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

const LOCK_ICON =`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

/** Rule chip and the blocked domain, across the top of the card. */
export function makeCardHeader(ruleName: string, domain: string): HTMLDivElement {
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    minWidth: "0",
  });

  const chip = document.createElement("div");
  Object.assign(chip.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    minWidth: "0",
    padding: "5px 10px",
    borderRadius: "999px",
    background: "rgba(115,158,235,0.14)",
    color: "rgb(150,184,245)",
    fontSize: "12px",
    fontWeight: "600",
  });
  chip.innerHTML = LOCK_ICON;
  const name = document.createElement("span");
  name.textContent = ruleName;
  Object.assign(name.style, {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  chip.appendChild(name);
  header.appendChild(chip);

  if (domain) {
    header.appendChild(
      makeText(domain, {
        fontSize: "12px",
        color: RL_TEXT_MUTED,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flexShrink: "1",
        minWidth: "0",
      }),
    );
  }
  return header;
}
