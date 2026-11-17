import { clearContainer, makeText } from "../utils/domHelpers";
import {
  RL_AMBER,
  RL_AMBER_BORDER,
  RL_AMBER_SOFT_BG,
  RL_FONT_TITLE,
} from "../designTokens";
import {
  makeBody,
  makeCloseTabButton,
  makeDivider,
  makeHeading,
  styleQuietButton,
} from "../components/cardParts";
import type { BlockFlow } from "../restrictions";
import { showInitialScreen } from "./initialScreen";
import { presentChallenge } from "~/shared/challenges/ui/ChallengeModal";
import { ChallengeResolver } from "~/shared/challenges/ChallengeResolver";
import type { ChallengeContext } from "~/shared/challenges/ChallengeTypes";
import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
import { t, tp } from "~/lib/i18n";

/**
 * Blocking screen shown when sessions were started back-to-back and the
 * quick-return guard has paused new ones. Mirrors the schedule block screen:
 * a clear headline + why it fired, plus a toned-down bypass that runs the
 * `rapidSessionStart` challenge.
 *
 * The pause is time-boxed, so the countdown ticks down in place and drops the
 * user onto the normal start screen when it lifts. Only fronted when the pause
 * is the *only* thing blocking — when other restrictions are active too, the
 * override flow behind their screen already covers this one.
 */
export function showQuickReturnBlockedScreen(
  container: HTMLDivElement,
  flow: BlockFlow,
): void {
  const { status, onStartSession, onClearQuickReturnBlock } = flow;
  clearContainer(container);

  container.appendChild(makeHeading(t("session_takeABreak")));

  const count = status.quickReturnCount;
  container.appendChild(
    makeBody(
      count > 1
        ? tp("session_quickReturnExplanationCount", count)
        : t("session_quickReturnExplanation"),
    ),
  );

  // The countdown is the point of the screen — the break is only bearable if
  // you can see it ending — so it gets the clock treatment rather than a line
  // of body text.
  const countdownWrap = document.createElement("div");
  Object.assign(countdownWrap.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "2px",
    padding: "12px 16px",
    borderRadius: "14px",
    background: RL_AMBER_SOFT_BG,
    border: `1px solid ${RL_AMBER_BORDER}`,
  });
  container.appendChild(countdownWrap);

  countdownWrap.appendChild(
    makeText(t("session_reopensInLabel"), {
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.8px",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.55)",
      textAlign: "start",
    }),
  );

  const countdown = makeText("", {
    fontSize: "40px",
    fontWeight: "700",
    fontFamily: RL_FONT_TITLE,
    fontVariantNumeric: "tabular-nums",
    color: RL_AMBER,
    textAlign: "start",
    lineHeight: "1.15",
  });
  countdownWrap.appendChild(countdown);

  const blockedUntil = status.quickReturnBlockedUntil ?? 0;

  // This screen is built before the overlay is mounted, so "is the countdown
  // still in the document" only becomes a meaningful liveness test after the
  // first time we see the container attached.
  let hasMounted = false;

  const tick = () => {
    if (container.isConnected) hasMounted = true;
    // Stop ticking once another screen replaced ours, or the whole overlay
    // was torn down.
    if (!container.contains(countdown) || (hasMounted && !container.isConnected)) {
      clearInterval(timer);
      return;
    }
    const remaining = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
    countdown.textContent = formatCountdown(remaining);
    if (remaining === 0) {
      clearInterval(timer);
      showInitialScreen(container, status, onStartSession);
    }
  };
  const timer = setInterval(tick, 1000);
  tick();

  const bypassContext: ChallengeContext = { type: "rapidSessionStart", count };

  const bypassBtn = document.createElement("button");
  bypassBtn.textContent = t("session_bypassBreak");
  // Text-only so it reads as "not encouraged".
  styleQuietButton(bypassBtn);
  // Hidden until we know the guardrails allow bypassing at all.
  bypassBtn.style.visibility = "hidden";
  bypassBtn.addEventListener("click", () => {
    presentChallenge({
      context: bypassContext,
      ruleId: status.ruleId,
      goalText: t("challengeGoals_bypassBreak"),
    })
      .then(async () => {
        clearInterval(timer);
        // Persist the bypass before offering the start screen — otherwise the
        // background would still refuse the session it's about to be asked for.
        await onClearQuickReturnBlock();
        showInitialScreen(container, status, onStartSession);
      })
      .catch(() => {
        // User cancelled the challenge — stay on the block screen.
      });
  });
  container.appendChild(makeCloseTabButton("primary"));
  const divider = makeDivider();
  container.appendChild(divider);
  container.appendChild(bypassBtn);

  // Removed when the guardrails make bypassing impossible. The break still
  // ends on its own, so nothing is left unexplained.
  new ChallengeResolver(createWxtChallengeStorage())
    .isAllowed(bypassContext, status.ruleId)
    .then((isAllowed) => {
      if (!isAllowed) {
        bypassBtn.remove();
        divider.remove();
      }
    })
    .catch((e) => {
      // Keep the button: the challenge still refuses if bypassing isn't allowed.
      console.warn("[RELOCKR] Bypass lookup failed:", String(e));
    })
    .finally(() => {
      bypassBtn.style.visibility = "visible";
    });
}

/** m:ss, matching the session timer's clock. */
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
