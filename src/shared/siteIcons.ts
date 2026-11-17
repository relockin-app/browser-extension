import { RuleTargetType } from "~/types/models";
import type { RuleTarget } from "~/types/models";
import { normalizeDomain } from "./urlMatcher";

/** Crisp, full-bleed app icons we ship for common sites. Checked before the
 * browser's favicon cache because favicons are often 16px and inconsistent,
 * and because these work for sites the user has never visited (e.g. rules
 * created during onboarding). Keyed by hostname without "www.". */
const BUNDLED_ICONS: Record<string, string> = {
  "youtube.com": "/images/apps/youtube.png",
  "youtu.be": "/images/apps/youtube.png",
  "x.com": "/images/apps/x.png",
  "twitter.com": "/images/apps/x.png",
  "instagram.com": "/images/apps/instagram.png",
  "reddit.com": "/images/apps/reddit.png",
  "tiktok.com": "/images/apps/tiktok.png",
  "facebook.com": "/images/apps/facebook.png",
  "linkedin.com": "/images/apps/linkedin.png",
  "pinterest.com": "/images/apps/pinterest.svg",
};

/** Chromium MV3 serves favicons from the browser's own cache at
 * `/_favicon/` (needs the "favicon" permission, see wxt.config.ts). No
 * network request, so the list of blocked sites never leaves the device.
 * Firefox and Safari have no equivalent, they fall back to a monogram. */
const SUPPORTS_FAVICON_API =
  import.meta.env.MANIFEST_VERSION === 3 &&
  !import.meta.env.FIREFOX &&
  !import.meta.env.SAFARI;

/** Best-effort hostname for a target, or null if the pattern doesn't look
 * like it names a site (empty, or a URL fragment such as "/shorts"). */
export function targetHostname(target: RuleTarget): string | null {
  let pattern = target.pattern.trim().toLowerCase();
  if (!pattern) return null;
  if (target.targetType === RuleTargetType.UrlPattern) {
    pattern = pattern.replace(/^[a-z]+:\/\//, "").split(/[/?#*]/)[0];
  } else {
    pattern = normalizeDomain(pattern);
  }
  pattern = pattern.replace(/^www\./, "").replace(/:\d+$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(pattern) ? pattern : null;
}

/** Unique hostnames of a rule's enabled targets, in target order. */
export function ruleHostnames(targets: RuleTarget[]): string[] {
  const hosts = targets
    .filter((target) => target.enabled)
    .map(targetHostname)
    .filter((host): host is string => host !== null);
  return [...new Set(hosts)];
}

export interface SiteIconSource {
  src: string;
  /** From Chrome's favicon cache, so it needs {@link classifyFavicon} before
   * it can be shown. Bundled icons are always full-bleed app icons. */
  isFavicon: boolean;
}

/** Images to try for a hostname, best first. Empty means "use the monogram". */
export function siteIconSources(hostname: string): SiteIconSource[] {
  const sources: SiteIconSource[] = [];
  const bundledKey = Object.keys(BUNDLED_ICONS).find(
    (key) => hostname === key || hostname.endsWith(`.${key}`)
  );
  if (bundledKey) sources.push({ src: BUNDLED_ICONS[bundledKey], isFavicon: false });
  if (SUPPORTS_FAVICON_API) {
    sources.push({ src: faviconUrl(`https://${hostname}`), isFavicon: true });
  }
  return sources;
}

function faviconUrl(pageUrl: string): string {
  const params = new URLSearchParams({ pageUrl, size: "64" });
  return `${browser.runtime.getURL("/_favicon/" as any)}?${params}`;
}

/** How to show a loaded favicon:
 * - "default": Chrome's grey globe for a site it has no favicon for (it
 *   serves that instead of failing), so show the monogram instead.
 * - "fullBleed": opaque, it has its own background, so it fills the tile.
 * - "inset": mostly transparent glyph, drawn smaller on a light tile. */
export type FaviconKind = "default" | "fullBleed" | "inset";

/** Below this share of opaque pixels a favicon is treated as a glyph. A
 * square favicon with rounded corners is ~95% opaque. */
const FULL_BLEED_MIN_OPAQUE = 0.85;

let defaultFaviconPixels: Promise<Uint8ClampedArray | null> | null = null;

/** Pixels of the globe Chrome serves for an uncached page, fetched once from
 * a hostname that can never have a favicon. Same-origin, so no canvas taint. */
function getDefaultFaviconPixels(): Promise<Uint8ClampedArray | null> {
  defaultFaviconPixels ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(readPixels(img));
    img.onerror = () => resolve(null);
    img.src = faviconUrl("https://relockin-no-favicon.invalid/");
  });
  return defaultFaviconPixels;
}

function readPixels(img: HTMLImageElement): Uint8ClampedArray | null {
  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) return null;
  const ctx = new OffscreenCanvas(w, h).getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

function samePixels(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function classifyFavicon(img: HTMLImageElement): Promise<FaviconKind> {
  const pixels = readPixels(img);
  if (!pixels) return "inset";
  const defaultPixels = await getDefaultFaviconPixels();
  if (defaultPixels && samePixels(pixels, defaultPixels)) return "default";
  let opaque = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 200) opaque++;
  return opaque / (pixels.length / 4) >= FULL_BLEED_MIN_OPAQUE ? "fullBleed" : "inset";
}
