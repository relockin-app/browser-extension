// --- Custom action bar (replaces side vote arrows + bottom button row) -----
//
// The native upvote/downvote sit in a vertical `.midcol` to the left of each
// comment and the rest of the actions (save, permalink, parent, report,
// reply) sit in `.flat-list.buttons` underneath. Both are awkward on touch.
// We hide both via CSS but leave them in the DOM, then render our own bar at
// the bottom of `.entry` and proxy clicks through to the native controls so
// reddit's existing JS handles vote toggling, score updates, reply forms, etc.
//
// Vote state styling is inherited from reddit's own `.entry.likes` /
// `.entry.dislikes` classes — no observer required.

import { t } from "~/lib/i18n";
import { clickFirstMatch } from "../utils/clickFirstMatch";
import {
  createRedditIcon,
  ICON_DOWNVOTE,
  ICON_MORE,
  ICON_REPLY,
  ICON_UPVOTE,
  type RedditIconName,
} from "./svgIcons";

export const OLD_REDDIT_ACTION_BAR_STYLE_ID = "my-old-reddit-action-bar-css";
const ACTION_BAR_INIT_FLAG = "relockrActionBar";
const ACTION_BAR_MENU_ID = "relockr-action-menu";

export const ACTION_BAR_CSS = `
  .thing.comment > .midcol {
    display: none !important;
  }
  .thing.comment > .entry > .flat-list.buttons {
    display: none !important;
  }
  .relockr-comment-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: 0;
    padding: 0;
  }
  .thing.comment.collapsed > .entry > .relockr-comment-actions {
    display: none;
  }
  .relockr-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 16px;
    padding: 0 8px;
    border: none;
    background: transparent;
    color: #878a8c;
    cursor: pointer;
    border-radius: 4px;
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0.08);
  }
  .relockr-action-btn:hover {
    background-color: rgba(0, 0, 0, 0.06);
  }
  .relockr-action-btn svg {
    display: block;
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
  .relockr-action-btn.relockr-action-reply {
    margin-left: auto;
  }
  .thing.comment > .entry.likes .relockr-action-btn.relockr-action-upvote {
    color: #ff8b60;
  }
  .thing.comment > .entry.dislikes .relockr-action-btn.relockr-action-downvote {
    color: #9494ff;
  }
  #${ACTION_BAR_MENU_ID} {
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
  #${ACTION_BAR_MENU_ID}[hidden] {
    display: none;
  }
  #${ACTION_BAR_MENU_ID} button {
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
  #${ACTION_BAR_MENU_ID} button:hover {
    background-color: #f2f2f2;
  }
`;

export function attachActionBar(thing: HTMLElement): void {
  if (thing.dataset[ACTION_BAR_INIT_FLAG]) return;
  thing.dataset[ACTION_BAR_INIT_FLAG] = "1";

  const entry = thing.querySelector(":scope > .entry");
  if (!(entry instanceof HTMLElement)) return;

  const bar = document.createElement("div");
  bar.className = "relockr-comment-actions";
  bar.append(
    makeActionButton(
      "relockr-action-upvote",
      t("domShared_redditActionUpvote"),
      ICON_UPVOTE,
    ),
    makeActionButton(
      "relockr-action-downvote",
      t("domShared_redditActionDownvote"),
      ICON_DOWNVOTE,
    ),
    makeActionButton(
      "relockr-action-reply",
      t("domShared_redditActionReply"),
      ICON_REPLY,
    ),
    makeActionButton(
      "relockr-action-more",
      t("domShared_redditActionMoreOptions"),
      ICON_MORE,
    ),
  );
  entry.appendChild(bar);

  bar
    .querySelector(".relockr-action-upvote")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      clickFirstMatch(thing, ":scope > .midcol > [data-event-action='upvote']");
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
  bar.querySelector(".relockr-action-reply")?.addEventListener("click", (e) => {
    e.stopPropagation();
    clickFirstMatch(thing, ":scope > .entry .reply-button > a");
  });
  const moreBtn = bar.querySelector(".relockr-action-more");
  moreBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (moreBtn instanceof HTMLElement) openMoreMenu(thing, moreBtn);
  });
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

let actionMenuEl: HTMLDivElement | null = null;
let actionMenuOwner: HTMLElement | null = null;

function ensureActionMenu(): HTMLDivElement {
  if (actionMenuEl) return actionMenuEl;
  const menu = document.createElement("div");
  menu.id = ACTION_BAR_MENU_ID;
  menu.hidden = true;
  document.body.appendChild(menu);
  actionMenuEl = menu;

  document.addEventListener("pointerdown", (e) => {
    if (!actionMenuEl || actionMenuEl.hidden) return;
    if (actionMenuEl.contains(e.target as Node)) return;
    if (actionMenuOwner && actionMenuOwner.contains(e.target as Node)) return;
    closeActionMenu();
  });
  window.addEventListener("scroll", closeActionMenu, { passive: true });
  window.addEventListener("resize", closeActionMenu);

  return menu;
}

function closeActionMenu(): void {
  if (actionMenuEl) actionMenuEl.hidden = true;
  actionMenuOwner = null;
}

function openMoreMenu(comment: HTMLElement, anchor: HTMLElement): void {
  const menu = ensureActionMenu();
  if (actionMenuOwner === anchor && !menu.hidden) {
    closeActionMenu();
    return;
  }
  populateMoreMenu(menu, comment);
  actionMenuOwner = anchor;
  menu.hidden = false;
  positionActionMenu(menu, anchor);
}

function populateMoreMenu(menu: HTMLDivElement, comment: HTMLElement): void {
  menu.replaceChildren();
  // Reddit toggles the anchor's text between "save" and "unsave"; detect via
  // visible text rather than the LI class, which doesn't always swap.
  const saveLink = comment.querySelector(
    ":scope > .entry .comment-save-button > a, :scope > .entry .save-button > a, :scope > .entry .unsave-button > a",
  ) as HTMLAnchorElement | null;
  // TODO: Language-independent indicator
  const isSaved = saveLink?.textContent?.trim().toLowerCase() === "unsave";
  const parentLink = comment.querySelector(
    ":scope > .entry .flat-list.buttons a[data-event-action='parent']",
  ) as HTMLAnchorElement | null;
  const permalink = comment.querySelector(
    ":scope > .entry .flat-list.buttons a[data-event-action='permalink']",
  ) as HTMLAnchorElement | null;
  const embedLink = comment.querySelector(
    ":scope > .entry .flat-list.buttons a.embed-comment",
  ) as HTMLAnchorElement | null;

  addMenuItem(menu, isSaved ? t("domShared_redditMenuUnsave") : t("domShared_redditMenuSave"), () => {
    if (saveLink) saveLink.click();
  });
  if (permalink) {
    addMenuItem(menu, t("domShared_redditMenuCopyLinkToComment"), () => {
      navigator.clipboard?.writeText(permalink.href).catch(() => {});
    });
    addMenuItem(menu, t("domShared_redditMenuPermalink"), () => {
      window.location.href = permalink.href;
    });
  }
  if (parentLink) {
    addMenuItem(menu, t("domShared_redditMenuParent"), () => {
      window.location.href = parentLink.href;
    });
  }
  if (embedLink) {
    addMenuItem(menu, t("domShared_redditMenuEmbed"), () => {
      embedLink.click();
    });
  }
  addMenuItem(menu, t("domShared_redditMenuReport"), () => {
    clickFirstMatch(comment, ":scope > .entry .reportbtn");
  });
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
    closeActionMenu();
    onClick();
  });
  menu.appendChild(btn);
}

function positionActionMenu(menu: HTMLDivElement, anchor: HTMLElement): void {
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
