import { clearContainer, makeText } from "../utils/domHelpers";
import { makeHeading, stylePrimaryBlock } from "../components/cardParts";
import { RL_FONT_BODY, RL_FONT_TITLE } from "../designTokens";
import {
  type BlockFlow,
  challengeStrengthSubtitle,
  isRestrictionChallengeAllowed,
  strictestRestrictionChallenge,
} from "../restrictions";
import { showBlockedScreen } from "./blockedScreen";
import { showOverrideTimePickerScreen } from "./overrideTimePickerScreen";
import { presentChallenge } from "~/shared/challenges/ui/ChallengeModal";
import { rlog } from "~/shared/rlog";
import { t } from "~/lib/i18n";

interface Tier {
  /** Bold header text for the tier button. */
  headerKey: () => string;
  /** Subtitle describing the challenge difficulty. */
  subtitleKey: () => string;
  /**
   * Representative `requestedMinutes` used to map this tier to a difficulty
   * via getTriggerKey() in ChallengeTypes — mirrors iOS overrideSizeButtons.
   */
  requestedMinutes: number;
  /** Hard cap on the session length the user can pick after unlocking. */
  capMinutes: number;
}

const TIERS: Tier[] = [
  {
    headerKey: () => t("session_overrideSizeLow"),
    subtitleKey: () => t("session_overrideTierChallengeEasy"),
    requestedMinutes: 1,
    capMinutes: 2,
  },
  {
    headerKey: () => t("session_overrideSizeMedium"),
    subtitleKey: () => t("session_overrideTierChallengeMedium"),
    requestedMinutes: 5,
    capMinutes: 10,
  },
  {
    headerKey: () => t("session_overrideSizeHigh"),
    subtitleKey: () => t("session_overrideTierChallengeHard"),
    requestedMinutes: 30,
    capMinutes: 60,
  },
];

/**
 * Whether any override tier can be unlocked for `flow`. False when the
 * guardrails make every tier Impossible, in which case block screens say so
 * instead of offering an override that leads nowhere.
 */
export async function hasAllowedOverrideTier(flow: BlockFlow): Promise<boolean> {
  for (const tier of TIERS) {
    const challenge = await strictestRestrictionChallenge(
      flow,
      tier.requestedMinutes,
    );
    if (isRestrictionChallengeAllowed(challenge)) return true;
  }
  return false;
}

/** Note shown in place of override options when no tier can be unlocked. */
export function makeOverridesNotAllowedNote(): HTMLDivElement {
  return makeText(t("session_overridesNotAllowed"), {
    fontSize: "13px",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: "1.5",
  });
}

/**
 * Override-tier picker, shared by every blocking restriction. Each tier gates
 * one challenge — the strictest of the active restrictions at that tier — and
 * on success the user lands on the time picker (capped to the chosen tier),
 * from where the session starts past all of them at once.
 *
 * The tier is picked before the challenge because the daily and schedule
 * challenges scale with how much time is being asked for: strictness can only
 * be compared once the size is known.
 */
export function showOverrideSizePickerScreen(
  container: HTMLDivElement,
  flow: BlockFlow,
): void {
  clearContainer(container);

  container.appendChild(makeHeading(t("session_overrideExtraTimePrompt")));

  const tiersWrap = document.createElement("div");
  Object.assign(tiersWrap.style, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "100%",
    // Hidden until storage says which tiers can be unlocked, so a tier set to
    // Impossible never flashes up and then vanishes.
    visibility: "hidden",
  });
  container.appendChild(tiersWrap);

  // Resolving the strictest challenge hits storage, so a second tap while
  // that's in flight would open two modals.
  let unlocking = false;

  const buttons = new Map<Tier, TierButton>();

  for (const tier of TIERS) {
    const button = makeTierButton(tier, async () => {
      if (unlocking) return;
      unlocking = true;
      try {
        const challenge = await strictestRestrictionChallenge(
          flow,
          tier.requestedMinutes,
        );
        await presentChallenge({
          context: challenge.context,
          ruleId: flow.status.ruleId,
          goalText: challenge.goalText,
        });
        showOverrideTimePickerScreen(container, flow, tier.capMinutes);
      } catch (e) {
        // User cancelled the challenge (or it failed to open) — stay on the
        // size picker.
        rlog("Override challenge not completed:", String(e));
      } finally {
        unlocking = false;
      }
    });
    buttons.set(tier, button);
    tiersWrap.appendChild(button.el);
  }

  // The static subtitles name the tier's own difficulty, which is only the
  // whole story when this tier's restriction is also the strictest one active.
  // Correct them in place once storage says otherwise, and drop the tiers no
  // challenge can unlock rather than offering them only to refuse.
  void (async () => {
    try {
      for (const [tier, button] of buttons) {
        try {
          const challenge = await strictestRestrictionChallenge(
            flow,
            tier.requestedMinutes,
          );
          // Bail out if another screen has since replaced this one.
          if (!container.contains(button.el)) continue;
          if (!isRestrictionChallengeAllowed(challenge)) {
            button.el.remove();
            continue;
          }
          if (challenge.strength === null) continue;
          const text = challengeStrengthSubtitle(challenge.strength);
          if (text) button.subtitle.textContent = text;
        } catch (e) {
          console.warn("[RELOCKR] Tier difficulty lookup failed:", String(e));
        }
      }
      // Every tier is Impossible. Say so rather than leaving an empty picker.
      if (tiersWrap.childElementCount === 0) {
        tiersWrap.appendChild(makeOverridesNotAllowedNote());
      }
    } finally {
      tiersWrap.style.visibility = "visible";
    }
  })();

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = t("common_cancel");
  stylePrimaryBlock(cancelBtn);
  cancelBtn.addEventListener("click", () => {
    showBlockedScreen(container, flow);
  });
  container.appendChild(cancelBtn);
}

interface TierButton {
  el: HTMLButtonElement;
  /** Exposed so the resolved difficulty can replace the tier's nominal one. */
  subtitle: HTMLDivElement;
}

function makeTierButton(tier: Tier, onClick: () => void): TierButton {
  const btn = document.createElement("button");
  btn.style.cssText = `
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;

    padding: 12px 14px;
    width: 100%;
    box-sizing: border-box;

    font-family: ${RL_FONT_BODY};
    color: rgba(255,255,255,0.9);

    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 12px;

    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease, transform 0.12s ease;
  `;

  const header = document.createElement("div");
  Object.assign(header.style, {
    fontFamily: RL_FONT_TITLE,
    fontSize: "16px",
    fontWeight: "700",
    color: "rgba(255,255,255,0.95)",
  });
  header.textContent = tier.headerKey();
  btn.appendChild(header);

  const subtitle = document.createElement("div");
  Object.assign(subtitle.style, {
    fontSize: "12px",
    color: "rgba(255,255,255,0.6)",
  });
  subtitle.textContent = tier.subtitleKey();
  btn.appendChild(subtitle);

  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(255,255,255,0.12)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "rgba(255,255,255,0.06)";
  });
  btn.addEventListener("mousedown", () => {
    btn.style.transform = "scale(0.985)";
  });
  btn.addEventListener("mouseup", () => {
    btn.style.transform = "none";
  });
  btn.addEventListener("click", onClick);

  return { el: btn, subtitle };
}
