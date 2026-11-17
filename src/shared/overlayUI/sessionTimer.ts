import type { RuleSessionStatus } from "~/types/messages";
import { t } from "~/lib/i18n";
import {
  RL_GRADIENT,
  RL_FONT_TITLE,
  RL_FONT_BODY,
} from "./designTokens";

export const SESSION_TIMER_ID = "relockr-session-timer";

export type OnStopSession = (ruleId: string) => void;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let currentRemainingSeconds = 0;
let dismissed = false;
let currentOnStop: OnStopSession | null = null;
let currentRuleId: string | null = null;
let currentRuleName: string | null = null;

// ── Drag state ───────────────────────────────────────────────────────
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getTimerEl(): HTMLElement | null {
  return document.getElementById(SESSION_TIMER_ID);
}

function startLocalTick(): void {
  stopLocalTick();
  tickInterval = setInterval(() => {
    if (!document.hasFocus()) return;
    currentRemainingSeconds = Math.max(0, currentRemainingSeconds - 1);
    const el = getTimerEl();
    if (el) {
      const span = el.querySelector("[data-rl-time]");
      if (span) span.textContent = formatTime(currentRemainingSeconds);
    }
  }, 1_000);
}

function stopLocalTick(): void {
  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

/**
 * Call on every heartbeat/session-check response to sync the timer.
 * Pass `null` when no active session exists to hide the timer.
 */
export function syncSessionTimer(
  status: RuleSessionStatus | null,
  enabled: boolean,
  onStop?: OnStopSession,
): void {
  if (!enabled || !status || !status.hasActiveSession) {
    removeSessionTimer();
    return;
  }

  if (dismissed) return;

  currentRemainingSeconds = Math.max(0, status.sessionRemainingSeconds);
  currentRuleId = status.ruleId;
  currentRuleName = status.ruleName;
  if (onStop) currentOnStop = onStop;

  let el = getTimerEl();
  if (!el) {
    el = createTimerElement();
    (document.body || document.documentElement).appendChild(el);
    startLocalTick();
  }

  const span = el.querySelector("[data-rl-time]");
  if (span) span.textContent = formatTime(currentRemainingSeconds);
}

export function removeSessionTimer(): void {
  stopLocalTick();
  getTimerEl()?.remove();
}

/** Reset dismissed state (e.g. when a new session starts). */
export function resetTimerDismissed(): void {
  dismissed = false;
}

// ── Popover ──────────────────────────────────────────────────────────

function createPopover(wrapper: HTMLElement): HTMLElement {
  const popover = document.createElement("div");
  Object.assign(popover.style, {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: "0",
    minWidth: "180px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "rgba(20, 20, 30, 0.94)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
    fontFamily: RL_FONT_BODY,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    zIndex: "2147483647",
  });

  // Rule name
  const nameEl = document.createElement("div");
  nameEl.textContent = t("overlay_sessionTimerCurrentRuleFormat", [
    currentRuleName ?? t("usage_unknownRule"),
  ]);
  Object.assign(nameEl.style, {
    fontSize: "13px",
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    letterSpacing: "0.3px",
  });
  popover.appendChild(nameEl);

  // Stop session button
  const stopBtn = document.createElement("button");
  stopBtn.textContent = t("session_endSession");
  applyPopoverBtnStyle(stopBtn, "rgb(235, 115, 115)");
  stopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentOnStop && currentRuleId) {
      currentOnStop(currentRuleId);
    }
  });
  popover.appendChild(stopBtn);

  // Open Relockr button
  const openBtn = document.createElement("button");
  openBtn.textContent = t("overlay_sessionTimerOpenRelockIn");
  applyPopoverBtnStyle(openBtn, null);
  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const popupUrl = browser.runtime.getURL("/popup.html");
    window.open(popupUrl, "_blank");
    closePopover(wrapper);
  });
  popover.appendChild(openBtn);

  return popover;
}

function applyPopoverBtnStyle(
  btn: HTMLButtonElement,
  color: string | null,
): void {
  Object.assign(btn.style, {
    all: "unset",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 12px",
    fontSize: "13px",
    fontWeight: "600",
    fontFamily: RL_FONT_BODY,
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 0.15s, opacity 0.15s",
    color: color ?? "#fff",
    background: color
      ? "rgba(235, 115, 115, 0.12)"
      : "rgba(255, 255, 255, 0.08)",
    border: "none",
    textAlign: "center",
    userSelect: "none",
  });
  const hoverBg = color
    ? "rgba(235, 115, 115, 0.22)"
    : "rgba(255, 255, 255, 0.14)";
  const baseBg = color
    ? "rgba(235, 115, 115, 0.12)"
    : "rgba(255, 255, 255, 0.08)";
  btn.addEventListener("mouseenter", () => {
    btn.style.background = hoverBg;
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = baseBg;
  });
}

function togglePopover(wrapper: HTMLElement, menuBtn: HTMLElement): void {
  const existing = wrapper.querySelector("[data-rl-popover]");
  if (existing) {
    existing.remove();
    return;
  }
  const popover = createPopover(wrapper);
  popover.setAttribute("data-rl-popover", "");
  wrapper.appendChild(popover);

  // Close when clicking outside
  const onDocClick = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node) && e.target !== menuBtn) {
      closePopover(wrapper);
      document.removeEventListener("click", onDocClick, true);
    }
  };
  // Use setTimeout so the current click doesn't immediately close it
  setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
}

function closePopover(wrapper: HTMLElement): void {
  wrapper.querySelector("[data-rl-popover]")?.remove();
}

// ── Timer element ────────────────────────────────────────────────────

function createTimerElement(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.id = SESSION_TIMER_ID;
  Object.assign(wrapper.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 14px",
    borderRadius: "12px",
    background: "rgba(20, 20, 30, 0.88)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
    fontFamily: RL_FONT_TITLE,
    fontSize: "14px",
    color: "#fff",
    cursor: "grab",
    userSelect: "none",
    transition: "opacity 0.2s ease",
  });

  const timeSpan = document.createElement("span");
  timeSpan.setAttribute("data-rl-time", "");
  timeSpan.textContent = formatTime(currentRemainingSeconds);
  Object.assign(timeSpan.style, {
    background: RL_GRADIENT,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    fontWeight: "700",
    letterSpacing: "0.5px",
  });
  wrapper.appendChild(timeSpan);

  // Menu button (three dots)
  const menuBtn = document.createElement("span");
  menuBtn.textContent = "\u22EF";
  menuBtn.setAttribute("aria-label", t("overlay_sessionTimerMoreAccessibility"));
  Object.assign(menuBtn.style, {
    fontSize: "16px",
    lineHeight: "1",
    color: "rgba(255, 255, 255, 0.4)",
    cursor: "pointer",
    transition: "color 0.15s",
    padding: "0 2px",
  });
  menuBtn.addEventListener("mouseenter", () => {
    menuBtn.style.color = "rgba(255, 255, 255, 0.8)";
  });
  menuBtn.addEventListener("mouseleave", () => {
    menuBtn.style.color = "rgba(255, 255, 255, 0.4)";
  });
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePopover(wrapper, menuBtn);
  });
  wrapper.appendChild(menuBtn);

  // Dismiss button
  const closeBtn = document.createElement("span");
  closeBtn.textContent = "\u00d7";
  closeBtn.setAttribute("aria-label", t("common_close"));
  Object.assign(closeBtn.style, {
    fontSize: "16px",
    lineHeight: "1",
    color: "rgba(255, 255, 255, 0.4)",
    cursor: "pointer",
    transition: "color 0.15s",
  });
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.color = "rgba(255, 255, 255, 0.8)";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.color = "rgba(255, 255, 255, 0.4)";
  });
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissed = true;
    removeSessionTimer();
  });
  wrapper.appendChild(closeBtn);

  // ── Drag behaviour ─────────────────────────────────────────────
  wrapper.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (target === closeBtn || target === menuBtn) return;
    // Don't drag if clicking inside the popover
    if ((target as Element).closest?.("[data-rl-popover]")) return;
    isDragging = true;
    wrapper.style.cursor = "grabbing";
    const rect = wrapper.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    e.preventDefault();
  });

  addDocumentDragListenersOnce();

  return wrapper;
}

let documentDragListenersAdded = false;

/**
 * Moves whichever timer is on the page, so these are added once rather than
 * with each timer element, which is rebuilt every session.
 */
function addDocumentDragListenersOnce(): void {
  if (documentDragListenersAdded) return;
  documentDragListenersAdded = true;

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const el = getTimerEl();
    if (!el) return;
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    Object.assign(el.style, {
      left: `${x}px`,
      top: `${y}px`,
      right: "auto",
      bottom: "auto",
    });
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    const el = getTimerEl();
    if (el) el.style.cursor = "grab";
  });
}
