// --- Compact post tagline --------------------------------------------------
//
// Old Reddit taglines read "submitted <time>3 hours ago</time> by <author>".
// On mobile that's a lot of horizontal text. We trim it down to a compact age
// (a small clock glyph + abbreviated unit, e.g. 🕐 3h), drop the leading
// "submitted" word, and leave Reddit's own author node untouched so its flair,
// mod/admin markers, cakeday, etc. survive.
//
// The age is computed from the <time datetime="..."> ISO attribute, NOT from
// the visible "3 hours ago" text, which Reddit localizes — parsing the
// attribute keeps the abbreviation exact and locale-independent, and the full
// timestamp stays on the element's `title` for hover / long-press.

import { t } from "~/lib/i18n";
import { createRedditIcon, ICON_CLOCK } from "./svgIcons";

export const OLD_REDDIT_POST_TAGLINE_STYLE_ID =
  "my-old-reddit-post-tagline-css";

const POST_TAGLINE_INIT_FLAG = "relockrCompactTagline";

// The <time> stays a plain inline box so its text sits on the same baseline as
// the surrounding tagline words ("by", the author link). An inline-flex box
// resolves its baseline against the line-box height, which varies per post
// (e.g. flair emoji make the line taller), so it drifted vertically relative to
// the neighbouring text. The only element that needs aligning is the icon,
// which we pull down onto the text baseline.
export const POST_TAGLINE_CSS = `
  .thing.link .relockr-compact-age {
    white-space: nowrap;
  }
  .thing.link .relockr-compact-age svg {
    font-size: 0.9em;
    opacity: 0.7;
    vertical-align: -0.125em;
    margin-right: 2px;
  }
`;

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

// Turn an ISO datetime into a compact relative age. Mirrors the units the
// design calls for — m / h / d / mo / y (no weeks) — and matches Reddit's own
// thresholds closely enough to feel native. Returns null for an unparseable
// attribute so the caller leaves the tagline alone.
function formatCompactAge(datetimeAttr: string | null): string | null {
  if (!datetimeAttr) return null;
  const then = Date.parse(datetimeAttr);
  if (Number.isNaN(then)) return null;

  const deltaSec = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (deltaSec < MINUTE) return t("domShared_redditAgeNow");
  if (deltaSec < HOUR)
    return t("domShared_redditAgeMinutesFormat", [
      String(Math.floor(deltaSec / MINUTE)),
    ]);
  if (deltaSec < DAY)
    return t("domShared_redditAgeHoursFormat", [
      String(Math.floor(deltaSec / HOUR)),
    ]);
  if (deltaSec < MONTH)
    return t("domShared_redditAgeDaysFormat", [
      String(Math.floor(deltaSec / DAY)),
    ]);
  if (deltaSec < YEAR)
    return t("domShared_redditAgeMonthsFormat", [
      String(Math.floor(deltaSec / MONTH)),
    ]);
  return t("domShared_redditAgeYearsFormat", [
    String(Math.floor(deltaSec / YEAR)),
  ]);
}

export function enhancePostTagline(thing: HTMLElement): void {
  if (thing.dataset[POST_TAGLINE_INIT_FLAG]) return;

  const topMatter = thing.querySelector(":scope > .entry > .top-matter");
  if (!(topMatter instanceof HTMLElement)) return;

  const time = topMatter.querySelector(
    "p.tagline time[datetime]",
  ) as HTMLTimeElement | null;
  if (!time) return;

  const compact = formatCompactAge(time.getAttribute("datetime"));
  if (compact === null) return;

  thing.dataset[POST_TAGLINE_INIT_FLAG] = "1";

  // Drop the leading "submitted " word — it's the text node immediately before
  // the <time>. Clearing the node (rather than matching the localized word)
  // keeps this language-independent.
  const prev = time.previousSibling;
  if (prev && prev.nodeType === Node.TEXT_NODE) {
    prev.textContent = "";
  }

  // Dropping `live-timestamp` takes us out of Reddit's `timetext` DOM query,
  // but its refresher also holds element references cached at page load and
  // keeps rewriting textContent on a timer regardless of the class. So we also
  // render our content and watch the element, re-applying whenever Reddit
  // clobbers it. The native `title` (full timestamp) is a plain attribute set
  // once at render, so it survives either way.
  time.classList.remove("live-timestamp");
  time.classList.add("relockr-compact-age");

  renderCompactAge(time, compact);
  keepCompactAge(time, compact);
}

const AGE_LABEL_CLASS = "relockr-age-label";

// Rebuild the <time> content as clock icon + compact age. Keeps the native
// `title` untouched (we only replace children).
function renderCompactAge(time: HTMLTimeElement, compact: string): void {
  time.replaceChildren();
  time.appendChild(createRedditIcon(ICON_CLOCK));
  const label = document.createElement("span");
  label.className = AGE_LABEL_CLASS;
  label.textContent = compact;
  time.appendChild(label);
}

// Guard against Reddit's timer overwriting our abbreviation. When our label
// element is no longer present, Reddit has clobbered the content, so we
// re-render. Our own re-render leaves the label in place, so those mutations
// short-circuit here without looping.
function keepCompactAge(time: HTMLTimeElement, compact: string): void {
  const observer = new MutationObserver(() => {
    if (time.querySelector(`:scope > .${AGE_LABEL_CLASS}`)) return;
    renderCompactAge(time, compact);
  });
  observer.observe(time, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
