import { SettingsKey } from "./settingsKey";
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
import { isWebExtPlatform } from "../platform/platform";

/** Default values for settings that need them. */
export const SETTINGS_DEFAULTS: Record<string, unknown> = {
  [SettingsKey.General.SessionTimer]: true,
  [SettingsKey.General.BreathDuration]: 3,
  [SettingsKey.General.QuickReturnGapSeconds]: 60,
  [SettingsKey.General.QuickReturnPauseSeconds]: 60,

  // 3-way treatment settings (Show / Cover / Remove)
  [SettingsKey.Instagram.Stories]: ElementTreatment.Show,
  [SettingsKey.Instagram.StoriesCoverDifficulty]: CoverDifficulty.ShortWait,
  [SettingsKey.YouTube.RecommendedVideos]: ElementTreatment.Show,
  [SettingsKey.YouTube.RecommendedVideosCoverDifficulty]:
    CoverDifficulty.ShortWait,

  // Existing users keep Instagram's own feed; switching Home to Following or
  // Favorites is opt-in.
  [SettingsKey.Instagram.HomeFeed]: InstagramHomeFeed.Default,

  // Hidden settings: always on unless switched off outside the UI.
  [SettingsKey.Instagram.HideUseAppBanner]: true,
  [SettingsKey.Instagram.HideOpenAppButton]: true,
  [SettingsKey.Instagram.FixDmReelLinks]: true,
  [SettingsKey.LinkedIn.HideDownloadAppPrompts]: true,
  [SettingsKey.Reddit.NeutralizeBlockingGates]: true,
  [SettingsKey.TikTok.DismissOpenAppModal]: true,
  [SettingsKey.YouTube.GreyscalePostImages]: true,

  // 2-way toggles with paired cover difficulty (Cover-when-on)
  [SettingsKey.Instagram.ExploreFeedStrangersCoverDifficulty]:
    CoverDifficulty.ShortWait,
  [SettingsKey.Instagram.FeedVideosCoverDifficulty]: CoverDifficulty.ShortWait,
  [SettingsKey.Instagram.GuardAdsCoverDifficulty]: CoverDifficulty.ShortWait,
  [SettingsKey.LinkedIn.ConnectionDegreeFilter]: ConnectionDegreeFilter.None,
  [SettingsKey.LinkedIn.ConnectionDegreeFilterCoverDifficulty]:
    CoverDifficulty.ShortWait,
  [SettingsKey.LinkedIn.HidePromotedPostsCoverDifficulty]:
    CoverDifficulty.ShortWait,

  [SettingsKey.YouTube.DisplayMode]: DisplayMode.Default,
  [SettingsKey.YouTube.ThumbnailFilter]: ThumbnailFilter.Visible,
  // Full blocking is free on desktop; on mobile the free tier is the label.
  [SettingsKey.YouTube.AiContent]: isWebExtPlatform()
    ? AiContentTreatment.Cover
    : AiContentTreatment.Badge,

  // On mobile, we want to auto bring people to our old reddit redesign (Zen) by default
  [SettingsKey.Reddit.UseOldReddit]: !isWebExtPlatform(),
  [SettingsKey.Reddit.MakeOldRedditMobileFriendly]: !isWebExtPlatform(),
  
  [SettingsKey.Reddit.AllowedCustomCssSubreddits]: "",
  [SettingsKey.Reddit.HideFeeds]: RedditFeedVisibility.ShowAll,
  [SettingsKey.Reddit.HomeJoinedOnly]: false,
  [SettingsKey.Reddit.EnableCommentSwipes]: true,
  [SettingsKey.Reddit.SwipeShortRight]: SwipeGestureAction.Upvote,
  [SettingsKey.Reddit.SwipeLongRight]: SwipeGestureAction.Downvote,
  [SettingsKey.Reddit.SwipeShortLeft]: SwipeGestureAction.Save,
  [SettingsKey.Reddit.SwipeLongLeft]: SwipeGestureAction.Collapse,
  [SettingsKey.Reddit.EnablePostSwipes]: false,
  [SettingsKey.Reddit.MoveVoteCountUnderPosts]: false,
  [SettingsKey.Reddit.ExpandMediaByDefault]: false,
  [SettingsKey.Reddit.PostSwipeShortRight]: PostSwipeAction.Upvote,
  [SettingsKey.Reddit.PostSwipeLongRight]: PostSwipeAction.Downvote,
  [SettingsKey.Reddit.PostSwipeShortLeft]: PostSwipeAction.Save,
  [SettingsKey.Reddit.PostSwipeLongLeft]: PostSwipeAction.ExpandPreview,
};
