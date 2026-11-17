export const APP_STORE_URL = "https://apps.apple.com/us/app/id6759315272";

export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.storiator.relockin.androidbrowser&hl=en_CA";

export interface AppStore {
  url: string;
  /** The store's own "Download on" badge. */
  badge: string;
  name: string;
}

const APP_STORE: AppStore = { url: APP_STORE_URL, badge: "/images/AppleStoreButton.svg", name: "App Store" };
const PLAY_STORE: AppStore = { url: PLAY_STORE_URL, badge: "/images/GooglePlayButton.svg", name: "Google Play" };

/**
 * The store for this phone. Extensions on phones are almost always Android,
 * so that's the default; iPadOS reports itself as a Mac with a touchscreen.
 */
export function phoneStore(): AppStore {
  const isIos =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return isIos ? APP_STORE : PLAY_STORE;
}
