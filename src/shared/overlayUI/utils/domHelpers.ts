import { uiLocale } from "./intlFormat";

export function clearContainer(container: HTMLDivElement): void {
  container.replaceChildren();
}

export function makeText(
  text: string,
  styles: Partial<CSSStyleDeclaration>,
): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, styles);
  el.textContent = text;
  return el;
}

/**
 * Marks an in-page overlay with RelockIn's language, which the page's may not share: screen readers
 * pick the matching voice, and Korean wraps between words rather than mid-word.
 */
export function applyUiLanguage(el: HTMLElement): void {
  const lang = uiLocale();
  el.lang = lang;
  if (lang.toLowerCase().startsWith("ko")) {
    el.style.wordBreak = "keep-all";
    el.style.overflowWrap = "break-word";
  }
}
