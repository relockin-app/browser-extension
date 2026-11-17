import { t } from "~/lib/i18n";
import type { RelockrSettings } from "@/types/RelockrSettings";
import {
  ElementTreatment,
  CoverDifficulty,
  InstagramHomeFeed,
} from "@/types/enums";
import { hideElement } from "./domUtils";
import { applyCover } from "./coverElement";
import { SettingsKey } from "../settings/settingsKey";
import { isHiddenSettingOn } from "./utils/hiddenSetting";
import { formatList } from "../overlayUI/utils/intlFormat";
import { extractInstagramReelUrlFromImageIfPresent } from "./utils/extractInstagramReelUrlFromImageIfPresent";
import { applyInstagramHomeFeed } from "./instagramHomeFeed";
import { SITE_LABELS } from "./generated/siteLabels";
import { setMediaGreyscale } from "./utils/mediaGreyscale";
import { setHiddenBySelectors } from "./utils/hiddenStylesheet";
import { rlog } from "../rlog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyTreatment(
  el: Element,
  treatment: ElementTreatment,
  difficulty: CoverDifficulty,
  label: string,
  coverSubtitle?: string,
): void {
  if (treatment === ElementTreatment.Remove) {
    hideElement(el, label);
  } else if (treatment === ElementTreatment.Cover) {
    applyCover(el, label, coverSubtitle, difficulty);
  }
}

/**
 * Best-effort detection of the logged-in username.
 * Instagram renders a profile link in the bottom nav (mobile) or side nav
 * (desktop) whose href is "/<username>/".
 */
function getLoggedInUsername(): string | null {
  // Desktop: side-nav profile link with "Profile" accessible text
  const profileLink =
    document.querySelector<HTMLAnchorElement>(
      'nav a[href^="/"]:has(img[data-testid="user-avatar"])',
    ) ??
    document
      .querySelector<HTMLAnchorElement>(
        'a[href^="/"][role="link"] span img[alt]',
      )
      ?.closest("a");

  if (profileLink) {
    const match = profileLink.getAttribute("href")?.match(/^\/([^/]+)\/$/);
    if (match) return match[1];
  }
  return null;
}

function getPostAuthors(article: Element): string[] {
  const seen = new Set<string>();
  const authors: string[] = [];

  // Profile links use role="link", tabindex="0" (tag overlays use -1),
  // and href like /<username>/ with optional query params.
  const links = article.querySelectorAll<HTMLAnchorElement>(
    'article > div:first-of-type > div:first-of-type a[role="link"][href^="/"]',
  );

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) continue;

    const match = href.match(/^\/([a-zA-Z0-9._]+)\/?(?:\?.*)?$/);
    if (!match) continue;

    const username = match[1];
    const reserved = [
      "explore",
      "p",
      "reels",
      "stories",
      "accounts",
      "direct",
      "tags",
      "about",
      "developer",
      "legal",
    ];
    if (reserved.includes(username)) continue;

    const lower = username.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    authors.push(username);
  }

  return authors;
}

function formatAuthors(authors: string[]): string {
  return formatList(authors);
}

/**
 * The logged-out login/sign-up page renders its promo card as an <article>.
 * Real posts never contain the Instagram wordmark (the nav logo lives outside
 * the article), and always have author links; the promo has no links at all.
 */
function isInstagramLoginPromo(article: Element): boolean {
  // Logo has been rendered as both <i> and <svg> across page versions
  if (article.querySelector("[role='img'][aria-label='Instagram']")) {
    return true;
  }
  return (
    article.querySelector("h1") !== null &&
    article.querySelector("a[href]") === null
  );
}

/**
 * The post detail "popup" (clicking a feed post opens it in a lightbox) renders
 * its own <article> inside a modal dialog. We only want to treat articles that
 * live in the actual feed, so skip anything nested in a modal.
 */
function isInModalDialog(el: Element): boolean {
  return el.closest('[role="dialog"], [aria-modal="true"]') !== null;
}

/**
 * Stable identifiers for a post, used to remember cover dismissals across
 * re-renders (feed -> comments/detail view renders a brand-new <article>).
 * Returns every id we can find; a dismissal matches if any of them overlap,
 * since the feed and detail views don't always expose the same ones.
 */
function getPostKeys(article: Element): string[] {
  const keys = new Set<string>();

  for (const link of article.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href") ?? "";

    // Ads/CTA links carry the media pk: a_mpk=<mediaPk>_<ownerId>
    const mpk = href.match(/[?&]a_mpk=(\d+)/);
    if (mpk) keys.add(`ig:pk:${mpk[1]}`);

    // Permalinks, incl. comment permalinks /p/<shortcode>/c/<id>/
    const shortcode = href.match(
      /^(?:https?:\/\/[^/]+)?\/(?:p|reel)\/([\w-]+)\//,
    );
    if (shortcode) keys.add(`ig:sc:${shortcode[1]}`);
  }

  // Media URLs carry ig_cache_key=base64(<mediaPk>).<suffix>
  for (const media of article.querySelectorAll<
    HTMLImageElement | HTMLVideoElement
  >("img[src*='ig_cache_key'], video[src*='ig_cache_key']")) {
    try {
      const cacheKey = new URL(media.src).searchParams.get("ig_cache_key");
      const pk = cacheKey ? atob(cacheKey.split(".")[0]) : "";
      if (/^\d+$/.test(pk)) keys.add(`ig:pk:${pk}`);
    } catch {
      // Malformed URL or base64 — ignore
    }
  }

  return [...keys];
}

function getPostDescription(article: Element): string | null {
  const candidateSpan = article.querySelector(
    "article span div[style='display: inline;'] span[dir='auto']",
  );
  if (!candidateSpan) return null;
  const descriptionText = candidateSpan.textContent;
  if (!descriptionText || descriptionText.trim().length === 0) return null;
  return descriptionText;
}

function hasSuggestedForYouIndicator(article: Element): boolean {
  const spans = article.querySelectorAll<HTMLSpanElement>(
    "article > div:first-of-type > div:first-of-type span[style='line-height: 16px;']",
  );
  return [...spans].some((span) => span.children.length === 0);
}

function isPostFromFollowedAccount(article: Element): boolean {
  // "Suggested for you" indicator means definitely not from a followed account
  if (hasSuggestedForYouIndicator(article)) return false;
  // If follow button exists, it is first match for this query selector in the article
  const potentialFollowButton = article.querySelector(
    "article div div div div div div[role='button']",
  );
  // Follow button only has text child. If there are html children, first match was not follow button - was a svg button - so ignore.
  if (!potentialFollowButton) {
    return false; // This is not expected. Usually there are also matches for "More", Like/Comment/Send
  }
  if (potentialFollowButton.childElementCount === 0) {
    return false; // Follow button just has text "Follow". Other matching buttons have HTML children
  }
  // If no "Follow" button found, assume the user follows this account
  return true;
}

function shouldExemptPost(
  article: Element,
  exemptFollowing: boolean,
  loggedInUser: string | null,
): boolean {
  // Always exempt own posts
  if (loggedInUser) {
    const authors = getPostAuthors(article);
    if (authors.some((a) => a.toLowerCase() === loggedInUser.toLowerCase())) {
      return true;
    }
  }
  // Exempt followed accounts if toggle is on
  if (exemptFollowing && isPostFromFollowedAccount(article)) {
    return true;
  }
  return false;
}

const NAV_TABS_STYLE_ID = "relockr-ig-hidden-nav-tabs";

/** Hides the Reels and Home tabs with a stylesheet (see setHiddenBySelectors). */
export function applyInstagramNavTabStyles(settings: RelockrSettings): void {
  setHiddenBySelectors(NAV_TABS_STYLE_ID, [
    ...(settings[SettingsKey.Instagram.ReelsTab]
      ? ["a[href='/reels/'][tabindex*='0']"]
      : []),
    ...(settings[SettingsKey.Instagram.HomeTab]
      ? ["a[href='/'][tabindex*='0']"]
      : []),
  ]);
}

/**
 * Hides the "Open Instagram" / "Open the Instagram app" buttons shown on the
 * logged-out sign-up page and the tablet/app-promo interstitial. These nudge
 * the user into the native app and appear regardless of sign-in state.
 * Hidden setting: on by default.
 */
function hideInstagramOpenAppButton(node: Element): void {
  const selectors = [
    // Sign-up / login page (logo has been rendered as both <i> and <svg>)
    'main[role="main"] article:has([role="img"][aria-label="Instagram"]) button[type="button"]',
    // Tablet app promo / sign-in interstitial
    'div:has(> svg[role="img"][aria-label="Instagram"]):has(button, [role="button"]) :is(button, [role="button"])',
  ];

  for (const selector of selectors) {
    for (const element of node.querySelectorAll<Element>(selector)) {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!/instagram/i.test(text)) continue;

      hideElement(element, "Instagram Open App Button");
      return; // Only the first matching button.
    }
  }
}

function hideInstagramComments(node: Element, exemptFollowing: boolean): void {
  const loggedInUser = getLoggedInUsername();

  const articles = node.querySelectorAll<Element>("article");
  for (const article of articles) {
    if (shouldExemptPost(article, exemptFollowing, loggedInUser)) continue;

    const commentSymbolButton = article.querySelectorAll<Element>(
      "article section div[role='button']",
    )[1];
    if (!commentSymbolButton) continue;
    hideElement(commentSymbolButton, "Instagram Comments");

    const commentIconSpan = commentSymbolButton.closest("span");
    const commentCountButton =
      commentIconSpan?.nextElementSibling instanceof HTMLSpanElement &&
      commentIconSpan.nextElementSibling.getAttribute("role") === "button"
        ? commentIconSpan.nextElementSibling
        : null;

    if (commentCountButton) {
      hideElement(commentCountButton, "Instagram Comments");
    }
  }
}

function applyInstagramStories(
  node: Element,
  treatment: ElementTreatment,
  difficulty: CoverDifficulty,
): void {
  // The stories tray is a horizontal scrollable section at the top of the feed.
  // It's typically rendered as a container with role="menu" or a section with
  // canvas/button elements for each story circle.
  const selectors = [
    'div[data-pagelet="story_tray"]',
    'div[data-pagelet="story_tray_rail_q3"]',
    'div[data-testid="stories-tray"]', // Testid variant (if present)
  ];

  for (const selector of selectors) {
    const tray = node.querySelector<Element>(selector);
    if (tray) {
      applyTreatment(
        tray,
        treatment,
        difficulty,
        t("domShared_instagramCoverStoriesTitle"),
      );
      return;
    }
  }
}

function coverInstagramExploreFeedStrangers(
  node: Element,
  difficulty: CoverDifficulty,
): void {
  const articles = node.querySelectorAll<Element>(
    "article[role='presentation'], article",
  );
  for (const article of articles) {
    if (isInstagramLoginPromo(article)) continue;
    if (isPostFromFollowedAccount(article)) continue;

    const authors = getPostAuthors(article);
    const title = t("domShared_instagramCoverStrangerPostTitle");

    const authorDescription =
      authors.length > 0
        ? `${t("domShared_instagramCoverByAuthorFormat", formatAuthors(authors))}\n\n`
        : "";
    const description = `${authorDescription}${getPostDescription(article) ?? ""}`;
    applyCover(
      article,
      title,
      description,
      difficulty,
      1,
      () => getPostKeys(article),
      "blur",
    );
  }
}

function coverInstagramFeedVideos(
  node: Element,
  difficulty: CoverDifficulty,
  exemptFollowing: boolean,
): void {
  const loggedInUser = getLoggedInUsername();

  const articles = node.querySelectorAll<Element>(
    "article[role='presentation'], article",
  );
  for (const article of articles) {
    // Only target articles that contain a video element
    if (!article.querySelector("video")) continue;
    // Skip the post-detail lightbox; only cover videos in the actual feed
    if (isInModalDialog(article)) continue;
    if (shouldExemptPost(article, exemptFollowing, loggedInUser)) continue;

    const authors = getPostAuthors(article);
    const title = t("domShared_instagramCoverVideoTitle");

    const authorDescription =
      authors.length > 0
        ? `${t("domShared_instagramCoverByAuthorFormat", formatAuthors(authors))}\n\n`
        : "";
    const description = `${authorDescription}${getPostDescription(article) ?? ""}`;
    applyCover(
      article,
      title,
      description,
      difficulty,
      1,
      () => getPostKeys(article),
      "blur",
    );
  }
}

const SPONSORED_LABELS = new Set<string>(
  SITE_LABELS.instagramSponsored.map((label) => label.toLowerCase()),
);

function coverInstagramAds(node: Element, difficulty: CoverDifficulty): void {
  const articles = node.querySelectorAll<Element>(
    "article[role='presentation'], article",
  );
  for (const article of articles) {
    // Skip the post-detail lightbox (e.g. comments view); reaching it is
    // already a deliberate action, and the article there is click-to-open-ad.
    if (isInModalDialog(article)) continue;

    // Instagram ads contain a small "Sponsored" link in the post header, usually
    // pointing to an ad-related URL. Otherwise match its text in any language
    // RelockIn supports: Instagram's language can differ from the app's.
    const sponsoredLink = article.querySelector<HTMLAnchorElement>(
      'a[href*="paid_partnership"], a[href*="/ads/"], a[href*="ads_hidden_context_mobile"]',
    );
    const sponsoredByText = !sponsoredLink
      ? Array.from(article.querySelectorAll("article header a span")).find(
          (span) => SPONSORED_LABELS.has(span.textContent?.trim().toLowerCase() ?? ""),
        )
      : null;

    if (!sponsoredLink && !sponsoredByText) continue;

    const authors = getPostAuthors(article);
    const title = t("domShared_instagramCoverAdTitle");

    const authorDescription =
      authors.length > 0
        ? `${t("domShared_instagramCoverByAuthorFormat", formatAuthors(authors))}\n\n`
        : "";
    const description = `${authorDescription}${getPostDescription(article)}`;
    applyCover(
      article,
      title,
      description,
      difficulty,
      1,
      () => getPostKeys(article),
      "blur",
    );
  }
}

function fixDmReelsNotOpening() {
  const candidateButtons = Array.from(
    document.querySelectorAll("div[role='none'] div[role='button']"),
  );
  const postsOrReels = candidateButtons.filter((b) => b.clientHeight > 100);

  const images = postsOrReels.map((p) => {
    const imgs = p.querySelectorAll("img");
    if (imgs.length === 0) return null;
    return imgs[imgs.length - 1];
  });

  const reelUrls = images.map((i) =>
    i ? extractInstagramReelUrlFromImageIfPresent(i.src) : null,
  );

  for (let i = 0; i < postsOrReels.length; i += 1) {
    const reelUrl = reelUrls[i];
    if (!reelUrl) continue;
    const btnDiv = postsOrReels[i];
    if ((btnDiv as any)._reelFixed) continue;
    rlog("Instagram: fixed a DM reel link");

    btnDiv.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = reelUrl;
      },
      true, // capture phase → beats Instagram handler
    );
    (btnDiv as any)._reelFixed = true;
  }
}

/**
 * Hides the "Use the app" banner that mobile web shows at the bottom of every
 * tab. Matched by shape rather than text or class names, so it works in any
 * language: a text-only <button> next to an icon-only [role=button] (the close
 * X), in a small container with no links, inputs or media, outside <main>.
 */
function hideInstagramUseAppBanner(node: Element): void {
  for (const button of node.querySelectorAll<HTMLButtonElement>(
    'button[type="button"]',
  )) {
    if (button.childElementCount > 0 || !button.textContent?.trim()) continue;
    if (button.closest('main, nav, [role="dialog"], [data-hide-reason]')) {
      continue;
    }

    // Lowest ancestor (a few levels up) that also holds the close button.
    let banner: Element | null = button.parentElement;
    let found = false;
    for (let i = 0; banner && i < 3; i++) {
      if (banner.querySelector('[role="button"]:has(> * > svg, > svg)')) {
        found = true;
        break;
      }
      banner = banner.parentElement;
    }
    if (!banner || !found) continue;
    let target: Element = banner;
    if (target.querySelector("a[href], input, img, video, main, section")) {
      continue;
    }

    // Take wrapper divs that hold nothing but the banner, so no empty bar is
    // left behind. Stop before any container that holds other content.
    for (let i = 0; i < 3; i++) {
      const parent: Element | null = target.parentElement;
      if (!parent || parent.childElementCount !== 1 || parent === document.body) {
        break;
      }
      target = parent;
    }
    hideElement(target, "Instagram Use App Banner");
  }
}

const GREYSCALE_STYLE_ID = "relockr-ig-media-greyscale";

/** Post tiles in grids (Explore, profiles, hashtag pages) link to the post. */
const IG_POST_TILE = 'main :is(a[href^="/p/"], a[href^="/reel/"])';

/**
 * Greyscale post media only. Profile pictures (post header, "Liked by" avatars)
 * are marked draggable="false"; post photos and video posters are not.
 * Grid tiles aren't <article>s, so they're matched by their post link.
 */
export function applyInstagramMediaGreyscale(settings: RelockrSettings): void {
  const selectors: string[] = [];
  if (settings[SettingsKey.Instagram.GreyscalePictures]) {
    selectors.push(
      'article img:not([draggable="false"])',
      `${IG_POST_TILE} img:not([draggable="false"])`,
      'article img[data-visualcompletion="media-vc-z8"]',
    );
  }
  if (settings[SettingsKey.Instagram.GreyscaleVideos]) {
    // The poster <img> sits next to the <video> until playback starts.
    selectors.push(
      "article video",
      'article :has(> video) > img:not([draggable="false"])',
      `${IG_POST_TILE} video`,
    );
  }
  setMediaGreyscale(GREYSCALE_STYLE_ID, selectors);
}

const EXPLORE_TILES_STYLE_ID = "relockr-ig-explore-tiles";

/**
 * Hides the post grid on the Explore page (/explore/), leaving search usable.
 * Done with one stylesheet that only exists while on /explore/, since
 * Instagram is an SPA and the same DOM classes are reused elsewhere.
 *
 * Targets any container in <main> that holds post/reel links but not the
 * search <input>: the outermost such element is the grid wrapper, which also
 * holds the infinite-scroll spinner, so hiding it stops further loading and
 * keeps tile videos from autoplaying. No class names or text are used, so it
 * works in every language. Hashtag/location results (/explore/tags/...) are
 * left alone: they're reached by searching.
 */
export function applyInstagramExploreTiles(settings: RelockrSettings): void {
  const existing = document.getElementById(EXPLORE_TILES_STYLE_ID);
  const onExplore = /^\/explore\/?$/.test(location.pathname);
  if (!settings[SettingsKey.Instagram.ExploreTiles] || !onExplore) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement("style");
  style.id = EXPLORE_TILES_STYLE_ID;
  style.textContent =
    'main :has(a[href^="/p/"], a[href^="/reel/"]):not(:has(input)) { display: none !important; }';
  document.documentElement.appendChild(style);
}

// MARK:  ApplySettings

export function applyAnyActiveInstagramSettings(
  reelockrSettings: RelockrSettings,
  node: Element,
  url: string,
): void {
  if (
    url.includes("instagram.com/direct/t/") &&
    isHiddenSettingOn(reelockrSettings, SettingsKey.Instagram.FixDmReelLinks)
  ) {
    fixDmReelsNotOpening();
  }

  applyInstagramHomeFeed(reelockrSettings, node);
  applyInstagramMediaGreyscale(reelockrSettings);
  applyInstagramExploreTiles(reelockrSettings);

  if (isHiddenSettingOn(reelockrSettings, SettingsKey.Instagram.HideOpenAppButton)) {
    hideInstagramOpenAppButton(node);
  }
  if (isHiddenSettingOn(reelockrSettings, SettingsKey.Instagram.HideUseAppBanner)) {
    hideInstagramUseAppBanner(node);
  }

  applyInstagramNavTabStyles(reelockrSettings);

  // Comments
  if (reelockrSettings[SettingsKey.Instagram.Comments]) {
    hideInstagramComments(
      node,
      !!reelockrSettings[SettingsKey.Instagram.CommentsExemptFollowing],
    );
  }

  // Stories
  const storiesTreatment = reelockrSettings[SettingsKey.Instagram.Stories] as
    ElementTreatment | undefined;
  if (storiesTreatment && storiesTreatment !== ElementTreatment.Show) {
    const storiesDifficulty =
      (reelockrSettings[SettingsKey.Instagram.StoriesCoverDifficulty] as
        CoverDifficulty | undefined) ?? CoverDifficulty.ShortWait;
    applyInstagramStories(node, storiesTreatment, storiesDifficulty);
  }

  // Feed strangers. Only applies to the Default feed; Following / Favorites
  // have no strangers to cover.
  const homeFeed =
    reelockrSettings[SettingsKey.Instagram.HomeFeed] ?? InstagramHomeFeed.Default;
  if (
    reelockrSettings[SettingsKey.Instagram.ExploreFeedStrangers] &&
    homeFeed === InstagramHomeFeed.Default
  ) {
    const difficulty =
      (reelockrSettings[
        SettingsKey.Instagram.ExploreFeedStrangersCoverDifficulty
      ] as CoverDifficulty | undefined) ?? CoverDifficulty.ShortWait;
    coverInstagramExploreFeedStrangers(node, difficulty);
  }

  // Ads
  if (reelockrSettings[SettingsKey.Instagram.GuardAds]) {
    const difficulty =
      (reelockrSettings[SettingsKey.Instagram.GuardAdsCoverDifficulty] as
        CoverDifficulty | undefined) ?? CoverDifficulty.ShortWait;
    coverInstagramAds(node, difficulty);
  }

  // Feed videos
  if (reelockrSettings[SettingsKey.Instagram.FeedVideos]) {
    const difficulty =
      (reelockrSettings[SettingsKey.Instagram.FeedVideosCoverDifficulty] as
        CoverDifficulty | undefined) ?? CoverDifficulty.ShortWait;
    coverInstagramFeedVideos(
      node,
      difficulty,
      !!reelockrSettings[SettingsKey.Instagram.FeedVideosExemptFollowing],
    );
  }
}
