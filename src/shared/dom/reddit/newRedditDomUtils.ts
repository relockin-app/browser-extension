// Shared shreddit (new-reddit) DOM helpers. Shreddit's Lit custom elements
// (shreddit-post, shreddit-comment, shreddit-overflow-menu, etc.) render into
// open shadow roots, so a normal `querySelector` from light DOM doesn't see
// vote buttons, overflow menu items, or other internal controls. We walk
// descendants and recurse into every open `shadowRoot` we encounter. Composed
// events bubble out of shadow boundaries, so once we have a reference the
// `activate()` dispatch reaches the handler unchanged.

export function deepQuerySelector(
  root: ParentNode | null | undefined,
  selector: string,
): Element | null {
  if (!root) return null;
  const direct = root.querySelector?.(selector);
  if (direct) return direct;
  const all = root.querySelectorAll?.("*");
  if (!all) return null;
  for (const el of all) {
    const sr = (el as Element).shadowRoot;
    if (sr) {
      const inner = deepQuerySelector(sr, selector);
      if (inner) return inner;
    }
  }
  return null;
}

// Walk to the clickable ancestor of an `icon-name` SVG. Shreddit usually wraps
// the SVG in a `<button>`, but some controls use `[role="button"]` instead.
// `.closest()` only walks within the SVG's own root — that's fine here because
// Lit renders the icon and its button into the same shadow root.
export function findButtonByIcon(
  parent: ParentNode,
  iconNames: readonly string[],
): HTMLElement | null {
  for (const name of iconNames) {
    const svg = deepQuerySelector(parent, `svg[icon-name="${name}"]`);
    const btn = svg?.closest('button, [role="button"]');
    if (btn instanceof HTMLElement) return btn;
  }
  return null;
}

export function findFirstMatch(
  parent: ParentNode,
  selectors: readonly string[],
): HTMLElement | null {
  for (const sel of selectors) {
    const el = deepQuerySelector(parent, sel);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

// `.click()` on a `<button>` triggers browser-native activation and fires a
// click event — that's enough for shreddit's overflow trigger (confirmed
// working). But shreddit's `<div role="menuitem">` items inside the
// faceplate-bottom-sheet, and the Lit-managed vote/share buttons, attach
// handlers to `pointerdown`/`pointerup`, which `.click()` never fires. We
// dispatch the full pointer sequence followed by `.click()` so handlers on
// either event reach.
export function activate(el: HTMLElement): void {
  const ptr: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  };
  el.dispatchEvent(new PointerEvent("pointerdown", ptr));
  el.dispatchEvent(new PointerEvent("pointerup", ptr));
  el.click();
}

// Shreddit's SVG icons consistently expose `icon-name` (e.g. "upvote-outline",
// "save", "share-new"), and aria-labels are easy to lose across redesigns.
// Anchor dispatchers on icon-name first and treat selector fallbacks as
// hedge against future variants. Bare nouns ("upvote", "downvote") are
// included because the overflow-menu sample uses bare nouns ("save", "hide",
// "report") and the vote bar variant may follow the same convention.
export const UPVOTE_ICONS = [
  "upvote-outline",
  "upvote-fill",
  "upvote",
  "up-arrow",
  "arrow-up",
] as const;
export const DOWNVOTE_ICONS = [
  "downvote-outline",
  "downvote-fill",
  "downvote",
  "down-arrow",
  "arrow-down",
] as const;
export const SHARE_ICONS = [
  "share-new",
  "share-android",
  "share-ios",
  "share",
] as const;
export const OVERFLOW_ICONS = [
  "overflow-horizontal",
  "overflow-vertical",
] as const;
