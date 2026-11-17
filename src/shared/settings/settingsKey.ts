/**
 * Canonical setting keys – import these instead of using raw strings.
 *
 * Hidden settings: some site changes are fixes nobody needs to configure
 * (e.g. removing an "Open the app" nudge). They still get their own key here,
 * default to on in SETTINGS_DEFAULTS, and are left out of the settings UI.
 * Every distinct piece of DOM-changing code should sit behind its own key like
 * this, so it can be switched off on its own (for example by a future remote
 * config) if a site redesign makes it misbehave. Read them with
 * `settings[key] ?? SETTINGS_DEFAULTS[key]` so a missing value means "on".
 */
export const SettingsKey = {
  General: {
    SessionTimer: "general.sessionTimer",
    BreathDuration: "general.breathDuration",
    /** Max gap between sessions for them to count as one back-to-back chain. */
    QuickReturnGapSeconds: "general.quickReturn.gapSeconds",
    /** How long session starts are paused once the chain trips the guard. */
    QuickReturnPauseSeconds: "general.quickReturn.pauseSeconds",
  },
  Instagram: {
    ReelsTab: "instagram.reelsTab",
    HomeTab: "instagram.homeTab",
    HomeFeed: "instagram.homeFeed",
    /** Hide Instagram's link back to its Default feed (non-Default feeds only). */
    HomeFeedHideDefaultLink: "instagram.homeFeed.hideDefaultLink",
    Comments: "instagram.comments",
    CommentsExemptFollowing: "instagram.commentsExemptFollowing",
    Stories: "instagram.stories",
    StoriesCoverDifficulty: "instagram.stories.coverDifficulty",
    ExploreFeedStrangers: "instagram.exploreFeedStrangers",
    ExploreFeedStrangersCoverDifficulty:
      "instagram.exploreFeedStrangers.coverDifficulty",
    FeedVideos: "instagram.feedVideos",
    FeedVideosCoverDifficulty: "instagram.feedVideos.coverDifficulty",
    FeedVideosExemptFollowing: "instagram.feedVideosExemptFollowing",
    GuardAds: "instagram.guardAds",
    GuardAdsCoverDifficulty: "instagram.guardAds.coverDifficulty",
    GreyscalePictures: "instagram.greyscalePictures",
    GreyscaleVideos: "instagram.greyscaleVideos",
    /** Hide the Explore page's post grid; the search box stays usable. */
    ExploreTiles: "instagram.exploreTiles",
    // Hidden settings (on by default, not shown in the UI; see top of file)
    /** Hide the mobile-web "Use the app" banner. */
    HideUseAppBanner: "instagram.hideUseAppBanner",
    /** Hide "Open Instagram" app buttons on the sign-up page and app promo. */
    HideOpenAppButton: "instagram.hideOpenAppButton",
    /** Make reels shared in DMs open on the web instead of doing nothing. */
    FixDmReelLinks: "instagram.fixDmReelLinks",
  },
  YouTube: {
    DisableAutoplay: "youtube.disableAutoplay",
    Shorts: "youtube.shorts",
    ShortsTab: "youtube.shortsTab",
    HomeTab: "youtube.homeTab",
    RedirectHomeToSubscriptions: "youtube.redirectHomeToSubscriptions",
    HideEndCard: "youtube.hideEndCard",
    RecommendedVideos: "youtube.recommendedVideos",
    RecommendedVideosCoverDifficulty:
      "youtube.recommendedVideos.coverDifficulty",
    DisplayMode: "youtube.displayMode",
    ThumbnailFilter: "youtube.thumbnailFilter",
    DisableVideoPreviews: "youtube.disableVideoPreviews",
    MakeAdsSkippable: "youtube.makeAdsSkippable",
    /** Hide channels' posts (text and image updates) from the Home feed. */
    HideHomeFeedPosts: "youtube.hideHomeFeedPosts",
    /** Hidden: greyscale post images whenever a thumbnail filter is set. */
    GreyscalePostImages: "youtube.greyscalePostImages",
    /** An AiContentTreatment for videos from AI-content channels. */
    AiContent: "youtube.aiContent",
    /** AiChannelEntry[]: channels the user marked as AI. */
    AiBlockedChannels: "youtube.aiContent.blockedChannels",
    /** AiChannelEntry[]: channels the user marked as not AI; beats every list. */
    AiAllowedChannels: "youtube.aiContent.allowedChannels",
    /** AiChannelEntry[]: channels hidden everywhere, AI or not. Local only. */
    BlockedChannels: "youtube.blockedChannels",
    /**
     * string[]: local days (YYYY-MM-DD) the "Shorts removed" notice was shown.
     * Written from YouTube pages; no UI. The notice stops after a few days.
     */
    ShortsRemovedBadgeDays: "youtube.shortsRemovedBadge.days",
    /** true once the user closed a "Shorts removed" notice; it stops showing. */
    ShortsRemovedBadgeDismissed: "youtube.shortsRemovedBadge.dismissed",
  },
  LinkedIn: {
    ConnectionDegreeFilter: "linkedin.connectionDegreeFilter",
    ConnectionDegreeFilterCoverDifficulty:
      "linkedin.connectionDegreeFilter.coverDifficulty",
    HidePromotedPosts: "linkedin.hidePromotedPosts",
    HidePromotedPostsCoverDifficulty:
      "linkedin.hidePromotedPosts.coverDifficulty",
    HideMediaInFeed: "linkedin.hideMediaInFeed",
    GreyscalePictures: "linkedin.greyscalePictures",
    GreyscaleVideos: "linkedin.greyscaleVideos",
    // Hidden settings (on by default, not shown in the UI; see top of file)
    /** Hide the "Download the app" modal and promo, and restore scrolling. */
    HideDownloadAppPrompts: "linkedin.hideDownloadAppPrompts",
  },
  Reddit: {
    UseOldReddit: "reddit.old",
    MakeOldRedditMobileFriendly: "reddit.mobileFriendly",
    MoveVoteCountUnderPosts: "reddit.moveVoteCountUnderPosts",
    HideOldRedditThumbnails: "reddit.hideOldThumbnails",
    ExpandMediaByDefault: "reddit.expandMediaByDefault",
    AllowedCustomCssSubreddits: "reddit.allowedCustomCssSubreddits",
    ColorCodeCommentDepth: "reddit.colorCodeCommentDepth",
    /** A RedditFeedVisibility: which feeds are replaced with a note. */
    HideFeeds: "reddit.hideFeeds",
    /** New reddit: drop posts from communities you haven't joined from Home. */
    HomeJoinedOnly: "reddit.homeJoinedOnly",
    /** Post images, thumbnails, link previews and videos, old and new reddit. */
    GreyscaleMedia: "reddit.greyscaleMedia",
    EnableCommentSwipes: "reddit.commentSwipes",
    SwipeShortRight: "reddit.swipe.shortRight",
    SwipeLongRight: "reddit.swipe.longRight",
    SwipeShortLeft: "reddit.swipe.shortLeft",
    SwipeLongLeft: "reddit.swipe.longLeft",
    EnablePostSwipes: "reddit.postSwipes",
    PostSwipeShortRight: "reddit.postSwipe.shortRight",
    PostSwipeLongRight: "reddit.postSwipe.longRight",
    PostSwipeShortLeft: "reddit.postSwipe.shortLeft",
    PostSwipeLongLeft: "reddit.postSwipe.longLeft",
    // Hidden settings (on by default, not shown in the UI; see top of file)
    /**
     * New reddit's app wall / NSFW wall workarounds. Also gated by
     * compile-time switches in reddit.ts, which are currently off.
     */
    NeutralizeBlockingGates: "reddit.neutralizeBlockingGates",
  },
  Twitter: {
    HideForYouTab: "twitter.hideForYouTab",
    HideAds: "twitter.hideAds",
  },
  TikTok: {
    // Hidden settings (on by default, not shown in the UI; see top of file)
    /** Dismiss (or else hide) the "Open TikTok" app modal. */
    DismissOpenAppModal: "tiktok.dismissOpenAppModal",
  },
} as const;
