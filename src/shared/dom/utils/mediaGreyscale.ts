/**
 * Renders the matched media in greyscale via one injected stylesheet, so it
 * survives re-renders and covers media added later without per-element work.
 * `filter` behaves the same on <img> and <video>.
 */
export function setMediaGreyscale(
  styleId: string,
  selectors: string[],
): void {
  const existing = document.getElementById(styleId);
  if (selectors.length === 0) {
    existing?.remove();
    return;
  }
  const css = `${selectors.join(",\n")} { filter: grayscale(1) !important; }`;
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = css;
  // documentElement (not head) so this also works at document_start.
  document.documentElement.appendChild(style);
}
