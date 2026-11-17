// --- Instagram Home feed (Default / Only Following / Only Favorites) ---------
//
// Instagram has chronological Following and Favorites feeds at
// `/?variant=following` and `/?variant=favorites`; its algorithmic Default
// feed is plain `/`. Instagram doesn't remember which one you picked, so when
// the user chooses Following or Favorites we redirect plain `/` there.
//
// The redirect rule (mirrored by the native mobile redirect; keep them in sync,
// see docs/MOBILE_PORT_FEED_VIEWS.md):
//
//   Redirect only instagram.com `/` with NO `variant` query param. Any
//   `variant` param, even an empty or unknown one, is an explicit choice and is
//   left alone. Instagram serves its Default feed for an empty/unknown
//   variant, so `/?variant=` is our "explicitly Default" URL.
//
// While on Following / Favorites, Instagram shows a link back to the Default
// feed with plain `/`, which the rule above would bounce straight back. So we
// catch clicks on that link and send them to `/?variant=` instead, or hide it
// entirely when HomeFeedHideDefaultLink is on. The Home tab also links to `/`
// and is deliberately not caught: Home opens the feed the user chose.

import type { RelockrSettings } from "@/types/RelockrSettings";
import { InstagramHomeFeed } from "@/types/enums";
import { SettingsKey } from "../settings/settingsKey";
import { hideElement } from "./domUtils";

const VARIANT_PARAM = "variant";
// Safety net: if Instagram ever strips `?variant=` from the URL after loading
// the feed, the next apply would see plain `/` again and redirect in a loop.
const REDIRECT_GUARD_STORAGE_KEY = "relockin.igHomeFeedRedirectAt";
const REDIRECT_GUARD_MS = 5000;
// Instagram's link back to the Default feed, shown on Following / Favorites.
const DEFAULT_FEED_LINK_SELECTOR = [
  // Mobile site: in the header.
  "h1 > div:first-child > div:first-child > a:first-child",
  // Desktop site: seven first-child divs down from <main>.
  `main${" > div:first-child".repeat(7)} > a:first-child`,
].join(", ");

let currentHomeFeed: InstagramHomeFeed = InstagramHomeFeed.Default;
let clickInterceptorInstalled = false;

export function applyInstagramHomeFeed(
  settings: RelockrSettings,
  node: Element,
): void {
  currentHomeFeed =
    (settings[SettingsKey.Instagram.HomeFeed] as InstagramHomeFeed | undefined) ??
    InstagramHomeFeed.Default;
  if (currentHomeFeed === InstagramHomeFeed.Default) return;

  if (settings[SettingsKey.Instagram.HomeFeedHideDefaultLink]) {
    for (const link of node.querySelectorAll(DEFAULT_FEED_LINK_SELECTOR)) {
      if (link instanceof HTMLAnchorElement && isPlainHomeLink(link)) {
        hideElement(link, "Instagram link to Default feed");
      }
    }
  }
  installDefaultLinkClickInterceptor();

  const target = instagramHomeFeedRedirectUrl(
    new URL(window.location.href),
    currentHomeFeed,
  );
  if (target && !redirectedRecently()) {
    markRedirected();
    window.location.replace(target);
  }
}

/** Where plain Home should go for `feed`, or null to leave `url` alone. */
export function instagramHomeFeedRedirectUrl(
  url: URL,
  feed: InstagramHomeFeed,
): string | null {
  if (feed === InstagramHomeFeed.Default) return null;
  if (!isInstagramHost(url.hostname)) return null;
  if (url.pathname !== "/") return null;
  if (url.searchParams.has(VARIANT_PARAM)) return null;
  const target = new URL(url.href);
  target.searchParams.set(VARIANT_PARAM, feed);
  return target.href;
}

function isInstagramHost(hostname: string): boolean {
  return hostname === "instagram.com" || hostname.endsWith(".instagram.com");
}

function installDefaultLinkClickInterceptor(): void {
  if (clickInterceptorInstalled) return;
  clickInterceptorInstalled = true;
  window.addEventListener(
    "click",
    (e) => {
      if (currentHomeFeed === InstagramHomeFeed.Default) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (
        !isPlainHomeLink(anchor) ||
        !anchor.matches(DEFAULT_FEED_LINK_SELECTOR)
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      const defaultFeed = new URL("/", window.location.origin);
      defaultFeed.searchParams.set(VARIANT_PARAM, "");
      window.location.assign(defaultFeed.href);
    },
    true, // capture phase → beats Instagram's router
  );
}

function isPlainHomeLink(anchor: HTMLAnchorElement): boolean {
  const url = new URL(anchor.href, window.location.href);
  return (
    isInstagramHost(url.hostname) &&
    url.pathname === "/" &&
    !url.searchParams.has(VARIANT_PARAM)
  );
}

function redirectedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(REDIRECT_GUARD_STORAGE_KEY));
    return !!at && Date.now() - at < REDIRECT_GUARD_MS;
  } catch {
    return false;
  }
}

function markRedirected(): void {
  try {
    sessionStorage.setItem(REDIRECT_GUARD_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage blocked: the redirect still works, just without the loop guard.
  }
}
