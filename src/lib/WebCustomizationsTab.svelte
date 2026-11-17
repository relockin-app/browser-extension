<script lang="ts">
  import { onMount } from "svelte";
  import { ChevronRight, SquareArrowUpRight, Wrench } from "@lucide/svelte";
  import TabHeader from "./TabHeader.svelte";
  import { SETTINGS_DEFAULTS } from "@/shared/settings/settingsDefaults";
  import { SettingsKey } from "@/shared/settings/settingsKey";
  import {
    AiContentTreatment,
    ElementTreatment,
    CoverDifficulty,
    DisplayMode,
    ThumbnailFilter,
    ConnectionDegreeFilter,
    InstagramHomeFeed,
    PostSwipeAction,
    RedditFeedVisibility,
    SwipeGestureAction,
  } from "@/types/enums";
  import { t } from "./i18n";
  import OptionMenu from "./OptionMenu.svelte";
  import InfoTip from "./InfoTip.svelte";
  import YouTubeChannelListSheet, {
    type ChannelListSection,
  } from "./YouTubeChannelListSheet.svelte";
  import ProBadge from "./ProBadge.svelte";
  import { useProAccess } from "./proAccess.svelte";
  import { phoneStore } from "~/shared/upsell/storeUrls";
  import {
    freeValuesOf,
    isProSetting,
    requiresPro,
    withoutProSettings,
  } from "@/shared/pro/proSettings";

  type Settings = Record<string, unknown>;
  const STORAGE_KEY = "local:reelockrSettings";

  type ToggleItem = {
    key: string;
    label: string;
    type?: "toggle";
    indent?: boolean;
    parentKey?: string;
    coverDifficultyKey?: string;
    // Only shown (and, in the DOM code, only applied) while this holds.
    visibleIf?: (get: (key: string) => unknown) => boolean;
    // Hidden (along with its descendants) outside dev builds. Visibility
    // only: the setting is still applied from storage/defaults.
    devOnly?: boolean;
    // A short line under the label, for settings whose name alone is unclear.
    description?: string;
  };
  type SelectItem = {
    key: string;
    label: string;
    type: "select";
    options: { value: string; label: string }[];
    parentKey?: string;
    indent?: boolean;
  };
  // A labelled radio choice (option cards, each with a title + description)
  // whose selection is backed by one or more settings. Each option
  // writes a set of settings when picked; `selected` derives the active option
  // id from the current settings. Lets us present several underlying booleans
  // as a single mutually-exclusive choice.
  type MultiChoiceOption = {
    id: string;
    label: string;
    description: string;
    set: Record<string, unknown>;
  };
  type MultiChoiceItem = {
    key: string;
    label: string;
    type: "multiChoice";
    options: MultiChoiceOption[];
    selected: (get: (key: string) => unknown) => string;
  };
  // A single setting picked from a dropdown menu whose options each have a
  // title and a description (see OptionMenu).
  type MenuChoiceItem = {
    key: string;
    label: string;
    type: "menuChoice";
    options: { value: string; label: string; description: string }[];
    hint?: string;
  };
  // Channels the user voted or blocked on YouTube (see youtubeAiContent.ts).
  // A row with a count that opens the lists in a sheet, so long lists don't
  // crowd the settings. Shown only when non-empty unless `showWhenEmpty`.
  type ChannelListItem = {
    key: string;
    label: string;
    type: "channelList";
    description?: string;
    /** The lists in the sheet, one section each; defaults to just `key`. */
    sections?: ChannelListSection[];
    showWhenEmpty?: boolean;
    visibleIf?: (get: (key: string) => unknown) => boolean;
  };
  type TreatmentItem = {
    key: string;
    coverDifficultyKey: string;
    label: string;
    type: "treatment";
  };
  type ConnectionDegreeItem = {
    key: string;
    coverDifficultyKey: string;
    label: string;
    type: "connectionDegree";
  };
  type SubredditListItem = {
    key: string;
    label: string;
    hint: string;
    placeholder: string;
    addLabel: string;
    removeLabel: (name: string) => string;
    emptyLabel: string;
    type: "subredditList";
    parentKey: string;
  };
  type SettingsItem = (
    | ToggleItem
    | SelectItem
    | MultiChoiceItem
    | MenuChoiceItem
    | TreatmentItem
    | ConnectionDegreeItem
    | SubredditListItem
    | ChannelListItem
  ) & {
    /** Extra explanation, shown in a hover/focus (i) tooltip after the label. */
    info?: string;
  };

  const ELEMENT_TREATMENT_LABELS: Record<ElementTreatment, string> = {
    [ElementTreatment.Show]: t("settings_enumElementTreatmentShow"),
    [ElementTreatment.Cover]: t("settings_enumElementTreatmentCover"),
    [ElementTreatment.Remove]: t("settings_enumElementTreatmentRemove"),
  };

  const COVER_DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
    { value: CoverDifficulty.Instant, label: t("settings_enumCoverDifficultyInstant") },
    { value: CoverDifficulty.ShortWait, label: t("settings_enumCoverDifficultyShortWait") },
    { value: CoverDifficulty.LongWait, label: t("settings_enumCoverDifficultyLongWait") },
    { value: CoverDifficulty.Permanent, label: t("settings_enumCoverDifficultyPermanent") },
    // Challenge variant hidden from UI until the challenge system is wired up.
    // { value: CoverDifficulty.Challenge, label: t("settings_enumCoverDifficultyChallenge") },
  ];

  const THREE_WAY_TREATMENTS = [
    ElementTreatment.Show,
    ElementTreatment.Cover,
    ElementTreatment.Remove,
  ];

  const CONNECTION_DEGREE_OPTIONS: { value: string; label: string }[] = [
    { value: ConnectionDegreeFilter.None, label: t("settings_enumConnectionDegreeFilterNone") },
    { value: ConnectionDegreeFilter.Max2nd, label: t("settings_enumConnectionDegreeFilterMax2nd") },
    { value: ConnectionDegreeFilter.Max1st, label: t("settings_enumConnectionDegreeFilterMax1st") },
  ];

  const SWIPE_ACTION_OPTIONS: { value: string; label: string }[] = [
    { value: SwipeGestureAction.Upvote, label: t("settings_enumSwipeActionUpvote") },
    { value: SwipeGestureAction.Downvote, label: t("settings_enumSwipeActionDownvote") },
    { value: SwipeGestureAction.Collapse, label: t("settings_enumSwipeActionCollapse") },
    { value: SwipeGestureAction.Reply, label: t("settings_enumSwipeActionReply") },
    { value: SwipeGestureAction.Save, label: t("settings_enumSwipeActionSave") },
  ];

  const POST_SWIPE_ACTION_OPTIONS: { value: string; label: string }[] = [
    { value: PostSwipeAction.Upvote, label: t("settings_enumPostSwipeActionUpvote") },
    { value: PostSwipeAction.Downvote, label: t("settings_enumPostSwipeActionDownvote") },
    { value: PostSwipeAction.Hide, label: t("settings_enumPostSwipeActionHide") },
    { value: PostSwipeAction.Share, label: t("settings_enumPostSwipeActionShare") },
    { value: PostSwipeAction.Save, label: t("settings_enumPostSwipeActionSave") },
    { value: PostSwipeAction.OpenComments, label: t("settings_enumPostSwipeActionOpenComments") },
    { value: PostSwipeAction.OpenSource, label: t("settings_enumPostSwipeActionOpenSource") },
    { value: PostSwipeAction.ExpandPreview, label: t("settings_enumPostSwipeActionExpandPreview") },
  ];

  function parseSubredditList(value: unknown): string[] {
    if (typeof value !== "string") return [];
    return value
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }

  function sanitizeSubredditInput(raw: string): string {
    // Strip leading "r/" or "/r/" and any chars Reddit doesn't allow in a name.
    return raw
      .trim()
      .replace(/^\/?r\//i, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
  }

  function listSections(item: ChannelListItem): ChannelListSection[] {
    return item.sections ?? [{ key: item.key }];
  }

  function listLength(item: ChannelListItem): number {
    return listSections(item).reduce((n, { key }) => {
      const val = get(key);
      return n + (Array.isArray(val) ? val.length : 0);
    }, 0);
  }

  let openList = $state<ChannelListItem | null>(null);

  // The sheet saves on its own, so re-read once it closes.
  async function closeList(): Promise<void> {
    openList = null;
    settings = (await storage.getItem<Settings>(STORAGE_KEY)) ?? {};
  }

  const isAiContentOn = (g: (key: string) => unknown) =>
    g(SettingsKey.YouTube.AiContent) !== AiContentTreatment.Off;

  let subredditInputs = $state<Record<string, string>>({});

  function getSubredditInput(key: string): string {
    return subredditInputs[key] ?? "";
  }

  function setSubredditInput(key: string, value: string): void {
    subredditInputs[key] = value;
  }

  async function addSubreddit(key: string): Promise<void> {
    const name = sanitizeSubredditInput(getSubredditInput(key));
    setSubredditInput(key, "");
    if (!name) return;
    const list = parseSubredditList(get(key));
    if (list.includes(name)) return;
    await setString(key, [...list, name].join(","));
  }

  async function removeSubreddit(key: string, name: string): Promise<void> {
    const list = parseSubredditList(get(key)).filter((s) => s !== name);
    await setString(key, list.join(","));
  }

  function getConnectionDegree(key: string): ConnectionDegreeFilter {
    const val = get(key);
    if (
      val === ConnectionDegreeFilter.None ||
      val === ConnectionDegreeFilter.Max1st ||
      val === ConnectionDegreeFilter.Max2nd
    ) {
      return val;
    }
    return ConnectionDegreeFilter.None;
  }

  type SiteId = "instagram" | "youtube" | "linkedin" | "reddit" | "twitter";
  // A headed run of settings drawn as one card. A section with no visible
  // items (e.g. only dev-only ones in a release build) isn't drawn at all.
  type SettingsSection = {
    title?: string;
    items: SettingsItem[];
  };
  // Long site lists use `sections`; short ones give `items`, drawn as a
  // single untitled card.
  type SettingsGroup = {
    id: SiteId;
    site: string;
    domain: string;
    altDomains?: string[];
  } & ({ items: SettingsItem[]; sections?: never } | { sections: SettingsSection[]; items?: never });

  function groupSections(group: SettingsGroup): SettingsSection[] {
    return group.sections ?? [{ items: group.items! }];
  }

  function groupItems(group: SettingsGroup): SettingsItem[] {
    return groupSections(group).flatMap((section) => section.items);
  }
  const SETTINGS_GROUPS: SettingsGroup[] = [
    {
      id: "youtube",
      domain: "youtube.com",
      site: t("settings_youTubeSection"),
      sections: [
        {
          title: t("settings_ytSectionShorts"),
          items: [
            { key: SettingsKey.YouTube.Shorts, label: t("settings_ytBlockShorts") },
            { key: SettingsKey.YouTube.ShortsTab, label: t("settings_ytHideShortsTab") },
          ],
        },
        {
          title: t("settings_ytSectionHomeFeed"),
          items: [
            { key: SettingsKey.YouTube.ThumbnailFilter, label: t("settings_ytThumbnailFilter"), type: "select", options: [
              { value: ThumbnailFilter.Visible, label: t("settings_enumThumbnailFilterVisible") },
              { value: ThumbnailFilter.LightlyBlurred, label: t("settings_enumThumbnailFilterLightlyBlurred") },
              { value: ThumbnailFilter.HeavilyBlurred, label: t("settings_enumThumbnailFilterHeavilyBlurred") },
              { value: ThumbnailFilter.Greyscale, label: t("settings_enumThumbnailFilterGreyscale") },
              { value: ThumbnailFilter.Black, label: t("settings_enumThumbnailFilterBlack") },
            ] },
            { key: SettingsKey.YouTube.HomeTab, label: t("settings_ytHideHomeTab") },
            { key: SettingsKey.YouTube.RedirectHomeToSubscriptions, label: t("settings_ytRedirectHomeToSubscriptions") },
            { key: SettingsKey.YouTube.DisableVideoPreviews, label: t("settings_ytDisableVideoPreviews") },
            { key: SettingsKey.YouTube.HideHomeFeedPosts, label: t("settings_ytHideHomeFeedPosts"), description: t("settings_ytHideHomeFeedPostsDesc") },
          ],
        },
        {
          title: t("settings_ytSectionAiChannels"),
          items: [
            {
              key: SettingsKey.YouTube.BlockedChannels,
              label: t("settings_ytBlockedChannels"),
              description: t("settings_ytBlockedChannelsDesc"),
              type: "channelList",
              showWhenEmpty: true,
            },
            {
              key: SettingsKey.YouTube.AiContent,
              label: t("settings_ytAiContent"),
              type: "menuChoice",
              options: [
                {
                  value: AiContentTreatment.Off,
                  label: t("settings_ytAiContentOff"),
                  description: t("settings_ytAiContentOffDesc"),
                },
                {
                  value: AiContentTreatment.Badge,
                  label: t("settings_ytAiContentBadge"),
                  description: t("settings_ytAiContentBadgeDesc"),
                },
                {
                  value: AiContentTreatment.Cover,
                  label: t("settings_ytAiContentCover"),
                  description: t("settings_ytAiContentCoverDesc"),
                },
                {
                  value: AiContentTreatment.Hide,
                  label: t("settings_ytAiContentHide"),
                  description: t("settings_ytAiContentHideDesc"),
                },
              ],
            },
            {
              key: SettingsKey.YouTube.AiBlockedChannels,
              label: t("settings_ytAiVotes"),
              type: "channelList",
              sections: [
                {
                  key: SettingsKey.YouTube.AiBlockedChannels,
                  label: t("domShared_ytAiVoteAi"),
                  exportAs: "aiSeed",
                },
                {
                  key: SettingsKey.YouTube.AiAllowedChannels,
                  label: t("domShared_ytAiNotAi"),
                  exportAs: "plain",
                },
              ],
              showWhenEmpty: true,
              visibleIf: isAiContentOn,
            },
          ],
        },
        {
          title: t("settings_ytSectionUpNext"),
          items: [
            {
              key: SettingsKey.YouTube.RecommendedVideos,
              coverDifficultyKey: SettingsKey.YouTube.RecommendedVideosCoverDifficulty,
              label: t("settings_ytRecommendedVideos"),
              type: "treatment",
            },
            { key: SettingsKey.YouTube.HideEndCard, label: t("settings_ytHideEndCard") },
            { key: SettingsKey.YouTube.DisableAutoplay, label: t("settings_ytDisableAutoplay") },
          ],
        },
        {
          title: t("settings_sectionOther"),
          items: [
            { key: SettingsKey.YouTube.DisplayMode, label: t("settings_ytDisplayMode"), type: "select", options: [
              { value: DisplayMode.Default, label: t("settings_enumDisplayModeDefault") },
              { value: DisplayMode.Mobile, label: t("settings_enumDisplayModeMobile") },
              { value: DisplayMode.Desktop, label: t("settings_enumDisplayModeDesktop") },
            ] },
            { key: SettingsKey.YouTube.MakeAdsSkippable, label: t("settings_ytMakeAdsSkippable"), devOnly: true },
          ],
        },
      ],
    },
    {
      id: "instagram",
      domain: "instagram.com",
      site: t("settings_instagramSection"),
      sections: [
        {
          title: t("settings_sectionTabs"),
          items: [
            { key: SettingsKey.Instagram.ReelsTab, label: t("settings_hideReelsTab") },
            { key: SettingsKey.Instagram.HomeTab, label: t("settings_hideHomeTab") },
            { key: SettingsKey.Instagram.ExploreTiles, label: t("settings_igHideExploreTiles") },
          ],
        },
        {
          title: t("settings_sectionFeed"),
          items: [
            {
              key: SettingsKey.Instagram.HomeFeed,
              label: t("settings_igHomeFeed"),
              type: "multiChoice",
              options: [
                {
                  id: InstagramHomeFeed.Default,
                  label: t("settings_igHomeFeedDefault"),
                  description: t("settings_igHomeFeedDefaultDesc"),
                  set: { [SettingsKey.Instagram.HomeFeed]: InstagramHomeFeed.Default },
                },
                {
                  id: InstagramHomeFeed.Following,
                  label: t("settings_igHomeFeedFollowing"),
                  description: t("settings_igHomeFeedFollowingDesc"),
                  set: { [SettingsKey.Instagram.HomeFeed]: InstagramHomeFeed.Following },
                },
                {
                  id: InstagramHomeFeed.Favorites,
                  label: t("settings_igHomeFeedFavorites"),
                  description: t("settings_igHomeFeedFavoritesDesc"),
                  set: { [SettingsKey.Instagram.HomeFeed]: InstagramHomeFeed.Favorites },
                },
              ],
              selected: (g) => g(SettingsKey.Instagram.HomeFeed) as string,
            },
            {
              key: SettingsKey.Instagram.HomeFeedHideDefaultLink,
              label: t("settings_igHomeFeedHideDefaultLink"),
              visibleIf: (g) => g(SettingsKey.Instagram.HomeFeed) !== InstagramHomeFeed.Default,
            },
            {
              key: SettingsKey.Instagram.ExploreFeedStrangers,
              label: t("settings_igExploreFeedStrangers"),
              coverDifficultyKey: SettingsKey.Instagram.ExploreFeedStrangersCoverDifficulty,
              visibleIf: (g) => g(SettingsKey.Instagram.HomeFeed) === InstagramHomeFeed.Default,
            },
            {
              key: SettingsKey.Instagram.FeedVideos,
              label: t("settings_igFeedVideos"),
              coverDifficultyKey: SettingsKey.Instagram.FeedVideosCoverDifficulty,
            },
            { key: SettingsKey.Instagram.FeedVideosExemptFollowing, label: t("settings_igCommentsExemptFollowing"), indent: true, parentKey: SettingsKey.Instagram.FeedVideos },
            {
              key: SettingsKey.Instagram.GuardAds,
              label: t("settings_igGuardAds"),
              coverDifficultyKey: SettingsKey.Instagram.GuardAdsCoverDifficulty,
            },
          ],
        },
        {
          title: t("settings_sectionAppearance"),
          items: [
            { key: SettingsKey.Instagram.GreyscalePictures, label: t("settings_igGreyscalePictures") },
            { key: SettingsKey.Instagram.GreyscaleVideos, label: t("settings_igGreyscaleVideos") },
          ],
        },
        {
          title: t("settings_sectionOther"),
          items: [
            {
              key: SettingsKey.Instagram.Stories,
              coverDifficultyKey: SettingsKey.Instagram.StoriesCoverDifficulty,
              label: t("settings_igStories"),
              type: "treatment",
            },
            { key: SettingsKey.Instagram.Comments, label: t("settings_igComments") },
            { key: SettingsKey.Instagram.CommentsExemptFollowing, label: t("settings_igCommentsExemptFollowing"), indent: true, parentKey: SettingsKey.Instagram.Comments },
          ],
        },
      ],
    },
    {
      id: "linkedin",
      domain: "linkedin.com",
      site: t("settings_linkedInSection"),
      items: [
        {
          key: SettingsKey.LinkedIn.ConnectionDegreeFilter,
          coverDifficultyKey: SettingsKey.LinkedIn.ConnectionDegreeFilterCoverDifficulty,
          label: t("settings_lInConnectionDegreeFilter"),
          type: "connectionDegree",
        },
        {
          key: SettingsKey.LinkedIn.HidePromotedPosts,
          label: t("settings_lInHidePromotedPosts"),
          coverDifficultyKey: SettingsKey.LinkedIn.HidePromotedPostsCoverDifficulty,
        },
        {
          key: SettingsKey.LinkedIn.HideMediaInFeed,
          label: t("settings_lInHideMediaInFeed"),
        },
        { key: SettingsKey.LinkedIn.GreyscalePictures, label: t("settings_lInGreyscalePictures") },
        { key: SettingsKey.LinkedIn.GreyscaleVideos, label: t("settings_lInGreyscaleVideos") },
      ]
    },
    {
      id: "reddit",
      domain: "reddit.com",
      site: t("settings_redditSection"),
      sections: [
        {
          title: t("settings_sectionFeeds"),
          items: [
            {
              key: SettingsKey.Reddit.HideFeeds,
              label: t("settings_redditHideFeeds"),
              type: "menuChoice",
              options: [
                {
                  value: RedditFeedVisibility.ShowAll,
                  label: t("settings_redditHideFeedsShowAll"),
                  description: t("settings_redditHideFeedsShowAllDesc"),
                },
                {
                  value: RedditFeedVisibility.HideDiscovery,
                  label: t("settings_redditHideFeedsHideDiscovery"),
                  description: t("settings_redditHideFeedsHideDiscoveryDesc"),
                },
                {
                  value: RedditFeedVisibility.HideAll,
                  label: t("settings_redditHideFeedsHideAll"),
                  description: t("settings_redditHideFeedsHideAllDesc"),
                },
              ],
            },
            {
              // Old reddit's front page is already just your subscriptions. Kept
              // visible when all feeds are hidden, so it's there when Home comes back.
              key: SettingsKey.Reddit.HomeJoinedOnly,
              label: t("settings_redditHomeJoinedOnly"),
              visibleIf: (g) => !g(SettingsKey.Reddit.UseOldReddit),
            },
          ],
        },
        {
          title: t("settings_sectionAppearance"),
          items: [
            { key: SettingsKey.Reddit.UseOldReddit, label: t("settings_useOldReddit") },
            {
              key: "reddit.feedStyle",
              label: t("settings_redditFeedStyle"),
              type: "multiChoice",
              options: [
                {
                  id: "compact",
                  label: t("settings_redditFeedStyleCompact"),
                  description: t("settings_redditFeedStyleCompactDesc"),
                  set: {
                    [SettingsKey.Reddit.ExpandMediaByDefault]: false,
                    [SettingsKey.Reddit.HideOldRedditThumbnails]: true,
                  },
                },
                {
                  id: "thumbnails",
                  label: t("settings_redditFeedStyleThumbnails"),
                  description: t("settings_redditFeedStyleThumbnailsDesc"),
                  set: {
                    [SettingsKey.Reddit.ExpandMediaByDefault]: false,
                    [SettingsKey.Reddit.HideOldRedditThumbnails]: false,
                  },
                },
                {
                  id: "expanded",
                  label: t("settings_redditFeedStyleExpanded"),
                  description: t("settings_redditFeedStyleExpandedDesc"),
                  set: {
                    [SettingsKey.Reddit.ExpandMediaByDefault]: true,
                    [SettingsKey.Reddit.HideOldRedditThumbnails]: true,
                  },
                },
              ],
              // Expanded is defined by ExpandMediaByDefault (thumbnails are hidden
              // then anyway); otherwise the presence of thumbnails distinguishes
              // Thumbnails from Compact.
              selected: (g) =>
                g(SettingsKey.Reddit.ExpandMediaByDefault)
                  ? "expanded"
                  : g(SettingsKey.Reddit.HideOldRedditThumbnails)
                    ? "compact"
                    : "thumbnails",
            },
            { key: SettingsKey.Reddit.GreyscaleMedia, label: t("settings_redditGreyscaleMedia") },
            { key: SettingsKey.Reddit.ColorCodeCommentDepth, label: t("settings_redditColorCodeCommentDepth") },
          ],
        },
        {
          title: t("settings_sectionOther"),
          items: [
            { key: SettingsKey.Reddit.MakeOldRedditMobileFriendly, label: t("settings_redditOldMobileFriendly"), devOnly: true },
            {
              key: SettingsKey.Reddit.MoveVoteCountUnderPosts,
              label: t("settings_redditMoveVoteCountUnderPosts"),
              parentKey: SettingsKey.Reddit.MakeOldRedditMobileFriendly,
              indent: true,
            },
            {
              key: SettingsKey.Reddit.AllowedCustomCssSubreddits,
              label: t("settings_redditAllowedCustomCssSubsLabel"),
              hint: t("settings_redditAllowedCustomCssSubsHint"),
              placeholder: t("settings_redditAllowedCustomCssSubsPlaceholder"),
              addLabel: t("common_add"),
              removeLabel: (name: string) => t("settings_redditAllowedCustomCssSubsRemoveLabel", [name]),
              emptyLabel: t("settings_redditAllowedCustomCssSubsEmpty"),
              type: "subredditList",
              parentKey: SettingsKey.Reddit.MakeOldRedditMobileFriendly,
            },
            {
              key: SettingsKey.Reddit.EnableCommentSwipes,
              label: t("settings_redditEnableCommentSwipes"),
              parentKey: SettingsKey.Reddit.MakeOldRedditMobileFriendly,
            },
            {
              key: SettingsKey.Reddit.SwipeShortRight,
              label: t("settings_redditSwipeShortRight"),
              type: "select",
              options: SWIPE_ACTION_OPTIONS,
              parentKey: SettingsKey.Reddit.EnableCommentSwipes,
              indent: true,
            },
            {
              key: SettingsKey.Reddit.SwipeLongRight,
              label: t("settings_redditSwipeLongRight"),
              type: "select",
              options: SWIPE_ACTION_OPTIONS,
              parentKey: SettingsKey.Reddit.EnableCommentSwipes,
              indent: true,
            },
            {
              key: SettingsKey.Reddit.SwipeShortLeft,
              label: t("settings_redditSwipeShortLeft"),
              type: "select",
              options: SWIPE_ACTION_OPTIONS,
              parentKey: SettingsKey.Reddit.EnableCommentSwipes,
              indent: true,
            },
            {
              key: SettingsKey.Reddit.SwipeLongLeft,
              label: t("settings_redditSwipeLongLeft"),
              type: "select",
              options: SWIPE_ACTION_OPTIONS,
              parentKey: SettingsKey.Reddit.EnableCommentSwipes,
              indent: true,
            },
            {
              key: SettingsKey.Reddit.EnablePostSwipes,
              label: t("settings_redditEnablePostSwipes"),
              parentKey: SettingsKey.Reddit.MakeOldRedditMobileFriendly,
            },
            {
              key: SettingsKey.Reddit.PostSwipeShortRight,
              label: t("settings_redditSwipeShortRight"),
              type: "select",
              options: POST_SWIPE_ACTION_OPTIONS,
              parentKey: SettingsKey.Reddit.EnablePostSwipes,
              indent: true,
            },
            {
              key: SettingsKey.Reddit.PostSwipeLongRight,
              label: t("settings_redditSwipeLongRight"),
              type: "select",
              options: POST_SWIPE_ACTION_OPTIONS,
              parentKey: SettingsKey.Reddit.EnablePostSwipes,
              indent: true,
            },
            {
              key: SettingsKey.Reddit.PostSwipeShortLeft,
              label: t("settings_redditSwipeShortLeft"),
              type: "select",
              options: POST_SWIPE_ACTION_OPTIONS,
              parentKey: SettingsKey.Reddit.EnablePostSwipes,
              indent: true,
            },
            {
              key: SettingsKey.Reddit.PostSwipeLongLeft,
              label: t("settings_redditSwipeLongLeft"),
              type: "select",
              options: POST_SWIPE_ACTION_OPTIONS,
              parentKey: SettingsKey.Reddit.EnablePostSwipes,
              indent: true,
            },
          ],
        },
      ],
    },
    {
      id: "twitter",
      domain: "x.com",
      altDomains: ["twitter.com"],
      site: t("settings_twitterSection"),
      items: [
        { key: SettingsKey.Twitter.HideForYouTab, label: t("settings_xHideForYou") },
        { key: SettingsKey.Twitter.HideAds, label: t("settings_xHideAds") },
      ]
    }
  ];

  let settings = $state<Settings>({});
  let activeSiteId = $state<SiteId>(SETTINGS_GROUPS[0].id);
  const pro = useProAccess();
  // The words between ** ** link to the app.
  const [unlockBefore, unlockLink, unlockAfter] = t("phoneWebext_customizationsNote").split(/\*\*(.+?)\*\*/);
  // What applies on sites, so a locked row shows what it does without Pro.
  // Saving still writes `settings`, keeping stored Pro choices for later.
  const effective = $derived(pro.limited ? withoutProSettings(settings) : settings);

  function get(key: string): unknown {
    const val = effective[key];
    return val !== undefined ? val : SETTINGS_DEFAULTS[key];
  }

  /** Locked in the free version on a phone. Settings with some free values lock just the others (see `lockedValues`). */
  function isLocked(item: SettingsItem): boolean {
    return pro.limited && isProSetting(item.key) && !freeValuesOf(item.key);
  }

  function lockedValues(item: MenuChoiceItem): string[] {
    if (!pro.limited) return [];
    return item.options.map((o) => o.value).filter((v) => requiresPro(item.key, v));
  }

  function getTreatment(key: string): ElementTreatment {
    const val = get(key);
    if (
      val === ElementTreatment.Show ||
      val === ElementTreatment.Cover ||
      val === ElementTreatment.Remove
    ) {
      return val;
    }
    return ElementTreatment.Show;
  }

  // Opens the popup on the section for the site in the active tab, if any.
  // tab.url is readable without the "tabs" permission because our
  // <all_urls> content scripts grant host access.
  async function selectSiteForActiveTab(): Promise<void> {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;
      const hostname = new URL(tab.url).hostname;
      for (const group of SETTINGS_GROUPS) {
        const domains = [group.domain, ...(group.altDomains ?? [])];
        if (domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
          activeSiteId = group.id;
          return;
        }
      }
    } catch {
      // Not in a popup context or URL unavailable; keep the default site.
    }
  }

  onMount(async () => {
    selectSiteForActiveTab();
    const stored = await storage.getItem<Settings>(STORAGE_KEY);
    settings = stored ?? {};
  });

  async function persist(): Promise<void> {
    await storage.setItem(STORAGE_KEY, $state.snapshot(settings));
  }

  async function toggle(key: string): Promise<void> {
    settings[key] = !get(key);
    await persist();
  }

  async function setString(key: string, value: string): Promise<void> {
    settings[key] = value;
    await persist();
  }

  async function setMany(values: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(values)) settings[key] = value;
    await persist();
  }

  function findItemByKey(key: string): SettingsItem | undefined {
    for (const group of SETTINGS_GROUPS) {
      for (const item of groupItems(group)) {
        if ("key" in item && item.key === key) return item;
      }
    }
    return undefined;
  }

  function isDevOnly(item: SettingsItem): boolean {
    if ("devOnly" in item && item.devOnly) return true;
    if ("parentKey" in item && item.parentKey) {
      const parent = findItemByKey(item.parentKey);
      return parent ? isDevOnly(parent) : false;
    }
    return false;
  }

  function isItemVisible(item: SettingsItem): boolean {
    if (!import.meta.env.DEV && isDevOnly(item)) return false;
    return !("visibleIf" in item) || !item.visibleIf || item.visibleIf(get);
  }

  /** Whether the item draws a row right now; a section whose items all fail this isn't rendered. */
  function rendersRow(item: SettingsItem): boolean {
    if (!isItemVisible(item)) return false;
    if ("parentKey" in item && item.parentKey && !isParentActive(item.parentKey)) return false;
    if (item.type === "channelList") return !!item.showWhenEmpty || listLength(item) > 0;
    return true;
  }

  // Recurses up the parentKey chain so a grand-child setting (e.g. a post-swipe
  // direction selector) hides whenever any ancestor toggle is off, not just
  // its immediate parent.
  function isParentActive(parentKey: string): boolean {
    const val = get(parentKey);
    let active: boolean;
    if (typeof val === "boolean") active = val;
    else active = val !== undefined && val !== ElementTreatment.Show;
    if (!active) return false;
    const parentItem = findItemByKey(parentKey);
    if (parentItem && "parentKey" in parentItem && parentItem.parentKey) {
      return isParentActive(parentItem.parentKey);
    }
    return true;
  }
</script>

{#snippet labelExtras(item: SettingsItem)}
  {#if item.info}<InfoTip text={item.info} />{/if}
  {#if isLocked(item)}<ProBadge />{/if}
  <!-- Dev builds only (dev-only items are hidden otherwise), so not translated. -->
  {#if isDevOnly(item)}
    <span class="dev-badge" title="DEV-ONLY" aria-label="DEV-ONLY">
      <Wrench size={12} strokeWidth={2.5} aria-hidden="true" />
    </span>
  {/if}
{/snippet}

{#if openList}
<YouTubeChannelListSheet
  title={openList.label}
  description={openList.description}
  sections={listSections(openList)}
  onBack={closeList}
/>
{:else}
<TabHeader
  title={t("settings_title")}
  subtitle={t("settings_webextCustomizationsDescription")}
/>
{#if pro.limited}
  <p class="pro-note">{unlockBefore}<a href={phoneStore().url} target="_blank" rel="noopener noreferrer">{unlockLink}</a>{unlockAfter}</p>
{/if}

<nav class="site-bar" aria-label={t("main_tabSettings")}>
  {#each SETTINGS_GROUPS as group}
    <button
      type="button"
      class="site-tab"
      class:active={activeSiteId === group.id}
      aria-label={group.site}
      aria-pressed={activeSiteId === group.id}
      title={group.site}
      onclick={() => (activeSiteId = group.id)}
    >
      {#if group.id === "instagram"}
        <svg class="site-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793 0 1.44.645 1.44 1.439z"/></svg>
      {:else if group.id === "youtube"}
        <svg class="site-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z"/></svg>
      {:else if group.id === "linkedin"}
        <svg class="site-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z"/></svg>
      {:else if group.id === "reddit"}
        <svg class="site-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
      {:else if group.id === "twitter"}
        <svg class="site-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      {/if}
    </button>
  {/each}
</nav>

{#each SETTINGS_GROUPS as group}
  {#if group.id === activeSiteId}
  <section>
    <h2>
      <a class="site-link" href={`https://www.${group.domain}/`} target="_blank" rel="noopener noreferrer">{group.domain}<SquareArrowUpRight class="launch-icon" size={15} strokeWidth={2.25} aria-hidden="true" /></a>
    </h2>
    {#each groupSections(group) as section}
    {@const items = section.items.filter(rendersRow)}
    {#if items.length > 0}
    <div class="settings-section">
    {#if section.title}<h3 class="section-title">{section.title}</h3>{/if}
    <div class="settings-card">
    {#each items as item}
      {#if item.type === "subredditList"}
        <div class="row row--indent subreddit-list-row">
          <span class="label label--sub">{item.label}{@render labelExtras(item)}</span>
        </div>
        <div class="row--indent subreddit-list-hint">{item.hint}</div>
        <div class="row--indent subreddit-list-input-row">
          <input
            type="text"
            class="text-input"
            placeholder={item.placeholder}
            value={getSubredditInput(item.key)}
            oninput={(e) => setSubredditInput(item.key, (e.target as HTMLInputElement).value)}
            onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubreddit(item.key); } }}
          />
          <button
            type="button"
            class="add-button"
            onclick={() => addSubreddit(item.key)}
            disabled={!sanitizeSubredditInput(getSubredditInput(item.key))}
          >
            {item.addLabel}
          </button>
        </div>
        {#if parseSubredditList(get(item.key)).length === 0}
          <div class="row--indent subreddit-list-empty">{item.emptyLabel}</div>
        {:else}
          <div class="row--indent subreddit-chips">
            {#each parseSubredditList(get(item.key)) as name}
              <span class="subreddit-chip">
                <span class="subreddit-chip-name">r/{name}</span>
                <button
                  type="button"
                  class="subreddit-chip-remove"
                  aria-label={item.removeLabel(name)}
                  onclick={() => removeSubreddit(item.key, name)}
                >×</button>
              </span>
            {/each}
          </div>
        {/if}
      {:else if item.type === "channelList"}
        <button type="button" class="row list-link" onclick={() => (openList = item)}>
          <span class="label">{item.label}{@render labelExtras(item)}</span>
          <span class="list-link-count">{listLength(item)}</span>
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      {:else if item.type === "treatment"}
        <div class="row">
          <span class="label">{item.label}{@render labelExtras(item)}</span>
          <select
            class="select-input"
            disabled={isLocked(item)}
            value={getTreatment(item.key)}
            onchange={(e) => setString(item.key, (e.target as HTMLSelectElement).value)}
          >
            {#each THREE_WAY_TREATMENTS as treatment}
              <option value={treatment}>{ELEMENT_TREATMENT_LABELS[treatment]}</option>
            {/each}
          </select>
        </div>
        {#if getTreatment(item.key) === ElementTreatment.Cover}
          <div class="row row--indent">
            <span class="label label--sub">{t("settings_coverDifficultyRowLabel")}</span>
            <select
              class="select-input"
              value={get(item.coverDifficultyKey) ?? CoverDifficulty.ShortWait}
              onchange={(e) => setString(item.coverDifficultyKey, (e.target as HTMLSelectElement).value)}
            >
              {#each COVER_DIFFICULTY_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        {/if}
      {:else if item.type === "connectionDegree"}
        <div class="row">
          <span class="label">{item.label}{@render labelExtras(item)}</span>
          <select
            class="select-input"
            disabled={isLocked(item)}
            value={getConnectionDegree(item.key)}
            onchange={(e) => setString(item.key, (e.target as HTMLSelectElement).value)}
          >
            {#each CONNECTION_DEGREE_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
        {#if getConnectionDegree(item.key) !== ConnectionDegreeFilter.None}
          <div class="row row--indent">
            <span class="label label--sub">{t("settings_coverDifficultyRowLabel")}</span>
            <select
              class="select-input"
              value={get(item.coverDifficultyKey) ?? CoverDifficulty.ShortWait}
              onchange={(e) => setString(item.coverDifficultyKey, (e.target as HTMLSelectElement).value)}
            >
              {#each COVER_DIFFICULTY_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        {/if}
      {:else if item.type === "select"}
        <div class="row" class:row--indent={item.indent}>
          <span class="label" class:label--sub={item.indent}>{item.label}{@render labelExtras(item)}</span>
          <select
            class="select-input"
            disabled={isLocked(item)}
            value={get(item.key) ?? item.options[0].value}
            onchange={(e) => setString(item.key, (e.target as HTMLSelectElement).value)}
          >
            {#each item.options as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
      {:else if item.type === "multiChoice"}
        <div class="row choice-heading">
          <span class="label">{item.label}{@render labelExtras(item)}</span>
        </div>
        <div class="choice-group">
          {#each item.options as opt}
            <label
              class="choice-card"
              class:choice-card--selected={item.selected(get) === opt.id}
            >
              <input
                type="radio"
                class="choice-radio"
                name={item.key}
                disabled={isLocked(item)}
                checked={item.selected(get) === opt.id}
                onchange={() => setMany(opt.set)}
              />
              <span class="choice-dot"></span>
              <span class="choice-body">
                <span class="choice-title">{opt.label}</span>
                <span class="choice-desc">{opt.description}</span>
              </span>
            </label>
          {/each}
        </div>
      {:else if item.type === "menuChoice"}
        <div class="row choice-heading">
          <span class="label">{item.label}{@render labelExtras(item)}</span>
        </div>
        <div class="menu-choice">
          <OptionMenu
            label={item.label}
            options={item.options}
            value={(get(item.key) as string) ?? item.options[0].value}
            lockedValues={lockedValues(item)}
            onchange={(v) => setString(item.key, v)}
          />
        </div>
        {#if item.hint}
          <div class="row--indent subreddit-list-hint">{item.hint}</div>
        {/if}
      {:else if item.parentKey}
        <label class="row" class:row--indent={item.indent}>
          <span class="label" class:label--sub={item.indent}>{item.label}{@render labelExtras(item)}</span>
          <input
            type="checkbox"
            disabled={isLocked(item)}
            checked={!!get(item.key)}
            onchange={() => toggle(item.key)}
          />
          <span class="toggle"></span>
        </label>
      {:else}
        <label class="row">
          {#if item.description}
            <span class="label-stack">
              <span class="label">{item.label}{@render labelExtras(item)}</span>
              <span class="label-desc">{item.description}</span>
            </span>
          {:else}
            <span class="label">{item.label}{@render labelExtras(item)}</span>
          {/if}
          <input
            type="checkbox"
            disabled={isLocked(item)}
            checked={!!get(item.key)}
            onchange={() => toggle(item.key)}
          />
          <span class="toggle"></span>
        </label>
        {#if item.coverDifficultyKey && !!get(item.key)}
          <div class="row row--indent">
            <span class="label label--sub">{t("settings_coverDifficultyRowLabel")}</span>
            <select
              class="select-input"
              value={get(item.coverDifficultyKey) ?? CoverDifficulty.ShortWait}
              onchange={(e) => setString(item.coverDifficultyKey!, (e.target as HTMLSelectElement).value)}
            >
              {#each COVER_DIFFICULTY_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        {/if}
      {/if}
    {/each}
    </div>
    </div>
    {/if}
    {/each}
  </section>
  {/if}
{/each}
{/if}

<style>
  section {
    padding: 10px 16px 4px;
  }

  .site-bar {
    display: flex;
    align-items: stretch;
    margin: 12px 16px 4px;
    border: 1px solid var(--rl-card-border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--rl-card-bg);
  }

  .site-tab {
    all: unset;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 9px 0;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.55);
    transition: color 0.15s ease, background 0.15s ease;
    border-left: 1px solid var(--rl-card-border);
  }

  .site-tab:first-child {
    border-left: none;
  }

  .site-tab:hover {
    color: rgba(255, 255, 255, 0.9);
  }

  .site-tab.active {
    background: var(--rl-accent-blue);
    color: var(--rl-bg);
  }

  .site-tab.active + .site-tab,
  .site-tab.active {
    border-left-color: transparent;
  }

  .site-tab:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: -3px;
  }

  .site-icon {
    width: 20px;
    height: 20px;
    display: block;
  }

  h2 {
    margin: 0 0 14px;
    font-family: var(--rl-font-title);
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.3px;
    line-height: 1.2;
  }

  .site-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--rl-accent-blue);
    text-decoration: none;
  }

  .site-link :global(.launch-icon) {
    flex-shrink: 0;
  }

  .site-link:hover {
    text-decoration: underline;
  }

  .site-link:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 2px;
    border-radius: 2px;
  }

  /* ── Sections: small-caps heading over a card of rows ───────── */

  .settings-section + .settings-section {
    margin-top: 16px;
  }

  .section-title {
    margin: 0 0 6px 2px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--rl-subtitle);
  }

  .settings-card {
    padding: 0 12px;
    border: 1px solid var(--rl-card-border);
    border-radius: 12px;
    background: var(--rl-card-bg);
  }

  /* The card edge replaces the last row's divider, whatever kind of row it is. */
  .settings-card > :last-child {
    border-bottom: none;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 24px;
    padding: 10px 0;
    cursor: pointer;
    border-bottom: 1px solid var(--rl-divider);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row--indent {
    padding-left: 16px;
  }

  .dev-badge {
    display: inline-flex;
    vertical-align: -1px;
    margin-left: 6px;
    color: #f5c542;
    cursor: help;
  }

  .label--sub {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
  }

  .label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
    user-select: none;
  }

  /* A label with a description line under it (same muted style as the
     option cards' descriptions); the toggle stays centred beside both. */
  .label-stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .label-desc {
    font-size: 12px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.55);
    user-select: none;
  }

  input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle {
    position: relative;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
    transition: background 0.2s ease;
  }

  .toggle::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    transition:
      left 0.2s ease,
      background 0.2s ease;
  }

  input:checked ~ .toggle {
    background: var(--rl-accent-blue);
  }

  input:checked ~ .toggle::after {
    left: 19px;
    background: #fff;
  }

  /* Locked in the free version on a phone (see isLocked). */
  .row:has(input:disabled),
  .choice-card:has(input:disabled) {
    cursor: default;
  }

  input:disabled ~ .toggle,
  .choice-card:has(input:disabled),
  .select-input:disabled {
    opacity: 0.45;
  }

  .pro-note {
    margin: 4px 16px 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--rl-subtitle);
  }

  .choice-heading {
    border-bottom: none;
    padding-bottom: 4px;
    cursor: default;
  }

  .choice-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 0 10px;
    border-bottom: 1px solid var(--rl-divider);
  }

  .menu-choice {
    padding: 0 0 10px;
    border-bottom: 1px solid var(--rl-divider);
  }

  .choice-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--rl-control-border);
    border-radius: 10px;
    background: var(--rl-control-bg);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .choice-card:hover {
    background: var(--rl-control-bg-hover);
  }

  .choice-card--selected,
  .choice-card--selected:hover {
    border-color: var(--rl-accent-blue);
    background: color-mix(in srgb, var(--rl-accent-blue) 12%, transparent);
  }

  .choice-radio {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .choice-dot {
    position: relative;
    flex-shrink: 0;
    margin-top: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.35);
    transition: border-color 0.15s ease;
  }

  .choice-radio:checked ~ .choice-dot {
    border-color: var(--rl-accent-blue);
  }

  .choice-radio:checked ~ .choice-dot::after {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--rl-accent-blue);
  }

  .choice-radio:focus-visible ~ .choice-dot {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 2px;
  }

  .choice-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .choice-title {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .choice-desc {
    font-size: 12px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.55);
  }

  .select-input {
    padding: 5px 8px;
    font-size: 13px;
  }

  .subreddit-list-row {
    padding-bottom: 4px;
    border-bottom: none;
  }

  .subreddit-list-hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    padding-bottom: 8px;
  }

  .subreddit-list-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
  }

  .text-input {
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    outline: none;
  }

  .text-input:focus {
    border-color: var(--rl-accent-blue);
  }

  .add-button {
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: var(--rl-accent-blue);
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  }

  /* A .row that is a <button>: keep .row's layout, drop the button chrome. */
  .list-link {
    box-sizing: border-box;
    width: 100%;
    gap: 8px;
    border: none;
    border-bottom: 1px solid var(--rl-divider);
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .list-link-count {
    margin-left: auto;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.45);
  }

  .add-button:disabled {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.4);
    cursor: not-allowed;
  }

  .subreddit-list-empty {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
    font-style: italic;
    padding-bottom: 10px;
  }

  .subreddit-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 10px;
  }

  .subreddit-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 4px 4px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.9);
  }

  .subreddit-chip-name {
    user-select: none;
  }

  .subreddit-chip-remove {
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .subreddit-chip-remove:hover {
    background: rgba(255, 255, 255, 0.25);
  }
</style>
