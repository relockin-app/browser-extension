import { RelockrSettings } from "@/types/RelockrSettings";
import { applyAnyActiveInstagramSettings } from "./instagram";
import { applyAnyActiveLinkedInSettings } from "./linkedin";
import { applyAnyActiveTwitterSettings } from "./twitter";
import { applyAnyActiveYoutubeSettings } from "./youtube";
import { applyAnyActiveRedditSettings } from "./reddit/reddit";
import { applyTikTokModifications } from "./tiktok";

/** Matches x.com and twitter.com, but not hosts that merely end in "x.com" (netflix.com). */
export function isTwitterHost(url: string): boolean {
  try {
    return /(^|\.)(x|twitter)\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function applyAllDomModifications(
  relockrSettings: RelockrSettings,
  url: string,
  node: Element,
) {
  if (url.includes("instagram.com")) {
    applyAnyActiveInstagramSettings(relockrSettings, node, url);
  }
  if (url.includes("youtube.com")) {
    applyAnyActiveYoutubeSettings(relockrSettings, node);
  }
  if (url.includes("linkedin.com")) {
    applyAnyActiveLinkedInSettings(relockrSettings, node);
  }
  if (url.includes("reddit.com")) {
    applyAnyActiveRedditSettings(relockrSettings, node);
  }
  if (isTwitterHost(url)) {
    applyAnyActiveTwitterSettings(relockrSettings, node);
  }
  if (url.includes("tiktok.com")) {
    applyTikTokModifications(relockrSettings, node);
  }
}
