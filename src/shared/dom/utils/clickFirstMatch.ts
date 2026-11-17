export function clickFirstMatch(parent: Element, selector: string): void {
  const el = parent.querySelector(selector);
  if (el instanceof HTMLElement) el.click();
}
