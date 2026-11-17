import { RuleTargetType } from "~/types/models";
import type { RuleTarget } from "~/types/models";

/**
 * Check whether a URL matches a single RuleTarget.
 *
 * - Domain: a site, however it was typed ("youtube.com", "www.youtube.com",
 *   "https://youtube.com/feed"). Matches that host and its subdomains.
 * - UrlPattern: text the URL should contain, with * for "anything". See
 *   {@link urlPatternMatches}.
 */
export function urlMatchesTarget(url: string, target: RuleTarget): boolean {
  if (!target.enabled) return false;

  if (target.targetType === RuleTargetType.Domain) {
    const domain = normalizeDomain(target.pattern);
    if (!domain) return false;
    const hostname = hostnameOf(url);
    if (hostname === null) return false;
    return hostname === domain || hostname.endsWith(`.${domain}`);
  }

  if (target.targetType === RuleTargetType.UrlPattern) {
    return urlPatternMatches(url, target.pattern);
  }

  return false;
}

/** "https://www.YouTube.com:443/feed" → "youtube.com". */
export function normalizeDomain(input: string): string {
  return stripSchemeAndWww(input.trim().toLowerCase())
    .split(/[/?#]/)[0]
    .replace(/^\*\./, "")
    .replace(/:\d*$/, "")
    .replace(/\.$/, "");
}

/**
 * Whether `url` contains `pattern`, where:
 * - `https://` and `www.` don't matter, on either side.
 * - `*` stands for any text.
 * - A pattern that starts with a site ("reddit.com/r/foo") only matches on
 *   that site or its subdomains, not when that text turns up later in the URL
 *   (a search for it, say).
 * - Matches don't cut a word in half: "reddit.com/r/foo" matches
 *   ".../r/foo", ".../r/foo/comments/..." and ".../r/foo?sort=new", but not
 *   ".../r/foobar". Likewise "r/foo" doesn't match ".../user/foo".
 */
export function urlPatternMatches(url: string, pattern: string): boolean {
  const regex = patternRegex(pattern);
  if (!regex) return false;
  const subject = comparableUrl(url);
  return subject !== null && regex.test(subject);
}

// ── Internals ───────────────────────────────────────────────────────

/** Characters that make up a name in a URL: a subreddit, handle, path segment. */
const WORD_CHAR = "[\\p{L}\\p{N}_-]";
const WORD_CHAR_REGEX = new RegExp(`^${WORD_CHAR}$`, "u");

function stripSchemeAndWww(s: string): string {
  return s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^www\./, "");
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** The URL as people write it: no scheme or www, decoded, lowercase. */
function comparableUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  let s =
    parsed.hostname.replace(/^www\./, "") +
    parsed.pathname +
    parsed.search +
    parsed.hash;
  try {
    s = decodeURI(s);
  } catch {
    // Keep it encoded if it has a malformed % escape.
  }
  return s.toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const regexCache = new Map<string, RegExp | null>();

function patternRegex(rawPattern: string): RegExp | null {
  const cached = regexCache.get(rawPattern);
  if (cached !== undefined) return cached;

  const pattern = stripSchemeAndWww(rawPattern.trim().toLowerCase())
    .replace(/\*+/g, "*")
    // "reddit.com/r/foo/" should still match "reddit.com/r/foo".
    .replace(/\/+$/, "");

  let regex: RegExp | null = null;
  if (pattern.replace(/\*/g, "")) {
    const body = pattern.split("*").map(escapeRegExp).join(".*");

    const site = pattern.split(/[/?#]/)[0];
    const startsWithSite = site.includes(".") && !site.includes("*");
    const prefix = startsWithSite
      ? // From the start of the host, or after a subdomain.
        "^(?:[^/?#]*\\.)?"
      : WORD_CHAR_REGEX.test(pattern[0])
        ? `(?<!${WORD_CHAR})`
        : "";
    const suffix = WORD_CHAR_REGEX.test(pattern[pattern.length - 1])
      ? `(?!${WORD_CHAR})`
      : "";

    regex = new RegExp(prefix + body + suffix, "u");
  }

  regexCache.set(rawPattern, regex);
  return regex;
}
