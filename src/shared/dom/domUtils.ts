import { ELEMENT_IDS } from "../elementIds";

export function isInsideReelockrUi(node: Node | null): boolean {
  if (!node || node.nodeType !== 1) return false;
  const el = node as Element;
  return Boolean(
    el.closest(`#${ELEMENT_IDS.SESSION_OVERLAY_ID}`) ||
    el.closest(`#${ELEMENT_IDS.SESSION_TIMER_ID}`),
  );
}

export function isHTMLElement(node: unknown): node is HTMLElement {
  return node instanceof HTMLElement;
}

/**
 * Hides a DOM element and records the reason for hiding it.
 * @param {unknown} element - The element to hide.
 * @param {string} reason - The reason for hiding the element.
 * @returns {void}
 */
export function hideElement(element: unknown, reason: string): void {
  if (!isHTMLElement(element)) return;
  element.style.setProperty("display", "none", "important");
  element.style.setProperty("visibility", "hidden", "important");
  element.style.setProperty("height", "0", "important");
  element.style.setProperty("overflow", "hidden", "important");
  element.setAttribute("data-hide-reason", reason);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
