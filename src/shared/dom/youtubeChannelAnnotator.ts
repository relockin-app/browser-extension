/**
 * Runs in the PAGE's JS world (not the isolated content-script world): YouTube
 * keeps each tile's channel only in JS properties of its custom element, and
 * home/sidebar tiles have no channel link in the DOM at all. This copies the
 * channel onto DOM attributes, which the isolated world can read.
 *
 * Keep this file free of extension APIs and imports with side effects; it is
 * bundled into a MAIN-world script on webext and injected as a page script on
 * mobile.
 */

export const YT_CHANNEL_ID_ATTR = "data-relockr-yt-channel-id";
export const YT_CHANNEL_HANDLE_ATTR = "data-relockr-yt-channel-handle";
/**
 * The channel's display name, on the watch-page owner and channel header only.
 * Read from the same data as the id: the visible name is swapped in later, so
 * right after a navigation it can still be the previous channel's.
 */
export const YT_CHANNEL_NAME_ATTR = "data-relockr-yt-channel-name";
/** The watch-page or tile video id the channel attributes were read for. */
export const YT_ANNOTATED_FOR_ATTR = "data-relockr-yt-annotated-for";
/** Fired on `document` after a pass that changed any attribute. */
export const YT_ANNOTATED_EVENT = "relockr-yt-channels-annotated";

/** Elements that each hold one video's data. */
export const YT_VIDEO_TILE_SELECTOR = [
  "yt-lockup-view-model",
  "ytd-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-grid-video-renderer",
  "ytm-video-with-context-renderer",
  "ytm-compact-video-renderer",
].join(",");

/** The channel row under the watch-page player (mobile: with the actions). */
export const YT_WATCH_OWNER_SELECTOR = [
  "ytd-watch-metadata ytd-video-owner-renderer",
  "ytm-slim-video-action-bar-renderer",
].join(",");

/** The header at the top of a channel's page. */
export const YT_CHANNEL_HEADER_SELECTOR = [
  "ytd-browse[page-subtype='channels']:not([hidden]) yt-page-header-view-model",
  "ytm-browse yt-page-header-view-model",
].join(",");

const MAX_NODES_SEARCHED = 4000;

type AnyRecord = Record<string, unknown>;
type FoundChannel = { id: string; handle: string; name?: string };

function asObject(value: unknown): AnyRecord | null {
  if (typeof value === "function") {
    // Newer lockups expose their payload as a signal getter.
    try {
      value = (value as () => unknown)();
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" ? (value as AnyRecord) : null;
}

function readElementData(el: Element): AnyRecord | null {
  const host = el as unknown as AnyRecord;
  try {
    for (const holder of [host.rawProps, host.componentProps]) {
      const data = asObject(asObject(holder)?.data);
      if (data) return data;
    }
    // `.data` is a Symbol sentinel on lockups; asObject skips it.
    for (const key of ["data", "__data"]) {
      const data = asObject(host[key]);
      if (data) return data;
    }
    return asObject(asObject(host.polymerController)?.data);
  } catch {
    return null;
  }
}

/** First channel `browseEndpoint` in the payload, breadth-first. */
function findChannel(data: AnyRecord): FoundChannel | null {
  const queue: unknown[] = [data];
  const seen = new Set<unknown>();
  for (let i = 0; i < queue.length && i < MAX_NODES_SEARCHED; i++) {
    const node = queue[i];
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    const browse = (node as AnyRecord).browseEndpoint as AnyRecord | undefined;
    const id = browse?.browseId;
    if (typeof id === "string" && id.startsWith("UC")) {
      const base = browse?.canonicalBaseUrl;
      return { id, handle: typeof base === "string" ? base : "" };
    }
    for (const child of Object.values(node as AnyRecord)) {
      if (child && typeof child === "object") queue.push(child);
    }
  }
  return null;
}

/**
 * The watch page's channel, from the player's response. The owner row is
 * reused across in-page navigations and can briefly hold the previous video's
 * channel; the player response names its own video, so it can't be stale.
 */
function findWatchChannel(videoId: string): FoundChannel | null {
  try {
    const player = document.querySelector("#movie_player") as unknown as {
      getPlayerResponse?: () => AnyRecord | undefined;
    } | null;
    const response = player?.getPlayerResponse?.();
    const details = asObject(response?.videoDetails);
    if (details?.videoId !== videoId || typeof details.channelId !== "string") {
      return null;
    }
    const microformat = asObject(asObject(response?.microformat)?.playerMicroformatRenderer);
    const profileUrl = microformat?.ownerProfileUrl;
    const handle =
      typeof profileUrl === "string" ? new URL(profileUrl).pathname : "";
    const name = typeof details.author === "string" ? details.author : "";
    return { id: details.channelId, handle, name };
  } catch {
    return null;
  }
}

function setAttr(el: Element, name: string, value: string): boolean {
  if (el.getAttribute(name) === value) return false;
  el.setAttribute(name, value);
  return true;
}

function writeChannel(
  el: Element,
  forKey: string,
  channel: FoundChannel | null,
): boolean {
  let changed = setAttr(el, YT_CHANNEL_ID_ATTR, channel?.id ?? "");
  changed = setAttr(el, YT_CHANNEL_HANDLE_ATTR, channel?.handle ?? "") || changed;
  if (channel?.name !== undefined) {
    changed = setAttr(el, YT_CHANNEL_NAME_ATTR, channel.name) || changed;
  }
  changed = setAttr(el, YT_ANNOTATED_FOR_ATTR, forKey) || changed;
  return changed;
}

/**
 * Annotates a tile with the channel in its own data, or in the data of its
 * `fallback` element. `videoId` is the video it was read for, so a recycled
 * tile is read again.
 */
function annotateTile(el: Element, videoId: string, fallback: Element | null): boolean {
  if (el.getAttribute(YT_ANNOTATED_FOR_ATTR) === videoId) return false;
  const data = readElementData(el) ?? (fallback ? readElementData(fallback) : null);
  if (!data) return false; // Not rendered yet: retry next pass.
  return writeChannel(el, videoId, findChannel(data));
}

function annotateWatchOwner(owner: Element, videoId: string): boolean {
  if (owner.getAttribute(YT_ANNOTATED_FOR_ATTR) === videoId) return false;
  const channel = findWatchChannel(videoId);
  if (!channel) return false; // Player not on this video yet: retry next pass.
  return writeChannel(owner, videoId, channel);
}

/** The video a tile points at, from its first watch or Shorts link. */
export function getTileVideoId(tile: Element): string | null {
  const link = tile.querySelector<HTMLAnchorElement>(
    'a[href*="/watch?"], a[href^="/shorts/"]',
  );
  const href = link?.getAttribute("href");
  if (!href) return null;
  const shorts = href.match(/^\/shorts\/([\w-]{11})/);
  if (shorts) return shorts[1];
  return new URL(href, location.origin).searchParams.get("v");
}

export function getWatchVideoId(): string | null {
  if (location.pathname !== "/watch") return null;
  return new URLSearchParams(location.search).get("v");
}

/**
 * Identifies the channel page being shown, from its URL: `@handle`
 * (lowercase), `channel/UC…` (ids are case-sensitive), or `c/…` / `user/…`
 * for legacy URLs. Null when not on a channel page.
 */
export function getChannelPageKey(): string | null {
  const match = location.pathname.match(
    /^\/(@[^/]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)/,
  );
  if (!match) return null;
  let key: string;
  try {
    key = decodeURIComponent(match[1]);
  } catch {
    return null; // A malformed % escape
  }
  return key.startsWith("@") ? key.toLowerCase() : key;
}

/**
 * The channel page's channel, from its browse metadata. The header is reused
 * across in-page navigations, so the metadata only counts once it names the
 * channel in the URL.
 */
function findChannelPageChannel(key: string): FoundChannel | null {
  try {
    const browse = document.querySelector(
      "ytd-browse[page-subtype='channels']:not([hidden]), ytm-browse",
    ) as unknown as AnyRecord | null;
    const meta = asObject(
      asObject(asObject(browse?.data)?.metadata)?.channelMetadataRenderer,
    );
    const id = meta?.externalId;
    if (typeof id !== "string") return null;
    const vanity = meta?.vanityChannelUrl;
    const handle = typeof vanity === "string" ? new URL(vanity).pathname : "";
    const fresh = key.startsWith("@")
      ? handle.slice(1).toLowerCase() === key
      : key.startsWith("channel/")
        ? `channel/${id}` === key
        : true; // Legacy /c/ and /user/ URLs can't be checked against it.
    const name = typeof meta?.title === "string" ? meta.title : "";
    return fresh ? { id, handle, name } : null;
  } catch {
    return null;
  }
}

function annotateChannelHeader(header: Element, key: string): boolean {
  if (header.getAttribute(YT_ANNOTATED_FOR_ATTR) === key) return false;
  const channel = findChannelPageChannel(key);
  if (!channel) return false; // Metadata not on this channel yet: retry next pass.
  return writeChannel(header, key, channel);
}

export function annotateYouTubeChannels(root: ParentNode = document): boolean {
  let changed = false;
  for (const tile of root.querySelectorAll(YT_VIDEO_TILE_SELECTOR)) {
    const videoId = getTileVideoId(tile);
    if (!videoId) continue;
    const wrapper = tile.closest("ytd-rich-item-renderer, ytm-rich-item-renderer");
    changed = annotateTile(tile, videoId, wrapper) || changed;
  }
  const watchVideoId = getWatchVideoId();
  if (watchVideoId) {
    for (const owner of root.querySelectorAll(YT_WATCH_OWNER_SELECTOR)) {
      changed = annotateWatchOwner(owner, watchVideoId) || changed;
    }
  }
  const channelKey = getChannelPageKey();
  const header = channelKey && root.querySelector(YT_CHANNEL_HEADER_SELECTOR);
  if (channelKey && header) {
    changed = annotateChannelHeader(header, channelKey) || changed;
  }
  return changed;
}

/** Keeps tiles annotated as YouTube renders and recycles them. */
export function startYouTubeChannelAnnotator(): void {
  let scheduled = 0;
  const run = () => {
    scheduled = 0;
    if (annotateYouTubeChannels()) {
      document.dispatchEvent(new CustomEvent(YT_ANNOTATED_EVENT));
    }
  };
  const schedule = () => {
    if (!scheduled) scheduled = window.setTimeout(run, 150);
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"],
  });
  document.addEventListener("yt-navigate-finish", schedule);
  // The player can become ready without a DOM change; annotated elements are
  // skipped, so this is cheap.
  window.setInterval(schedule, 2000);
  schedule();
}
