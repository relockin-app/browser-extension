import { injectStyle } from "./injectStyle";

/**
 * Hides everything matching `selectors` with one injected stylesheet, so
 * elements rendered later are hidden too, with no per-element work or rescans.
 * An empty list removes the stylesheet, showing them again. Safe to call at
 * document_start and on every pass.
 */
export function setHiddenBySelectors(styleId: string, selectors: string[]): void {
  const existing = document.getElementById(styleId);
  if (selectors.length === 0) {
    existing?.remove();
    return;
  }
  // One rule per selector: a browser without :has() drops only those rules,
  // not the whole list.
  const css = selectors
    .map((selector) => `${selector} { display: none !important; }`)
    .join("\n");
  if (existing?.textContent === css) return;
  injectStyle(styleId, css);
}
