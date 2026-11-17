import {
  RL_CARD_BG,
  RL_CARD_BORDER,
  RL_FONT_BODY,
  RL_TEXT_MUTED,
} from "../designTokens";
import { APP_STORE_URL, PLAY_STORE_URL } from "~/shared/upsell/storeUrls";
import { t } from "~/lib/i18n";

const APP_STORE_IMG = "/images/AppleStoreButton.svg";
const PLAY_STORE_IMG = "/images/GooglePlayButton.svg";
const QR_IMG = "/images/DownloadRelockInQrLockScreen.svg";

// Tall enough for the popover (QR + badges) to open above the link without
// running off the top of the viewport.
const VISIBILITY_QUERY = "(min-height: 560px) and (min-width: 480px)";

const PHONE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>`;

/**
 * Builds the "Get RelockIn on your phone" link that sits under the overlay
 * card. Clicking it opens a popover with the App Store / QR / Play Store row,
 * so the upsell stays out of the way of the card until asked for. Hides
 * itself on viewports too small to fit the popover.
 */
export function createAppUpsell(): HTMLDivElement {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "relative",
    display: "none",
    flexShrink: "0",
    fontFamily: RL_FONT_BODY,
  });

  const toggle = document.createElement("button");
  toggle.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 10px;
    font-family: ${RL_FONT_BODY};
    font-size: 13px;
    color: ${RL_TEXT_MUTED} !important;
    cursor: pointer;
    user-select: none;
    transition: color 0.15s ease, background 0.15s ease;
  `;
  toggle.innerHTML = PHONE_ICON;
  const label = document.createElement("span");
  label.textContent = t("overlay_appUpsellHeadline");
  toggle.appendChild(label);
  toggle.setAttribute("aria-expanded", "false");
  wrapper.appendChild(toggle);

  const popover = document.createElement("div");
  Object.assign(popover.style, {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    display: "none",
    alignItems: "center",
    gap: "16px",
    padding: "16px 20px",
    borderRadius: "16px",
    background: RL_CARD_BG,
    border: `1px solid ${RL_CARD_BORDER}`,
    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
  });
  popover.appendChild(makeStoreLink(APP_STORE_URL, APP_STORE_IMG, "App Store"));
  popover.appendChild(makeQr());
  popover.appendChild(makeStoreLink(PLAY_STORE_URL, PLAY_STORE_IMG, "Google Play"));
  wrapper.appendChild(popover);

  const setOpen = (open: boolean) => {
    popover.style.display = open ? "flex" : "none";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.style.background = open ? "rgba(255,255,255,0.08)" : "transparent";
  };
  toggle.addEventListener("click", () => {
    setOpen(popover.style.display === "none");
  });

  // Clicking anywhere else closes it. The listener outlives the overlay, so
  // it drops itself once the overlay is gone.
  const onDocClick = (e: MouseEvent) => {
    if (!wrapper.isConnected) {
      document.removeEventListener("click", onDocClick, true);
      return;
    }
    if (!wrapper.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener("click", onDocClick, true);

  const mql = window.matchMedia(VISIBILITY_QUERY);
  const apply = () => {
    wrapper.style.display = mql.matches ? "block" : "none";
    if (!mql.matches) setOpen(false);
  };
  apply();
  mql.addEventListener("change", apply);

  return wrapper;
}

function makeStoreLink(
  href: string,
  imgPath: string,
  altText: string,
): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  Object.assign(a.style, {
    display: "inline-flex",
    transition: "opacity 0.15s ease, transform 0.12s ease",
    opacity: "0.92",
  });
  a.addEventListener("mouseenter", () => {
    a.style.opacity = "1";
    a.style.transform = "translateY(-1px)";
  });
  a.addEventListener("mouseleave", () => {
    a.style.opacity = "0.92";
    a.style.transform = "none";
  });

  const img = makeBundledSvg(imgPath, altText);
  Object.assign(img.style, {
    height: "40px",
    width: "auto",
    display: "block",
  });
  a.appendChild(img);
  return a;
}

function makeQr(): HTMLElement {
  const img = makeBundledSvg(QR_IMG, t("overlay_appUpsellQrAlt"));
  Object.assign(img.style, {
    width: "120px",
    height: "120px",
    borderRadius: "8px",
    background: "#fff",
    padding: "4px",
    boxSizing: "border-box",
    display: "block",
  });
  return img;
}

/**
 * Firefox's extension URLs contain an ID unique to each install, and a page can
 * read an <img>'s URL, so there the SVG is drawn inline instead. The caller sizes
 * the returned element.
 */
function makeBundledSvg(path: string, altText: string): HTMLElement {
  const url = browser.runtime.getURL(path as any);
  if (!import.meta.env.FIREFOX) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = altText;
    return img;
  }

  const box = document.createElement("span");
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", altText);
  void fetch(url)
    .then((response) => response.text())
    .then((text) => {
      const svg = new DOMParser().parseFromString(text, "image/svg+xml")
        .documentElement as unknown as SVGSVGElement;
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      Object.assign(svg.style, { display: "block", height: "100%", width: "auto" });
      box.appendChild(document.importNode(svg, true));
    })
    .catch((e) => console.warn("[RELOCKR] Couldn't load image", path, e));
  return box;
}
