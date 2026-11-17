// Platform guard implemented separately per platform at the same relative path
// (webext src/shared/platform vs mobile src/platform) and deliberately NOT
// mirrored by sync-wxt-to-ios.mjs, so shared synced TS can branch on platform.
// Webext build: true. Mobile (iOS/Android) build: false.
export function isWebExtPlatform(): boolean {
  return true;
}
