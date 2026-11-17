export function extractInstagramReelUrlFromImageIfPresent(
  imgUrl: string,
): string | null {
  if (!imgUrl) return null;

  if (!isLikelyInstagramReelPreview(imgUrl)) {
    return null;
  }

  const cacheKeyMatch = imgUrl.match(/[?&]ig_cache_key=([^&]+)/);
  if (!cacheKeyMatch) return null;

  // A malformed % escape or base64 makes these throw; skip just this image.
  let mediaId: string;
  try {
    const base64Part = decodeURIComponent(cacheKeyMatch[1]).split(".")[0];
    if (!base64Part) return null;
    mediaId = atob(base64Part);
  } catch {
    return null;
  }

  if (!/^\d+$/.test(mediaId)) {
    return null;
  }

  const shortcode = instagramMediaIdToShortcode(mediaId);
  return `https://www.instagram.com/reel/${shortcode}/`;
}

function isLikelyInstagramReelPreview(imgUrl: string): boolean {
  if (!imgUrl) return false;

  if (imgUrl.includes("/t51.82787-")) return true;
  if (imgUrl.includes("/t51.71878-")) return true;

  const efgMatch = imgUrl.match(/[?&]efg=([^&]+)/);
  if (!efgMatch) return false;

  try {
    const decodedEfg = atob(decodeURIComponent(efgMatch[1]));
    return decodedEfg.includes("CLIPS");
  } catch {
    return false;
  }
}

function instagramMediaIdToShortcode(mediaId: string): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  let value = BigInt(mediaId);
  if (value === 0n) return alphabet[0];

  let result = "";

  while (value > 0n) {
    const remainder = Number(value % 64n);
    result = alphabet[remainder] + result;
    value = value / 64n;
  }

  return result;
}
