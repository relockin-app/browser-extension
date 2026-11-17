export enum ElementTreatment {
  Show = "show",
  Cover = "cover",
  Remove = "remove",
}

export enum CoverDifficulty {
  Instant = "instant",
  ShortWait = "shortWait",
  LongWait = "longWait",
  Permanent = "permanent",
  Challenge = "challenge",
}

/** How YouTube videos from AI-content channels are treated. */
export enum AiContentTreatment {
  Off = "off",
  Badge = "badge",
  Cover = "cover",
  Hide = "hide",
}

export enum DisplayMode {
  Default = "default",
  Mobile = "mobile",
  Desktop = "desktop",
}

export enum ThumbnailFilter {
  Visible = "visible",
  LightlyBlurred = "lightlyBlurred",
  HeavilyBlurred = "heavilyBlurred",
  Greyscale = "greyscale",
  Black = "black",
}

/** Which Instagram feed Home opens. Following / Favorites double as the
 * `?variant=` query value Instagram uses for those feeds; Default is its plain
 * algorithmic feed (no variant). */
export enum InstagramHomeFeed {
  Default = "default",
  Following = "following",
  Favorites = "favorites",
}

/** Which Reddit feeds are hidden. Each level hides everything the one before
 * it does: Discovery covers r/all, r/popular, Explore and News; All also
 * covers Home and custom feeds. */
export enum RedditFeedVisibility {
  ShowAll = "showAll",
  HideDiscovery = "hideDiscovery",
  HideAll = "hideAll",
}

export enum ConnectionDegreeFilter {
  None = "none",
  Max2nd = "max2nd",
  Max1st = "max1st",
}

export enum SwipeGestureAction {
  Upvote = "upvote",
  Downvote = "downvote",
  Collapse = "collapse",
  Reply = "reply",
  Save = "save",
}

export enum PostSwipeAction {
  Upvote = "upvote",
  Downvote = "downvote",
  Hide = "hide",
  Share = "share",
  Save = "save",
  OpenComments = "openComments",
  OpenSource = "openSource",
  ExpandPreview = "expandPreview",
}
