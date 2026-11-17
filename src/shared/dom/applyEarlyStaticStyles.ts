import { RelockrSettings } from "@/types/RelockrSettings";
import { SettingsKey } from "../settings/settingsKey";
import {
  applyRedditMediaGreyscale,
  hideOldRedditThumbnails,
  injectOldRedditDepthColors,
  injectOldRedditMobileFriendlyStyles,
} from "./reddit/reddit";
import { applyRedditFeedVisibilityEarly } from "./reddit/redditFeedVisibility";
import {
  applyInstagramExploreTiles,
  applyInstagramMediaGreyscale,
} from "./instagram";
import { applyLinkedInMediaGreyscale } from "./linkedin";
import { applyYouTubeNavTabStyles } from "./youtube";
import { applyInstagramNavTabStyles } from "./instagram";
import { applyTwitterAdStyles } from "./twitter";
import { isTwitterHost } from "./applyAllDomModifications";

// CSS-only modifications that are safe to apply at document_start, before the
// body is parsed. Keeps the page from briefly rendering its unstyled state.
export function applyAllEarlyStaticStyles(
  relockrSettings: RelockrSettings,
  url: string,
): void {
  if (url.includes("instagram.com")) {
    applyInstagramMediaGreyscale(relockrSettings);
    applyInstagramExploreTiles(relockrSettings);
    applyInstagramNavTabStyles(relockrSettings);
  }
  if (url.includes("youtube.com")) {
    applyYouTubeNavTabStyles(relockrSettings);
  }
  if (isTwitterHost(url)) {
    applyTwitterAdStyles(relockrSettings);
  }
  if (url.includes("linkedin.com")) {
    applyLinkedInMediaGreyscale(relockrSettings);
  }
  if (url.includes("reddit.com")) {
    applyRedditFeedVisibilityEarly(relockrSettings);
    applyRedditMediaGreyscale(relockrSettings);
  }
  if (url.includes("old.reddit.com")) {
    if (relockrSettings[SettingsKey.Reddit.MakeOldRedditMobileFriendly]) {
      injectOldRedditMobileFriendlyStyles();
    }
    if (relockrSettings[SettingsKey.Reddit.HideOldRedditThumbnails]) {
      hideOldRedditThumbnails();
    }
    if (relockrSettings[SettingsKey.Reddit.ColorCodeCommentDepth]) {
      injectOldRedditDepthColors();
    }
  }
}
