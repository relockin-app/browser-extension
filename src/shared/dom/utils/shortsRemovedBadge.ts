import { t, tp } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import {
  RL_ACCENT_LAVENDER,
  RL_FONT_BODY,
} from "../../overlayUI/designTokens";
import { SettingsKey } from "../../settings/settingsKey";
import { createRelockrIconSvg } from "./relockrIconSvg";
import { writeDomSettings } from "./settingsWriter";

const BADGE_CLASS = "relockr-shorts-removed-badge";
const BADGE_BG = "rgba(173, 148, 242, 0.12)";
const BADGE_BG_HOVER = "rgba(173, 148, 242, 0.22)";

// The badge proves Shorts hiding works, so it's only needed at first: it shows
// on the first few days Shorts are hidden, and never again once closed. Days,
// not page loads, since one visit can hide dozens of shelves.
const BADGE_DAY_LIMIT = 2;
const DAYS_KEY = SettingsKey.YouTube.ShortsRemovedBadgeDays;
const DISMISSED_KEY = SettingsKey.YouTube.ShortsRemovedBadgeDismissed;

/** What this page has saved but may not have back from storage yet. */
let savedHere: RelockrSettings = {};

function localDay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function badgeState(settings: RelockrSettings): {
  days: string[];
  dismissed: boolean;
} {
  const merged = { ...settings, ...savedHere };
  const days = merged[DAYS_KEY];
  return {
    days: Array.isArray(days)
      ? days.filter((day): day is string => typeof day === "string")
      : [],
    dismissed: merged[DISMISSED_KEY] === true,
  };
}

function save(patch: RelockrSettings): void {
  savedHere = { ...savedHere, ...patch };
  writeDomSettings(patch).catch((e) =>
    console.error("[relockr] Failed to save Shorts badge state", e),
  );
}

/**
 * Puts a "N Shorts removed" badge before `before`, if it's still one of the
 * first days it's shown and the user hasn't closed one.
 */
export function insertShortsRemovedBadge(
  settings: RelockrSettings,
  parent: Element,
  before: Element,
  count: number,
): void {
  const { days, dismissed } = badgeState(settings);
  if (dismissed) return;
  const today = localDay();
  const shownToday = days.includes(today);
  if (!shownToday && days.length >= BADGE_DAY_LIMIT) return;

  parent.insertBefore(createShortsRemovedBadge(count, dismissAll), before);
  if (!shownToday) save({ [DAYS_KEY]: [...days, today] });
}

/** Closing one badge closes them all, here and for good. */
function dismissAll(): void {
  document
    .querySelectorAll(`.${BADGE_CLASS}`)
    .forEach((badge) => badge.remove());
  save({ [DISMISSED_KEY]: true });
}

function createShortsRemovedBadge(
  count: number,
  onDismiss: () => void,
): HTMLElement {
  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;
  Object.assign(badge.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 6px 6px 10px",
    margin: "8px",
    border: `1px solid ${RL_ACCENT_LAVENDER}`,
    borderRadius: "10px",
    background: BADGE_BG,
    color: RL_ACCENT_LAVENDER,
    fontFamily: RL_FONT_BODY,
    fontSize: "13px",
    fontWeight: "500",
    lineHeight: "1.2",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    verticalAlign: "top",
  });

  const icon = document.createElement("span");
  Object.assign(icon.style, {
    width: "16px",
    height: "16px",
    flex: "0 0 16px",
    display: "inline-flex",
    lineHeight: "0",
  });
  icon.appendChild(createRelockrIconSvg());
  badge.appendChild(icon);

  const text = document.createElement("span");
  text.textContent = tp("domShared_ytShortsRemovedBadge", count);
  badge.appendChild(text);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute(
    "aria-label",
    t("domShared_ytShortsRemovedBadgeDismiss"),
  );
  closeBtn.textContent = "×";
  Object.assign(closeBtn.style, {
    all: "unset",
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    fontSize: "18px",
    lineHeight: "1",
    color: RL_ACCENT_LAVENDER,
    cursor: "pointer",
    borderRadius: "6px",
    opacity: "0.75",
    transition: "background 0.15s ease, opacity 0.15s ease",
  });
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.opacity = "1";
    closeBtn.style.background = BADGE_BG_HOVER;
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.opacity = "0.75";
    closeBtn.style.background = "transparent";
  });
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss();
  });
  badge.appendChild(closeBtn);

  return badge;
}
