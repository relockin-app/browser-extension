import type { RelockrSettings } from "@/types/RelockrSettings";

import { hideElement } from "./domUtils";
import { SettingsKey } from "../settings/settingsKey";
import { setHiddenBySelectors } from "./utils/hiddenStylesheet";

export function applyAnyActiveTwitterSettings(
  reelockrSettings: RelockrSettings,
  node: Element,
): void {
  if (reelockrSettings[SettingsKey.Twitter.HideForYouTab]) {
    hideForYouTab(node);
  }
  applyTwitterAdStyles(reelockrSettings);
}

const ADS_STYLE_ID = "relockr-x-hidden-ads";
const AD_POST_SELECTOR =
  '[data-testid="placementTracking"]:has([data-testid$="impression-pixel"]) article[data-testid="tweet"]';

/** Hides ad posts with a stylesheet (see setHiddenBySelectors). */
export function applyTwitterAdStyles(reelockrSettings: RelockrSettings): void {
  setHiddenBySelectors(
    ADS_STYLE_ID,
    reelockrSettings[SettingsKey.Twitter.HideAds] ? [AD_POST_SELECTOR] : [],
  );
}

function hideForYouTab(node: Element) {
  const forYouTab = node.querySelector(
    'div[data-testid="ScrollSnap-SwipeableList"] div[role="presentation"]',
  );
  hideElement(forYouTab, "Twitter For You");
}
