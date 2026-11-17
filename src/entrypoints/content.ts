import { isInsideReelockrUi } from "@/shared/dom/domUtils";
import {
  ensureSettingsLoaded,
  mergeSettings,
  relockrSettings,
  saveSettingsPatch,
  watchSettings,
} from "@/shared/settings/relockrSettings";
import {
  registerYouTubeAiAccount,
  setYouTubeAiSharedList,
} from "@/shared/dom/youtubeAiContent";
import { registerDomSettingsWriter } from "@/shared/dom/utils/settingsWriter";
import { SUPABASE_AUTH_STORAGE_KEY } from "@/shared/supabaseConfig";
import {
  YOUTUBE_AI_SHARED_LIST_KEY,
  type YouTubeAiSharedList,
} from "@/shared/youtubeAiSharedList";
import type { OpenSignInMessage } from "@/types/messages";
import { rlog } from "~/shared/rlog";
import type { RelockrSettings } from "@/types/RelockrSettings";
import { timeStr } from "@/shared/timeStr";
import { applyAllDomModifications } from "@/shared/dom/applyAllDomModifications";
import { applyAllEarlyStaticStyles } from "@/shared/dom/applyEarlyStaticStyles";
import {
  FULL_ACCESS,
  getProAccess,
  isLimited,
  watchProAccess,
  type ProAccess,
} from "@/shared/pro/proAccess";
import { withoutProSettings } from "@/shared/pro/proSettings";

declare global {
  interface Window {
    __reelockrSettings?: RelockrSettings;
    __reelockrApply?: (node: Element) => void;
    __reelockrListenerInstalled?: boolean;
    __reelockrDomInterval?: number;
  }
}

// MARK: - Pro access

let proAccess: ProAccess = FULL_ACCESS;
let gatedFrom: RelockrSettings | null = null;
let gatedSettings: RelockrSettings = {};

/** The settings as they apply here: without Pro ones on a phone without Pro. */
function siteSettings(): RelockrSettings {
  if (!isLimited(proAccess)) return relockrSettings;
  if (gatedFrom !== relockrSettings) {
    gatedFrom = relockrSettings;
    gatedSettings = withoutProSettings(relockrSettings);
  }
  return gatedSettings;
}

async function ensureProAccessLoaded(): Promise<void> {
  proAccess = await getProAccess();
}

// MARK: - Reapply

let pendingReapplyTimer: number = 0;

function scheduleReapply(): void {
  if (pendingReapplyTimer) clearTimeout(pendingReapplyTimer);
  pendingReapplyTimer = window.setTimeout(() => {
    pendingReapplyTimer = 0;
    try {
      window.__reelockrApply?.(document.documentElement);
    } catch (e) {
      console.error("RelockIn reapply error:", e);
    }
  }, 50);
}

// Sites whose rules still need a periodic re-scan. Their JS judges content
// (covers, comment and feed filters) and the sites reuse elements and change
// pages in place, which the MutationObserver's added-node check can miss.
// Elsewhere, hiding is done by stylesheets and new content arrives as added
// nodes, so the observer is enough.
const PERIODIC_RESCAN_HOSTS = ["instagram.com", "linkedin.com", "reddit.com"];

// MARK: - Messaging

type IncomingSettings = {
  type: "reelockr.settings";
  data: unknown;
};

function handleMessageFromBackground(message: IncomingSettings): void {
  rlog(`Received message from background: ${JSON.stringify(message)}`);
  if (message.type === "reelockr.settings") {
    mergeSettings(message.data);
    scheduleReapply();
  }
}

function listenToBackground(): void {
  if (window.__reelockrListenerInstalled) return;
  window.__reelockrListenerInstalled = true;

  browser.runtime.onMessage.addListener((message) => {
    if (
      typeof message === "object" &&
      message !== null &&
      (message as Record<string, unknown>).type === "reelockr.settings"
    ) {
      handleMessageFromBackground(message as IncomingSettings);
    }
  });
}

// MARK: - YouTube AI list

function setUpYouTubeAi(): void {
  if (!location.hostname.endsWith("youtube.com")) return;
  registerYouTubeAiAccount({
    isSignedIn: async () =>
      (await browser.storage.local.get(SUPABASE_AUTH_STORAGE_KEY))[SUPABASE_AUTH_STORAGE_KEY] != null,
    openSignIn: async () =>
      (await browser.runtime.sendMessage({ type: "reelockr.openSignIn" } satisfies OpenSignInMessage)) === true,
  });
  const applyList = (list: YouTubeAiSharedList | null) =>
    setYouTubeAiSharedList(list?.channels ?? null);
  void storage.getItem<YouTubeAiSharedList>(YOUTUBE_AI_SHARED_LIST_KEY).then(applyList);
  storage.watch<YouTubeAiSharedList>(YOUTUBE_AI_SHARED_LIST_KEY, applyList);
}

// MARK: - Entry Point

export default defineContentScript({
  matches: [
    "*://*.instagram.com/*",
    "*://*.youtube.com/*",
    "*://*.linkedin.com/*",
    "*://*.reddit.com/*",
    "*://*.x.com/*",
    "*://*.netflix.com/*",
    "*://*.tiktok.com/*",
    "*://*.facebook.com/*",
    // Possible future sites: Pinterest, Twitch, Medium, HackerNews, MSN, other news
  ],
  runAt: "document_start",

  async main() {
    try {
      registerDomSettingsWriter(saveSettingsPatch);
      setUpYouTubeAi();
      let processing = false;

      function applyReelockr(node: Element): void {
        processing = true;
        const url = window.location.href;

        rlog(`Applying DOM rules ${timeStr()}`);
        applyAllDomModifications(siteSettings(), url, node);

        processing = false;
      }

      // Inject CSS-only customizations at document_start so the page doesn't
      // briefly render its unstyled form before DOMContentLoaded.
      const earlyStylesPromise = (async () => {
        try {
          await Promise.all([ensureSettingsLoaded(), ensureProAccessLoaded()]);
          applyAllEarlyStaticStyles(siteSettings(), window.location.href);
        } catch (e) {
          console.warn("RelockIn early styles error:", e);
        }
      })();

      async function ensureApplyReelockrScripts(): Promise<void> {
        await earlyStylesPromise;
        await ensureSettingsLoaded();

        window.__reelockrApply = applyReelockr;
        window.__reelockrSettings = siteSettings();

        const root = document.documentElement;
        applyReelockr(root);
        listenToBackground();
        watchSettings(() => scheduleReapply());
        watchProAccess((access) => {
          proAccess = access;
          scheduleReapply();
        });

        let domChangeTimer: number = 0;

        const observer = new MutationObserver((mutations) => {
          const hasRelevantNode = mutations.some((m) =>
            Array.from(m.addedNodes).some(
              (n) => n.nodeType === 1 && !isInsideReelockrUi(n),
            ),
          );
          if (!hasRelevantNode) return;

          if (domChangeTimer) return;
          domChangeTimer = window.setTimeout(() => {
            domChangeTimer = 0;
            if (processing) return;
            try {
              applyReelockr(root);
            } catch (e) {
              console.error("RelockIn ERROR!", e);
            }
          }, 3000);
        });

        const hostname = location.hostname;
        if (hostname.endsWith("youtube.com")) {
          // YouTube needs no periodic re-scan: new content arrives as added
          // nodes (the observer above), the nav tabs are hidden by a
          // stylesheet, and the AI list runs its own annotator. Page changes
          // don't reload, so reapply as soon as one finishes, for the rules
          // that depend on the page (Home redirect, autoplay, end cards).
          document.addEventListener("yt-navigate-finish", scheduleReapply);
        } else if (
          PERIODIC_RESCAN_HOSTS.some((h) => hostname.endsWith(h)) &&
          !window.__reelockrDomInterval
        ) {
          window.__reelockrDomInterval = window.setInterval(() => {
            rlog(`Periodic reapply ${timeStr()}`);
            applyReelockr(root);
          }, 5000);
        }

        observer.observe(root, { childList: true, subtree: true });
      }

      if (document.readyState === "loading") {
        document.addEventListener(
          "DOMContentLoaded",
          ensureApplyReelockrScripts,
        );
      } else {
        await ensureApplyReelockrScripts();
      }
    } catch (e) {
      console.error("RelockIn ERROR", e);
    }
  },
});
