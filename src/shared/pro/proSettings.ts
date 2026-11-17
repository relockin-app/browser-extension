import type { RelockrSettings } from "@/types/RelockrSettings";
import { AiContentTreatment } from "@/types/enums";
import { SETTINGS_DEFAULTS } from "../settings/settingsDefaults";
import { SettingsKey } from "../settings/settingsKey";

/**
 * Which site customizations are free without RelockIn Pro. Mirrors the mobile
 * app's list: every other site setting is Pro.
 * General settings (session timer, breathing, quick return) aren't site
 * customizations and are never gated.
 */
export const FREE_SETTING_KEYS: ReadonlySet<string> = new Set([
  SettingsKey.YouTube.Shorts,
  SettingsKey.YouTube.ShortsTab,
  SettingsKey.YouTube.MakeAdsSkippable,
  SettingsKey.Instagram.ReelsTab,
  SettingsKey.Reddit.UseOldReddit,
  SettingsKey.Reddit.MakeOldRedditMobileFriendly,
  SettingsKey.Reddit.HideOldRedditThumbnails,
  SettingsKey.Reddit.ExpandMediaByDefault,
  SettingsKey.Reddit.MoveVoteCountUnderPosts,
  SettingsKey.Reddit.ColorCodeCommentDepth,
  // Not in the iOS list (iOS has no such setting): it only fine-tunes the
  // free old reddit restyle, so it goes with it.
  SettingsKey.Reddit.AllowedCustomCssSubreddits,
  // Master swipe toggles are free; the per-direction action pickers stay Pro.
  SettingsKey.Reddit.EnableCommentSwipes,
  SettingsKey.Reddit.EnablePostSwipes,
  // The user's own channel lists, written from YouTube pages. Withholding
  // them would make votes and blocks vanish from the page.
  SettingsKey.YouTube.AiBlockedChannels,
  SettingsKey.YouTube.AiAllowedChannels,
  SettingsKey.YouTube.BlockedChannels,
  // Whether the "Shorts removed" notice was seen, written from YouTube pages.
  SettingsKey.YouTube.ShortsRemovedBadgeDays,
  SettingsKey.YouTube.ShortsRemovedBadgeDismissed,
  // Hidden settings: fixes with no UI, always free.
  SettingsKey.Instagram.HideUseAppBanner,
  SettingsKey.Instagram.HideOpenAppButton,
  SettingsKey.Instagram.FixDmReelLinks,
  SettingsKey.LinkedIn.HideDownloadAppPrompts,
  SettingsKey.Reddit.NeutralizeBlockingGates,
  SettingsKey.TikTok.DismissOpenAppModal,
  SettingsKey.YouTube.GreyscalePostImages,
]);

/** Values of otherwise Pro settings that stay free: AI videos can be labelled, not covered or hidden. */
const FREE_SETTING_VALUES: Readonly<Record<string, ReadonlySet<unknown>>> = {
  [SettingsKey.YouTube.AiContent]: new Set([AiContentTreatment.Off, AiContentTreatment.Badge]),
};

/**
 * What a Pro value applies as without Pro, when that isn't the default: the
 * closest free value, so AI videos are still labelled rather than shown bare.
 */
const FREE_FALLBACK_VALUES: Readonly<Record<string, unknown>> = {
  [SettingsKey.YouTube.AiContent]: AiContentTreatment.Badge,
};

const SITE_KEY_PREFIXES = Object.entries(SettingsKey)
  .filter(([group]) => group !== "General")
  .map(([, keys]) => `${Object.values(keys)[0].split(".")[0]}.`);

function isSiteSetting(key: string): boolean {
  return SITE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Whether any value of this setting needs Pro (some may still be free; see `requiresPro`). */
export function isProSetting(key: string): boolean {
  return isSiteSetting(key) && !FREE_SETTING_KEYS.has(key);
}

/** The values of a Pro setting that stay free, if it has any. */
export function freeValuesOf(key: string): ReadonlySet<unknown> | undefined {
  return FREE_SETTING_VALUES[key];
}

/** Whether this setting set to `value` only applies with Pro. */
export function requiresPro(key: string, value: unknown): boolean {
  if (!isProSetting(key)) return false;
  return !(FREE_SETTING_VALUES[key]?.has(value) ?? false);
}

/**
 * What `key` applies as without Pro, in place of a Pro value: its default,
 * the state nobody has customized. `undefined` means unset.
 */
function freeValueFor(key: string, value: unknown): unknown {
  if (key in FREE_FALLBACK_VALUES) return FREE_FALLBACK_VALUES[key];
  if (key in SETTINGS_DEFAULTS) return SETTINGS_DEFAULTS[key];
  return typeof value === "boolean" ? false : undefined;
}

/**
 * The settings as they apply without Pro: every Pro value, stored or default,
 * swapped for its free value. Stored choices are left alone, so they apply
 * again once the user has Pro.
 */
export function withoutProSettings(settings: RelockrSettings): RelockrSettings {
  const gated: RelockrSettings = { ...settings };
  for (const key of new Set([...Object.keys(SETTINGS_DEFAULTS), ...Object.keys(settings)])) {
    const value = key in settings ? settings[key] : SETTINGS_DEFAULTS[key];
    if (value === undefined || !requiresPro(key, value)) continue;
    const free = freeValueFor(key, value);
    if (free === value) continue;
    if (free === undefined) delete gated[key];
    else gated[key] = free;
  }
  return gated;
}
