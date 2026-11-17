<script lang="ts">
  import { onMount } from "svelte";
  import { X } from "@lucide/svelte";
  import type { CoachMarkId, OnboardingState } from "~/types/models";
  import { t } from "./i18n";

  interface Props {
    id: CoachMarkId;
    title: string;
    body: string;
    /** Which edge the dialog tail stems from. Pick the edge that points
     * toward the UI element the coach mark is describing. */
    tail?: "top" | "bottom";
    /**
     * "muted" is the same muted purple as the schedules tutorial's thought
     * bubbles, for tips that follow on from that tutorial, where the bright
     * gradient would shout over a calm screen.
     */
    variant?: "gradient" | "muted";
    /** Called after the close button records the dismissal. */
    ondismiss?: () => void;
  }

  let { id, title, body, tail, variant = "gradient", ondismiss }: Props = $props();

  const ONBOARDING_STATE_KEY = "local:onboardingState";

  let visible = $state(false);

  onMount(async () => {
    const state = await storage.getItem<OnboardingState>(ONBOARDING_STATE_KEY);
    visible = !(state?.dismissedCoachMarks ?? []).includes(id);
  });

  async function dismiss(): Promise<void> {
    visible = false;
    const existing =
      (await storage.getItem<OnboardingState>(ONBOARDING_STATE_KEY)) ?? {
        motivations: [],
        selectedSites: [],
        ruleOnboardingCompleted: false,
        dismissedCoachMarks: [],
      };
    const next = new Set<CoachMarkId>(existing.dismissedCoachMarks ?? []);
    next.add(id);
    await storage.setItem(ONBOARDING_STATE_KEY, {
      ...existing,
      dismissedCoachMarks: [...next],
    });
    ondismiss?.();
  }
</script>

{#if visible}
  <aside
    class="coach-mark"
    class:tail-top={tail === "top"}
    class:tail-bottom={tail === "bottom"}
    class:muted={variant === "muted"}
  >
    <div class="text">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
    <button class="close" type="button" onclick={dismiss} aria-label={t("common_dismiss")}>
      <X size={14} strokeWidth={2.5} />
    </button>
  </aside>
{/if}

<style>
  /* The tail attaches at horizontal center of the bubble. Because --rl-gradient
   * runs left→right (blue→lavender), the bubble's color along that vertical
   * strip is the gradient midpoint, so a solid-color tail in that midpoint
   * color reads as continuous with the bubble at the seam. */
  .coach-mark {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: var(--rl-gradient);
    border-radius: 14px;
    padding: 14px 16px;
    margin: 8px 16px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  }

  .coach-mark.tail-top {
    margin-top: 18px;
  }

  .coach-mark.tail-bottom {
    margin-bottom: 18px;
  }

  .coach-mark.tail-top::before,
  .coach-mark.tail-bottom::after {
    content: "";
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 9px solid transparent;
    border-right: 9px solid transparent;
  }

  .coach-mark.tail-top::before {
    top: -10px;
    border-bottom: 10px solid rgb(144, 153, 239);
  }

  .coach-mark.tail-bottom::after {
    bottom: -10px;
    border-top: 10px solid rgb(144, 153, 239);
  }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  h3 {
    margin: 0;
    font-family: var(--rl-font-body);
    font-size: 16px;
    font-weight: 700;
    color: #111114;
  }

  p {
    margin: 0;
    font-family: var(--rl-font-body);
    font-size: 14px;
    line-height: 1.4;
    color: rgba(17, 17, 20, 0.82);
  }

  .close {
    all: unset;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(17, 17, 20, 0.12);
    border-radius: 50%;
    cursor: pointer;
    color: #111114;
    transition: background 0.15s ease;
  }

  .close:hover {
    background: rgba(17, 17, 20, 0.2);
  }

  .coach-mark.muted {
    background: #454061;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }
  .coach-mark.muted.tail-top::before {
    border-bottom-color: #454061;
  }
  .coach-mark.muted.tail-bottom::after {
    border-top-color: #454061;
  }
  .coach-mark.muted h3 {
    color: #fff;
  }
  .coach-mark.muted p {
    color: var(--rl-subtitle);
  }
  .coach-mark.muted .close {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
  .coach-mark.muted .close:hover {
    background: rgba(255, 255, 255, 0.16);
  }
</style>
