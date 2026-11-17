import { ThumbnailFilter } from "@/types/enums";

const STYLE_ID = "relockr-yt-thumbnail-filter";

const THUMBNAIL_SELECTORS = [
  "ytd-thumbnail img",
  "yt-thumbnail-view-model img",
  "ytm-thumbnail img",
  "img.ytThumbnailViewModelImageHq7",
  ".video-thumbnail-img",
  "ytm-shorts-lockup-view-model img",
].join(", ");

const FILTER_BY_MODE: Record<
  Exclude<ThumbnailFilter, ThumbnailFilter.Visible>,
  string
> = {
  [ThumbnailFilter.LightlyBlurred]: "blur(8px)",
  [ThumbnailFilter.HeavilyBlurred]: "blur(24px)",
  [ThumbnailFilter.Greyscale]: "grayscale(1)",
  [ThumbnailFilter.Black]: "brightness(0)",
};

export function applyYouTubeThumbnailFilter(mode: ThumbnailFilter): void {
  const existing = document.getElementById(STYLE_ID);
  if (mode === ThumbnailFilter.Visible) {
    existing?.remove();
    return;
  }
  const css = `${THUMBNAIL_SELECTORS} { filter: ${FILTER_BY_MODE[mode]} !important; }`;
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

const POST_IMAGE_STYLE_ID = "relockr-yt-post-image-greyscale";
const POST_IMAGE_SELECTORS = [
  "ytm-backstage-image-renderer img",
  "ytm-post-multi-image-renderer img",
  "ytd-backstage-image-renderer img",
  "ytd-post-multi-image-renderer img",
].join(", ");

/** Greys out the images in channels' posts, or puts them back. */
export function applyYouTubePostImageGreyscale(on: boolean): void {
  const existing = document.getElementById(POST_IMAGE_STYLE_ID);
  if (!on) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement("style");
  style.id = POST_IMAGE_STYLE_ID;
  style.textContent = `${POST_IMAGE_SELECTORS} { filter: grayscale(1) !important; }`;
  document.head.appendChild(style);
}
