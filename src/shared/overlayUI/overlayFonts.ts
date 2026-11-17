
/**
 * A page can read an @font-face URL from its own DOM, and an extension URL
 * identifies the extension (on Firefox, even the install). So the fonts are
 * added from their bytes instead, leaving no URL for the page to find.
 *
 * Unlike @font-face, this reads the fonts right away (about 1 MB), so it's only
 * for pages where our UI can appear.
 */

// The sites in content.ts's matches.
const CUSTOMIZED_SITE = /(^|\.)(instagram|youtube|linkedin|reddit|x|netflix|tiktok|facebook)\.com$/;

const FONTS = [
  { file: "CascadiaCode-VariableFont_wght.ttf", family: "CascadiaCode", weight: "200 700" },
  // Registered under the name the font stacks ask for (RL_FONT_BODY).
  { file: "DMSans-VariableFont_opsz,wght.ttf", family: "DM Sans", weight: "100 900" },
];

let requested = false;

export function isCustomizedSite(): boolean {
  return CUSTOMIZED_SITE.test(location.hostname);
}

async function loadFont({ file, family, weight }: (typeof FONTS)[number]): Promise<void> {
  try {
    const response = await fetch(browser.runtime.getURL(`/fonts/${file}` as any));
    const face = new FontFace(family, await response.arrayBuffer(), { weight });
    document.fonts.add(await face.load());
  } catch (e) {
    // Our UI falls back to the next fonts in its stacks.
    console.warn(`[RELOCKR] Couldn't load font ${family}:`, String(e));
  }
}

export function loadOverlayFontsOnce(): void {
  if (requested) return;
  requested = true;
  FONTS.forEach((font) => void loadFont(font));
}
