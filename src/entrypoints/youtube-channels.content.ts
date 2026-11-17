import { startYouTubeChannelAnnotator } from "@/shared/dom/youtubeChannelAnnotator";

// Runs in the page's own JS world, where YouTube's element data is readable.
// It only copies channels onto DOM attributes; content.ts acts on them.
export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  world: "MAIN",
  runAt: "document_idle",

  main() {
    startYouTubeChannelAnnotator();
  },
});
