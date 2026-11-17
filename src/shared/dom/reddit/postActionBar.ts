// --- Custom action bar for posts -------------------------------------------
//
// Mirrors commentActionBar but for `.thing.link`. The native flat-list under
// each post packs share / save / hide / report / crosspost into one cramped
// row that's painful on touch; we hide it via CSS and render our own bar
// with the comments link plus a single "..." menu housing everything else.
//
// When the user enables "Move vote count underneath posts" we also hide the
// left-hand `.midcol` vote arrows and inline an upvote / score / downvote
// trio into the bar. The score itself is mirrored as three sibling spans —
// one per vote state — and visibility is driven purely off `.thing.link >
// .entry`'s `.likes` / `.unvoted` / `.dislikes` class, so reddit's existing
// click handlers continue to do all the bookkeeping for us.

import { t } from "~/lib/i18n";
import { clickFirstMatch } from "../utils/clickFirstMatch";
import {
  createRedditIcon,
  ICON_CHAT_BUBBLE,
  ICON_DOWNVOTE,
  ICON_EXTERNAL_LINK,
  ICON_MORE,
  ICON_UPVOTE,
  type RedditIconName,
} from "./svgIcons";
import { POST_SOURCE_URL_DATASET } from "./postTitleLink";

export const OLD_REDDIT_POST_ACTION_BAR_STYLE_ID =
  "my-old-reddit-post-action-bar-css";
export const OLD_REDDIT_POST_VOTE_RELOCATE_STYLE_ID =
  "my-old-reddit-post-vote-relocate-css";

const POST_ACTION_BAR_INIT_FLAG = "relockrPostActionBar";
const POST_ACTION_MENU_ID = "relockr-post-action-menu";

export const POST_ACTION_BAR_CSS = `
  .thing.link > .entry > .top-matter > .flat-list.buttons {
    display: none !important;
  }
  .relockr-post-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 4px 0 0;
    padding: 0;
    font-size: 12px;
  }
  .relockr-post-actions .relockr-post-source {
    /* margin-left:auto here plus the same on the comments anchor makes flexbox
     * split the free space evenly, centering Source between the vote group and
     * the comments group. */
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: #369;
    font-weight: bold;
    text-decoration: none;
    padding: 4px 6px;
  }
  .relockr-post-actions .relockr-post-source:hover {
    text-decoration: underline;
  }
  .relockr-post-actions .relockr-post-comments {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #4F677F;
    font-weight: bold;
    text-decoration: none;
    padding: 4px 6px;
  }
  .relockr-post-actions .relockr-post-comments svg {
    font-size: 1.2em;
  }
  .relockr-post-actions .relockr-post-comments:hover {
    text-decoration: underline;
  }
  .relockr-action-btn.relockr-post-more {
    margin-left: 4px;
  }
  .relockr-post-score {
    min-width: 28px;
    text-align: center;
    color: #878a8c;
    font-weight: bold;
    font-size: 12px;
  }
  .relockr-post-score-likes,
  .relockr-post-score-dislikes {
    display: none;
  }
  .thing.link > .entry.likes .relockr-post-score-unvoted,
  .thing.link > .entry.dislikes .relockr-post-score-unvoted {
    display: none;
  }
  .thing.link > .entry.likes .relockr-post-score-likes {
    display: inline;
  }
  .thing.link > .entry.dislikes .relockr-post-score-dislikes {
    display: inline;
  }
  .thing.link > .entry.likes .relockr-post-actions .relockr-action-upvote,
  .thing.link > .entry.likes .relockr-post-score-likes {
    color: #ff8b60;
  }
  .thing.link > .entry.dislikes .relockr-post-actions .relockr-action-downvote,
  .thing.link > .entry.dislikes .relockr-post-score-dislikes {
    color: #9494ff;
  }
  #${POST_ACTION_MENU_ID} {
    position: fixed;
    background: #fff;
    color: #1a1a1b;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    padding: 4px 0;
    min-width: 160px;
    z-index: 2147483600;
    font-family: inherit;
  }
  #${POST_ACTION_MENU_ID}[hidden] {
    display: none;
  }
  #${POST_ACTION_MENU_ID} button {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: inherit;
    padding: 10px 14px;
    font-size: 14px;
    cursor: pointer;
  }
  #${POST_ACTION_MENU_ID} button:hover {
    background-color: #f2f2f2;
  }
`;

// Hides the native vote column when "Move vote count underneath posts" is on.
// Kept in a separate stylesheet so it can be injected conditionally.
//
// The padding-left compensates for the missing `.midcol` width — without it
// the thumbnail / title shift hard against the left edge of the screen.
export const POST_VOTE_RELOCATE_CSS = `
  .thing.link > .midcol {
    display: none !important;
  }
  .thing.link {
    padding-left: 12px;
  }
`;

export function attachPostActionBar(
  thing: HTMLElement,
  showVoteControls: boolean,
): void {
  if (thing.dataset[POST_ACTION_BAR_INIT_FLAG]) return;
  thing.dataset[POST_ACTION_BAR_INIT_FLAG] = "1";

  const topMatter = thing.querySelector(":scope > .entry > .top-matter");
  if (!(topMatter instanceof HTMLElement)) return;

  const commentsLink = thing.querySelector(
    ":scope > .entry .flat-list.buttons a.comments",
  ) as HTMLAnchorElement | null;

  const bar = document.createElement("div");
  bar.className = "relockr-post-actions";

  if (showVoteControls) {
    const scoreUnvoted = readScoreText(thing, "unvoted");
    const scoreLikes = readScoreText(thing, "likes");
    const scoreDislikes = readScoreText(thing, "dislikes");
    bar.append(
      makeActionButton(
        "relockr-action-upvote",
        t("domShared_redditActionUpvote"),
        ICON_UPVOTE,
      ),
      makeScore(scoreDislikes, scoreUnvoted, scoreLikes),
      makeActionButton(
        "relockr-action-downvote",
        t("domShared_redditActionDownvote"),
        ICON_DOWNVOTE,
      ),
    );
  }

  // For link posts whose title we've retargeted to the comments, offer the
  // original source here. `margin-left: auto` on the comments anchor keeps this
  // on the left, comments/… on the right.
  const sourceUrl = thing.dataset[POST_SOURCE_URL_DATASET];
  if (sourceUrl) {
    bar.appendChild(makeSourceLink(sourceUrl));
  }

  // Comments are now reached primarily via the post title, so this shrinks to a
  // speech-bubble icon + count rather than the verbose "217 comments" text. The
  // count comes from `data-comments-count` (locale-independent); the full label
  // is preserved on aria-label for screen readers.
  const commentsLabel =
    commentsLink?.textContent?.trim() || t("domShared_redditActionComments");
  const commentsAnchor = document.createElement("a");
  commentsAnchor.className = "relockr-post-comments";
  commentsAnchor.setAttribute("aria-label", commentsLabel);
  commentsAnchor.appendChild(createRedditIcon(ICON_CHAT_BUBBLE));
  // Prefer the raw data attribute; fall back to the leading number in the link
  // text ("217 comments" -> "217") if it's ever missing.
  const commentsCount =
    thing.dataset.commentsCount ?? commentsLabel.match(/^[\d.,]+/)?.[0];
  if (commentsCount) {
    const count = document.createElement("span");
    count.textContent = commentsCount;
    commentsAnchor.appendChild(count);
  }
  if (commentsLink?.href) commentsAnchor.href = commentsLink.href;
  commentsAnchor.rel = "nofollow";
  bar.appendChild(commentsAnchor);

  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "relockr-action-btn relockr-post-more";
  moreBtn.setAttribute("aria-label", t("domShared_redditActionMoreOptions"));
  moreBtn.appendChild(createRedditIcon(ICON_MORE));
  bar.appendChild(moreBtn);

  topMatter.appendChild(bar);

  if (showVoteControls) {
    bar
      .querySelector(".relockr-action-upvote")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        clickFirstMatch(
          thing,
          ":scope > .midcol > [data-event-action='upvote']",
        );
      });
    bar
      .querySelector(".relockr-action-downvote")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        clickFirstMatch(
          thing,
          ":scope > .midcol > [data-event-action='downvote']",
        );
      });
  }

  // Proxy through to the original comments anchor — reddit attaches click
  // handlers there (recording the click, etc) that a fresh navigation would
  // skip.
  commentsAnchor.addEventListener("click", (e) => {
    if (!commentsLink) return;
    e.preventDefault();
    e.stopPropagation();
    commentsLink.click();
  });

  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPostMoreMenu(thing, moreBtn);
  });
}

function readScoreText(
  thing: HTMLElement,
  variant: "likes" | "unvoted" | "dislikes",
): string {
  const el = thing.querySelector(
    `:scope > .midcol > .score.${variant}`,
  ) as HTMLElement | null;
  return el?.textContent?.trim() ?? "";
}

function makeActionButton(
  extraClass: string,
  ariaLabel: string,
  icon: RedditIconName,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `relockr-action-btn ${extraClass}`;
  btn.setAttribute("aria-label", ariaLabel);
  btn.appendChild(createRedditIcon(icon));
  return btn;
}

function makeSourceLink(url: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "relockr-post-source";
  link.href = url;
  link.rel = "nofollow noopener";
  link.appendChild(createRedditIcon(ICON_EXTERNAL_LINK));
  const label = document.createElement("span");
  label.textContent = t("domShared_redditActionSource");
  link.appendChild(label);
  return link;
}

function makeScore(
  scoreDislikes: string,
  scoreUnvoted: string,
  scoreLikes: string,
): HTMLSpanElement {
  const score = document.createElement("span");
  score.className = "relockr-post-score";
  score.setAttribute("aria-label", t("domShared_redditActionScore"));
  for (const [className, text] of [
    ["relockr-post-score-dislikes", scoreDislikes],
    ["relockr-post-score-unvoted", scoreUnvoted],
    ["relockr-post-score-likes", scoreLikes],
  ] as const) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    score.appendChild(span);
  }
  return score;
}

let postActionMenuEl: HTMLDivElement | null = null;
let postActionMenuOwner: HTMLElement | null = null;

function ensurePostActionMenu(): HTMLDivElement {
  if (postActionMenuEl) return postActionMenuEl;
  const menu = document.createElement("div");
  menu.id = POST_ACTION_MENU_ID;
  menu.hidden = true;
  document.body.appendChild(menu);
  postActionMenuEl = menu;

  document.addEventListener("pointerdown", (e) => {
    if (!postActionMenuEl || postActionMenuEl.hidden) return;
    if (postActionMenuEl.contains(e.target as Node)) return;
    if (postActionMenuOwner && postActionMenuOwner.contains(e.target as Node))
      return;
    closePostActionMenu();
  });
  window.addEventListener("scroll", closePostActionMenu, { passive: true });
  window.addEventListener("resize", closePostActionMenu);

  return menu;
}

function closePostActionMenu(): void {
  if (postActionMenuEl) postActionMenuEl.hidden = true;
  postActionMenuOwner = null;
}

function openPostMoreMenu(post: HTMLElement, anchor: HTMLElement): void {
  const menu = ensurePostActionMenu();
  if (postActionMenuOwner === anchor && !menu.hidden) {
    closePostActionMenu();
    return;
  }
  populatePostMoreMenu(menu, post);
  postActionMenuOwner = anchor;
  menu.hidden = false;
  positionPostActionMenu(menu, anchor);
}

function populatePostMoreMenu(menu: HTMLDivElement, post: HTMLElement): void {
  menu.replaceChildren();

  const saveLink = post.querySelector(
    ":scope > .entry .link-save-button > a, :scope > .entry .save-button > a, :scope > .entry .unsave-button > a",
  ) as HTMLAnchorElement | null;
  // Same trick as comments — reddit doesn't always swap the LI class, but the
  // anchor text reliably flips between "save" and "unsave".
  // TODO: Language-independent indicator
  const isSaved = saveLink?.textContent?.trim().toLowerCase() === "unsave";

  const hideLink = post.querySelector(
    ":scope > .entry .hide-button a, :scope > .entry .unhide-button a",
  ) as HTMLAnchorElement | null;
  // TODO: Language-independent indicator
  const isHidden = hideLink?.textContent?.trim().toLowerCase() === "unhide";

  const shareBtn = post.querySelector(
    ":scope > .entry .post-sharing-button",
  ) as HTMLAnchorElement | null;
  const crosspostBtn = post.querySelector(
    ":scope > .entry .post-crosspost-button",
  ) as HTMLAnchorElement | null;
  const reportBtn = post.querySelector(
    ":scope > .entry .reportbtn",
  ) as HTMLAnchorElement | null;
  const commentsAnchor = post.querySelector(
    ":scope > .entry .flat-list.buttons a.comments",
  ) as HTMLAnchorElement | null;

  if (saveLink) {
    addMenuItem(
      menu,
      isSaved ? t("domShared_redditMenuUnsave") : t("domShared_redditMenuSave"),
      () => saveLink.click(),
    );
  }
  if (hideLink) {
    addMenuItem(
      menu,
      isHidden
        ? t("domShared_redditMenuUnhide")
        : t("domShared_redditMenuHide"),
      () => hideLink.click(),
    );
  }
  if (shareBtn) {
    addMenuItem(menu, t("domShared_redditMenuShare"), () => shareBtn.click());
  }
  if (commentsAnchor) {
    addMenuItem(menu, t("domShared_redditMenuCopyLinkToPost"), () => {
      navigator.clipboard?.writeText(commentsAnchor.href).catch(() => {});
    });
  }
  if (crosspostBtn) {
    addMenuItem(menu, t("domShared_redditMenuCrosspost"), () =>
      crosspostBtn.click(),
    );
  }
  if (reportBtn) {
    addMenuItem(menu, t("domShared_redditMenuReport"), () => reportBtn.click());
  }
}

function addMenuItem(
  menu: HTMLDivElement,
  label: string,
  onClick: () => void,
): void {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    closePostActionMenu();
    onClick();
  });
  menu.appendChild(btn);
}

function positionPostActionMenu(
  menu: HTMLDivElement,
  anchor: HTMLElement,
): void {
  const rect = anchor.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 160;
  const margin = 8;
  const left = Math.min(
    Math.max(margin, rect.right - menuWidth),
    window.innerWidth - menuWidth - margin,
  );
  const top = rect.bottom + 4;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
