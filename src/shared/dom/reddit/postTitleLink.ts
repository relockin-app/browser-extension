// --- Retarget post title to comments ---------------------------------------
//
// Old Reddit points a link post's title at its external source; only self
// posts open the comments. That's the opposite of New Reddit, the official
// app, and every mobile client, where tapping the post opens the discussion.
// Under mobile-friendly mode we align with that expectation: the title opens
// comments, and the original source stays reachable via a "Source" button in
// the post action bar (see postActionBar).
//
// Self/text posts already point at their comments, so we leave them alone —
// detected by the title href already matching the comments link. For link
// posts we repoint the title at the comments URL, and — only when the source
// is a genuinely external, non-reddit domain — stash it on the thing's dataset
// for the action bar's Source button. Reddit-hosted media (v.redd.it,
// i.redd.it, reddit.com/gallery, previews, etc.) is redundant with the inline
// expando and would just clutter the bar, so we retarget the title but show no
// Source button for it.
//
// On the post's own page the title keeps pointing at the source: the user is
// already on the discussion, so that's what a title tap should mean there.

// Hosts Reddit serves its own content from — matched against the source's
// hostname (and any subdomain) so we can skip the Source button for them.
const REDDIT_HOST_RE =
  /(^|\.)(reddit\.com|redd\.it|redditmedia\.com|redditstatic\.com)$/;

function isRedditInternalSource(url: string): boolean {
  try {
    return REDDIT_HOST_RE.test(new URL(url).hostname.toLowerCase());
  } catch {
    // Unparseable / relative URL — treat as internal (no Source button).
    return true;
  }
}

// data-relockr-source-url — set on `.thing.link` when we retarget a link post's
// title, so the action bar knows to render a Source button to the original URL.
export const POST_SOURCE_URL_DATASET = "relockrSourceUrl";

const TITLE_RETARGET_FLAG = "relockrTitleRetarget";

export function retargetPostTitleToComments(thing: HTMLElement): void {
  if (thing.dataset[TITLE_RETARGET_FLAG]) return;

  const title = thing.querySelector(
    ":scope > .entry a.title",
  ) as HTMLAnchorElement | null;
  const commentsLink = thing.querySelector(
    ":scope > .entry .flat-list.buttons a.comments",
  ) as HTMLAnchorElement | null;
  if (!title || !commentsLink) return;

  const commentsHref = commentsLink.href;
  if (!commentsHref) return;

  thing.dataset[TITLE_RETARGET_FLAG] = "1";

  // Self posts already open comments — nothing to retarget, no Source button.
  if (title.href === commentsHref) return;

  // For Reddit's outbound-tracked links the href is an out.reddit.com
  // redirector; the true destination lives on data-href-url. Prefer it so the
  // Source button points at the real URL (and the reddit-domain check sees the
  // real host, not out.reddit.com).
  const sourceUrl = title.getAttribute("data-href-url") || title.href;

  // Reddit-hosted media is already shown inline — only surface a Source button
  // for genuinely external links.
  if (!isRedditInternalSource(sourceUrl)) {
    thing.dataset[POST_SOURCE_URL_DATASET] = sourceUrl;
  }

  // On the post's own page (data-context="comments") the title pointing at
  // comments would just reload the page, so leave Reddit's source link alone
  // there. Feeds/listings still retarget to the discussion.
  if (thing.dataset.context === "comments") return;

  title.href = commentsHref;
  // Drop any "open in new tab" target so comments open in place, matching how
  // the app / New Reddit behave. Middle-click still opens a new tab natively.
  title.removeAttribute("target");

  // Reddit's outbound click-tracking rewrites the title's href back to the
  // redirector at click time (a mousedown handler), which would send the click
  // to the source instead of the comments. Rather than fight over the href,
  // intercept the click and drive the navigation to comments ourselves.
  interceptTitleClick(title, commentsHref);
}

// Force the title to open comments regardless of Reddit's href swapping.
// Runs in the capture phase and stops propagation so Reddit's delegated
// handlers (which navigate via the anchor's href) never fire. Preserves the
// new-tab intent: middle-click or any modifier opens comments in a new tab.
function interceptTitleClick(
  title: HTMLAnchorElement,
  commentsHref: string,
): void {
  const handler = (e: MouseEvent) => {
    const newTab = e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (newTab) {
      window.open(commentsHref, "_blank", "noopener");
    } else {
      window.location.assign(commentsHref);
    }
  };
  // click covers left-click / keyboard activation; auxclick covers middle-click.
  title.addEventListener("click", handler, true);
  title.addEventListener("auxclick", handler, true);
}
