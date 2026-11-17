<script module lang="ts">
  import { SettingsKey } from "~/shared/settings/settingsKey";
  import { InstagramHomeFeed, RedditFeedVisibility, ThumbnailFilter } from "~/types/enums";
  import { t } from "../../i18n";

  type Settings = Record<string, unknown>;

  /**
   * An on/off row. Most map straight onto one boolean setting; a few are
   * onboarding-only shorthands for one choice of a multi-option setting, so
   * "on" here always means what it means in the Customize tab.
   */
  interface ToggleTweak {
    kind: "toggle";
    /** The setting it writes, for whether it's Pro. */
    key: string;
    label: string;
    isOn: (values: Settings) => boolean;
    apply: (on: boolean) => Settings;
  }

  interface SelectTweak {
    kind: "select";
    key: string;
    label: string;
    /** The value that counts as "not tweaked". */
    off: string;
    options: { value: string; label: string }[];
  }

  type Tweak = ToggleTweak | SelectTweak;

  function bool(key: string, label: string): ToggleTweak {
    return { kind: "toggle", key, label, isOn: (v) => v[key] === true, apply: (on) => ({ [key]: on }) };
  }

  export const SITES: { id: string; name: string; icon: string; tweaks: Tweak[] }[] = [
    {
      id: "youtube",
      name: t("settings_youTubeSection"),
      icon: "/images/apps/youtube.png",
      tweaks: [
        {
          kind: "select",
          key: SettingsKey.YouTube.ThumbnailFilter,
          label: t("settings_ytThumbnailFilter"),
          off: ThumbnailFilter.Visible,
          options: [
            { value: ThumbnailFilter.Visible, label: t("settings_enumThumbnailFilterVisible") },
            { value: ThumbnailFilter.LightlyBlurred, label: t("settings_enumThumbnailFilterLightlyBlurred") },
            { value: ThumbnailFilter.HeavilyBlurred, label: t("settings_enumThumbnailFilterHeavilyBlurred") },
            { value: ThumbnailFilter.Greyscale, label: t("settings_enumThumbnailFilterGreyscale") },
            { value: ThumbnailFilter.Black, label: t("settings_enumThumbnailFilterBlack") },
          ],
        },
        bool(SettingsKey.YouTube.DisableAutoplay, t("settings_ytDisableAutoplay")),
        bool(SettingsKey.YouTube.HideEndCard, t("settings_ytHideEndCard")),
        bool(SettingsKey.YouTube.DisableVideoPreviews, t("settings_ytDisableVideoPreviews")),
      ],
    },
    {
      id: "instagram",
      name: t("settings_instagramSection"),
      icon: "/images/apps/instagram.png",
      tweaks: [
        bool(SettingsKey.Instagram.ReelsTab, t("settings_hideReelsTab")),
        {
          kind: "toggle",
          key: SettingsKey.Instagram.HomeFeed,
          label: t("onboardingWebext_tweaksIgFollowingOnly"),
          isOn: (v) => v[SettingsKey.Instagram.HomeFeed] === InstagramHomeFeed.Following,
          apply: (on) => ({
            [SettingsKey.Instagram.HomeFeed]: on ? InstagramHomeFeed.Following : InstagramHomeFeed.Default,
          }),
        },
        bool(SettingsKey.Instagram.Comments, t("settings_igComments")),
        bool(SettingsKey.Instagram.GreyscaleVideos, t("settings_igGreyscaleVideos")),
      ],
    },
    {
      id: "reddit",
      name: t("settings_redditSection"),
      icon: "/images/apps/reddit.png",
      tweaks: [
        {
          kind: "toggle",
          key: SettingsKey.Reddit.HideFeeds,
          label: t("onboardingWebext_tweaksRedditNoPopular"),
          // Hiding every feed also hides Popular and All, so it counts as on.
          isOn: (v) => (v[SettingsKey.Reddit.HideFeeds] ?? RedditFeedVisibility.ShowAll) !== RedditFeedVisibility.ShowAll,
          apply: (on) => ({
            [SettingsKey.Reddit.HideFeeds]: on ? RedditFeedVisibility.HideDiscovery : RedditFeedVisibility.ShowAll,
          }),
        },
        bool(SettingsKey.Reddit.HomeJoinedOnly, t("settings_redditHomeJoinedOnly")),
        bool(SettingsKey.Reddit.GreyscaleMedia, t("settings_redditGreyscaleMedia")),
        bool(SettingsKey.Reddit.UseOldReddit, t("settings_useOldReddit")),
      ],
    },
    {
      id: "x",
      name: "X",
      icon: "/images/apps/x.png",
      tweaks: [
        bool(SettingsKey.Twitter.HideForYouTab, t("settings_xHideForYou")),
        bool(SettingsKey.Twitter.HideAds, t("settings_xHideAds")),
      ],
    },
    {
      id: "linkedin",
      name: t("settings_linkedInSection"),
      icon: "/images/apps/linkedin.png",
      tweaks: [
        bool(SettingsKey.LinkedIn.HidePromotedPosts, t("settings_lInHidePromotedPosts")),
        bool(SettingsKey.LinkedIn.HideMediaInFeed, t("settings_lInHideMediaInFeed")),
        bool(SettingsKey.LinkedIn.GreyscalePictures, t("settings_lInGreyscalePictures")),
      ],
    },
  ];

  /** How many of the tweaks shown here are on, for the setup summary. */
  export function countTweaksOn(values: Settings): number {
    return SITES.flatMap((s) => s.tweaks).filter((tweak) =>
      tweak.kind === "toggle" ? tweak.isOn(values) : (values[tweak.key] ?? tweak.off) !== tweak.off,
    ).length;
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { SETTINGS_DEFAULTS } from "~/shared/settings/settingsDefaults";
  import { isProSetting, withoutProSettings } from "~/shared/pro/proSettings";
  import { useProAccess } from "../../proAccess.svelte";
  import ProBadge from "../../ProBadge.svelte";

  /** A handful of real settings per supported site, saved as they change. */
  const SETTINGS_KEY = "local:reelockrSettings";

  let siteId = $state(SITES[0].id);
  let site = $derived(SITES.find((s) => s.id === siteId)!);
  let values = $state<Settings>({});
  const pro = useProAccess();
  // As they apply: Pro tweaks show off, and locked, in the free version on a phone.
  let shown = $derived(pro.limited ? withoutProSettings(values) : values);

  function isLocked(tweak: Tweak): boolean {
    return pro.limited && isProSetting(tweak.key);
  }

  onMount(async () => {
    values = { ...SETTINGS_DEFAULTS, ...((await storage.getItem<Settings>(SETTINGS_KEY)) ?? {}) };
  });

  async function save(changes: Settings): Promise<void> {
    values = { ...values, ...changes };
    const stored = (await storage.getItem<Settings>(SETTINGS_KEY)) ?? {};
    await storage.setItem(SETTINGS_KEY, { ...stored, ...changes });
  }
</script>

<div class="panel">
  <div class="tabs" role="tablist">
    {#each SITES as s}
      <button
        class="tab"
        class:active={s.id === siteId}
        role="tab"
        aria-selected={s.id === siteId}
        onclick={() => (siteId = s.id)}
      >
        <img src={s.icon} alt="" />
        <span>{s.name}</span>
      </button>
    {/each}
  </div>
  {#key siteId}
    <div class="rows" in:fly={{ y: 8, duration: 260 }}>
      {#each site.tweaks as tweak}
        {#if tweak.kind === "toggle"}
          {@const on = tweak.isOn(shown)}
          <button class="row" role="switch" aria-checked={on} disabled={isLocked(tweak)} onclick={() => save(tweak.apply(!on))}>
            <span class="label">{tweak.label}{#if isLocked(tweak)}<ProBadge />{/if}</span>
            <span class="switch" class:on><span class="knob"></span></span>
          </button>
        {:else}
          <label class="row">
            <span class="label">{tweak.label}{#if isLocked(tweak)}<ProBadge />{/if}</span>
            <select
              disabled={isLocked(tweak)}
              value={(shown[tweak.key] as string | undefined) ?? tweak.off}
              onchange={(e) => save({ [tweak.key]: e.currentTarget.value })}
            >
              {#each tweak.options as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
        {/if}
      {/each}
    </div>
  {/key}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border-radius: 22px;
    background: #141417;
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 40px 80px -24px rgba(0, 0, 0, 0.7);
  }

  .tabs {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }

  .tab {
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 4px 10px;
    border-radius: 14px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }

  .tab:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .tab:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
  }

  .tab.active {
    background: rgba(115, 158, 235, 0.12);
    color: #fff;
  }

  .tab img {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    opacity: 0.75;
    transition: opacity 0.2s ease;
  }

  .tab.active img {
    opacity: 1;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 236px;
  }

  .row {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 26px;
    padding: 14px 16px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .row:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .row:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
  }

  /* Pro, in the free version on a phone. */
  .row:disabled,
  .row:has(select:disabled) {
    cursor: default;
  }

  .row:disabled:hover,
  .row:has(select:disabled):hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .row:disabled .switch,
  select:disabled {
    opacity: 0.45;
  }

  .label {
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.88);
  }

  select {
    flex-shrink: 0;
    padding: 6px 10px;
    font-size: 14px;
  }

  .switch {
    position: relative;
    flex-shrink: 0;
    width: 42px;
    height: 26px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    transition: background 0.25s ease;
  }

  .switch.on {
    background: var(--rl-gradient);
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .switch.on .knob {
    transform: translateX(16px);
  }
</style>
