const STYLE_ID = "relockr-yt-disable-video-previews";
const LISTENER_INSTALLED_ATTR = "data-relockr-yt-preview-listener";

// Hide the transient hover/scroll preview overlays outright. These containers
// only hold a preview video, so display:none-ing them just makes the preview
// never appear — the underlying thumbnail stays visible. This prevents the
// brief frame-flash that pause-on-play allows.
// Channel pages (and some watch-page sidebars) play an animated WebP over the
// thumbnail instead of a video: animated-thumbnail-overlay-view-model on
// lockups, ytd-moving-thumbnail-renderer on older tiles.
const HIDE_PREVIEW_CSS = `
ytd-video-preview,
ytm-video-preview,
.ytmVideoPreviewPlayer,
animated-thumbnail-overlay-view-model,
ytd-moving-thumbnail-renderer { display: none !important; }
`;

// The channel-page header (ytd-channel-video-player-renderer) wraps more than
// just the video — it holds channel branding — so we pause its video instead
// of hiding the whole renderer.
const PREVIEW_CONTAINER_SELECTOR = [
  "ytd-video-preview",
  "ytm-video-preview",
  "ytd-channel-video-player-renderer",
].join(", ");

const PREVIEW_VIDEO_SELECTOR = [
  "ytd-video-preview video",
  "ytm-video-preview video",
  "ytd-channel-video-player-renderer video",
].join(", ");

function pauseAndMute(video: HTMLVideoElement): void {
  video.pause();
  video.muted = true;
}

function handleCapturedPlay(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLVideoElement)) return;
  if (!target.closest(PREVIEW_CONTAINER_SELECTOR)) return;
  pauseAndMute(target);
}

function injectHideStyleOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = HIDE_PREVIEW_CSS;
  document.head.appendChild(style);
}

function installListenerOnce(): void {
  const html = document.documentElement;
  if (html.hasAttribute(LISTENER_INSTALLED_ATTR)) return;
  html.setAttribute(LISTENER_INSTALLED_ATTR, "1");
  document.addEventListener("play", handleCapturedPlay, true);
}

export function disableYouTubeVideoPreviews(root: ParentNode): void {
  injectHideStyleOnce();
  installListenerOnce();

  root
    .querySelectorAll<HTMLVideoElement>(PREVIEW_VIDEO_SELECTOR)
    .forEach(pauseAndMute);
}
