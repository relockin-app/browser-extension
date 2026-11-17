import { t } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import { ConnectionDegreeFilter, CoverDifficulty } from "@/types/enums";

import { rlog } from "../rlog";
import { applyCover } from "./coverElement";
import { hideElement } from "./domUtils";
import { SettingsKey } from "../settings/settingsKey";
import { isHiddenSettingOn } from "./utils/hiddenSetting";
import { timeStr } from "../timeStr";
import { setMediaGreyscale } from "./utils/mediaGreyscale";

const LEGACY_BLOCK_NON_FIRST_KEY = "linkedin.blockNonFirstConnectionsPosts";
const LEGACY_BLOCK_NON_FIRST_DIFFICULTY_KEY =
  "linkedin.blockNonFirstConnectionsPosts.coverDifficulty";

function resolveConnectionDegreeFilter(
  settings: RelockrSettings,
): ConnectionDegreeFilter {
  const current = settings[SettingsKey.LinkedIn.ConnectionDegreeFilter];
  if (
    current === ConnectionDegreeFilter.None ||
    current === ConnectionDegreeFilter.Max1st ||
    current === ConnectionDegreeFilter.Max2nd
  ) {
    return current;
  }
  // Legacy boolean: if old toggle was on, treat as "1st only".
  return settings[LEGACY_BLOCK_NON_FIRST_KEY]
    ? ConnectionDegreeFilter.Max1st
    : ConnectionDegreeFilter.None;
}

function resolveConnectionDegreeDifficulty(
  settings: RelockrSettings,
): CoverDifficulty {
  return (
    ((settings[SettingsKey.LinkedIn.ConnectionDegreeFilterCoverDifficulty] ??
      settings[LEGACY_BLOCK_NON_FIRST_DIFFICULTY_KEY]) as
      | CoverDifficulty
      | undefined) ?? CoverDifficulty.ShortWait
  );
}

function shouldCoverDegree(
  degreeText: string | undefined,
  filter: ConnectionDegreeFilter,
): boolean {
  if (filter === ConnectionDegreeFilter.None) return false;
  if (degreeText === undefined) return false;
  if (filter === ConnectionDegreeFilter.Max1st) return degreeText !== "1st";
  if (filter === ConnectionDegreeFilter.Max2nd)
    return degreeText !== "1st" && degreeText !== "2nd";
  return false;
}

function connectionDegreeCoverTitle(filter: ConnectionDegreeFilter): string {
  if (filter === ConnectionDegreeFilter.Max2nd)
    return t("domShared_linkedInCoverDegree3rdTitle");
  return t("domShared_linkedInCoverDegreeNot1stTitle");
}

function autoDismissDownloadAppModal() {
  const modalContainer = document.querySelector(".top-level-modal-container");

  if (modalContainer) {
    rlog(`Disabling linkedin download app modal`);
    hideElement(modalContainer, "LinkedIn download app modal");
    // Necessary to re-enable scrolling
    const body = document.querySelector("body");
    body?.classList.remove("overflow-hidden");

    // Also restore scrolling if LinkedIn disabled it
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }

  // "LinkedIn works better if you switch to our app"
  const promo = document.querySelector('div[aria-labelledby="promo-title"]');
  if (promo) {
    hideElement(promo, "LinkedIn download app promo");
    // Also restore scrolling if LinkedIn disabled it
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }
}

function coverUndesiredPosts(relockrSettings: RelockrSettings, node: Element) {
  const degreeFilter = resolveConnectionDegreeFilter(relockrSettings);
  const hidePromoted =
    !!relockrSettings[SettingsKey.LinkedIn.HidePromotedPosts];

  const degreeFilterDifficulty =
    resolveConnectionDegreeDifficulty(relockrSettings);
  const promotedDifficulty =
    (relockrSettings[SettingsKey.LinkedIn.HidePromotedPostsCoverDifficulty] as
      | CoverDifficulty
      | undefined) ?? CoverDifficulty.ShortWait;

  let coveredCount = 0;
  node.querySelectorAll("li.feed-item").forEach((item) => {
    if (degreeFilter !== ConnectionDegreeFilter.None) {
      const degree = item.querySelector(
        ".base-main-feed-card__entity-lockup span.text-sm.text-color-text-low-emphasis",
      );
      const degreeTextContent = degree?.textContent?.trim();
      if (shouldCoverDegree(degreeTextContent, degreeFilter)) {
        applyCover(
          item,
          connectionDegreeCoverTitle(degreeFilter),
          t("domShared_linkedInCoverDegreeSubtitle"),
          degreeFilterDifficulty,
          1,
        );
        coveredCount++;
        return;
      }
    }

    if (hidePromoted) {
      if (item.querySelector("article[data-is-sponsored]")) {
        applyCover(
          item,
          t("domShared_linkedInCoverAdTitle"),
          t("domShared_linkedInCoverAdSubtitle"),
          promotedDifficulty,
          1,
        );
        coveredCount++;
        return;
      }
    }
  });

  rlog(`LinkedIn DOM: covered ${coveredCount} elements ${timeStr()}`);
}

function coverFeedMedia(node: Element) {
  let coveredCount = 0;
  const seen = new Set<Element>();
  node.querySelectorAll("figure img").forEach((media) => {
    const figure = media.closest("figure");
    if (!figure || seen.has(figure)) return;

    const link = figure.closest("a");
    const src = media.getAttribute("src") || "";

    if (src.includes("profile-displayphoto")) return;

    const isFeedLink = link?.href.includes("/feed/");
    if (!isFeedLink) return;

    seen.add(figure);
    applyCover(
      figure,
      t("domShared_linkedInCoverImageTitle"),
      t("domShared_linkedInCoverMediaSubtitle"),
      CoverDifficulty.Instant,
      1,
    );
    coveredCount++;
  });

  // Mobile feed images
  node
    .querySelectorAll("button[data-feed-action='view-image'] > img")
    .forEach((media) => {
      const button = media.closest("button");
      if (!button || seen.has(button)) return;

      seen.add(button);
      applyCover(
        button,
        t("domShared_linkedInCoverImageTitle"),
        t("domShared_linkedInCoverMediaSubtitle"),
        CoverDifficulty.Instant,
        1,
      );
      coveredCount++;
    });

  node.querySelectorAll("video").forEach((media) => {
    const target = media.parentElement?.parentElement;
    if (!target || seen.has(target)) return;

    seen.add(target);
    applyCover(
      target,
      t("domShared_linkedInCoverVideoTitle"),
      t("domShared_linkedInCoverMediaSubtitle"),
      CoverDifficulty.Instant,
      1,
    );
    coveredCount++;
  });

  rlog(`LinkedIn DOM: covered ${coveredCount} media elements ${timeStr()}`);
}

const GREYSCALE_STYLE_ID = "relockr-lin-media-greyscale";

/** Greyscale feed post media, matching what coverFeedMedia covers. */
export function applyLinkedInMediaGreyscale(settings: RelockrSettings): void {
  const selectors: string[] = [];
  if (settings[SettingsKey.LinkedIn.GreyscalePictures]) {
    selectors.push(
      'a[href*="/feed/"] figure img:not([src*="profile-displayphoto"])',
      // Mobile feed images
      "button[data-feed-action='view-image'] > img",
    );
  }
  if (settings[SettingsKey.LinkedIn.GreyscaleVideos]) {
    selectors.push("video");
  }
  setMediaGreyscale(GREYSCALE_STYLE_ID, selectors);
}

export function applyAnyActiveLinkedInSettings(
  relockrSettings: RelockrSettings,
  node: Element,
): void {
  const degreeFilter = resolveConnectionDegreeFilter(relockrSettings);
  if (
    degreeFilter !== ConnectionDegreeFilter.None ||
    relockrSettings[SettingsKey.LinkedIn.HidePromotedPosts]
  ) {
    coverUndesiredPosts(relockrSettings, node);
  }

  if (relockrSettings[SettingsKey.LinkedIn.HideMediaInFeed]) {
    coverFeedMedia(node);
  }

  applyLinkedInMediaGreyscale(relockrSettings);

  if (
    isHiddenSettingOn(relockrSettings, SettingsKey.LinkedIn.HideDownloadAppPrompts)
  ) {
    autoDismissDownloadAppModal();
  }
}
