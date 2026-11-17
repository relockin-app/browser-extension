// ── Relockr design tokens (dark) ─────────────────────────────────
export const RL_ACCENT_BLUE = "rgb(115, 158, 235)";
export const RL_ACCENT_LAVENDER = "rgb(173, 148, 242)";
export const RL_GRADIENT = `linear-gradient(to right, ${RL_ACCENT_BLUE}, ${RL_ACCENT_LAVENDER})`;
export const RL_FONT_BODY =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
// Cascadia has no CJK glyphs: they fall through the Latin-only monospace fonts to sans-serif, which
// the browser resolves per the element's lang (Japanese, Chinese and Korean glyph forms differ).
export const RL_FONT_TITLE = "'CascadiaCode', ui-monospace, Menlo, Consolas, sans-serif";

// ── Block overlay ────────────────────────────────────────────────
/** Amber used for schedule and break notices on the block overlay. */
export const RL_AMBER = "rgba(255, 210, 140, 0.95)";
export const RL_AMBER_SOFT_BG = "rgba(255, 200, 120, 0.08)";
export const RL_AMBER_BORDER = "rgba(255, 200, 120, 0.2)";
export const RL_CARD_BG = "rgba(22, 22, 28, 0.95)";
export const RL_CARD_BORDER = "rgba(255, 255, 255, 0.09)";
export const RL_HAIRLINE = "rgba(255, 255, 255, 0.08)";
export const RL_TEXT_PRIMARY = "#ffffff";
export const RL_TEXT_BODY = "rgba(255, 255, 255, 0.72)";
export const RL_TEXT_MUTED = "rgba(255, 255, 255, 0.55)";
