import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  dev: {
    server: {
      port: 3111,
    },
  },
  modules: ["@wxt-dev/module-svelte"],
  zip: {
    // Keeps the sources zip sent to Mozilla to what the build needs. WXT doesn't
    // read .gitignore here, so htmlExamples and ai-list would otherwise go in.
    excludeSources: [
      "**/htmlExamples/**",
      "ai-list/**",
      "AGENTS.md",
      "CLAUDE.md",
      "TODOS.md",
      "design/**",
      "docs/**",
    ],
  },
  manifest: ({ mode, browser, manifestVersion }) => ({
    // Firefox Add-ons allows a shorter name than the Chrome Web Store.
    name:
      browser === "firefox"
        ? "__MSG_about_extensionNameFirefox__"
        : "__MSG_about_extensionName__",
    short_name: "__MSG_about_extensionShortName__",
    description: "__MSG_about_extensionDescription__",
    default_locale: "en",
    permissions: [
      "identity",
      "storage",
      "alarms",
      // Chromium-only: lets extension pages read cached favicons via
      // /_favicon/ (rule card site icons). Shows no install warning.
      ...(manifestVersion === 3 && browser !== "firefox" && browser !== "safari"
        ? ["favicon"]
        : []),
    ],
    // key is needed in dev for stable extension ID (OAuth redirects), but
    // Chrome Web Store rejects it on upload. Key is for dev ID
    ...(mode === "development" && {
      key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkFN7YDhsoNfIG2BOM0O7zQFtzHlK6OTFwQmJGZDqDyF0lpu0UsfZNc+3Y5/NH4KskHobM3FPDgNh1R9uDdfHIdpLErC4xhdbUfkgYiGQTfTZ8XQhNLz6Y1GOrk6ZEN1UZclr8howfJ4bM9QvZy/5joIDMaVr1wOXS2igZ+RpDcxYrugTdtEVGB+e/avy6aD2D9bRhMbQ8PjikhX+b3Rt3REgjeMaZt8urqneca2+KPEcmxYyQuTOm8iw+P1gG7hRU9i4+B0GkLlTaK9kIco1SG2htLeT0981Zt9mHlCLcMcSa6OsV+y6q3Tu4RTuDBVikUqxQYi1RV8NRN3MFQqNcwIDAQAB",
    }),
    browser_specific_settings: {
      gecko: {
        id: "relockin@relockin.com",
        ...(browser === "firefox" && {
          strict_min_version: "140.0",
          // Nothing is sent until the user agrees at sign-in; see shared/dataConsent.ts.
          data_collection_permissions: {
            required: ["none"],
            optional: [
              "authenticationInfo",
              "personallyIdentifyingInfo",
              "browsingActivity",
            ],
          },
        }),
      },
      ...(browser === "firefox" && {
        gecko_android: {
          strict_min_version: "142.0",
        },
      }),
    },
    // Content scripts on any site can show our UI, so these load from any page.
    web_accessible_resources: [
      {
        resources: ["fonts/*", "images/*"],
        matches: ["<all_urls>"],
      },
    ],
  }),
});
