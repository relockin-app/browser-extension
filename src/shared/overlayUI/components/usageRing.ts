import { RL_ACCENT_BLUE, RL_ACCENT_LAVENDER } from "../designTokens";

const LOCK_GLYPH = `
  <g transform="translate(11 10.5) scale(0.6)" fill="none" stroke="#ffffff"
    stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="11" width="20" height="12" rx="2.5" />
    <path d="M6.5 11V7a5.5 5.5 0 0 1 11 0v4" />
  </g>`;

/**
 * Ring showing how much of the daily limit is used. `fraction` is clamped to
 * 0–1; `lock` draws a padlock in the middle, for when the limit is spent.
 */
export function createUsageRing(
  fraction: number,
  size: number,
  label: string,
  lock = false,
): HTMLDivElement {
  const clamped = Math.min(1, Math.max(0, fraction));
  const r = 15; // radius within a 36×36 viewBox
  const circ = 2 * Math.PI * r;
  const filled = circ * clamped;

  // Unique id per instance to avoid SVG gradient collisions
  const gradId = `rl-ring-grad-${Math.random().toString(36).slice(2, 8)}`;

  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    width: `${size}px`,
    height: `${size}px`,
    flexShrink: "0",
  });
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute("aria-label", label);

  // A full ring is drawn as a plain circle: a dash the length of the
  // circumference still leaves a hairline gap at the round caps.
  const arc =
    clamped >= 1
      ? `<circle cx="18" cy="18" r="${r}" fill="none" stroke="url(#${gradId})" stroke-width="4.5" />`
      : `<circle cx="18" cy="18" r="${r}" fill="none" stroke="url(#${gradId})" stroke-width="4.5"
          stroke-dasharray="${filled} ${circ - filled}" stroke-dashoffset="${circ * 0.25}"
          stroke-linecap="round" />`;

  wrapper.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${RL_ACCENT_BLUE}" />
          <stop offset="100%" stop-color="${RL_ACCENT_LAVENDER}" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="${r}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4.5" />
      ${clamped > 0 ? arc : ""}
      ${lock ? LOCK_GLYPH : ""}
    </svg>
  `;
  return wrapper;
}
