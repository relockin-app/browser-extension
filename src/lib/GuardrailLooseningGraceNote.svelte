<script lang="ts">
  // Shown for a while after onboarding, while guardrails can still be made
  // easier without a challenge. Says how long that lasts, so the free
  // loosening doesn't read as a bug and the rule is known before it applies.
  // Mirrors iOS GuardrailLooseningGraceNote.swift.
  import { onMount } from "svelte";
  import { Clock } from "@lucide/svelte";
  import { gracePeriodRemainingMs } from "~/shared/challenges/GuardrailLoosening";
  import {
    isLooseningChallengeRequired,
    watchLooseningChallengeRequired,
  } from "~/shared/challenges/GuardrailLooseningSettings";
  import { t, tp } from "./i18n";

  let isChallengeRequired = $state(false);
  let remainingMs = $state<number | null>(null);

  let minutesRemaining = $derived(
    remainingMs === null ? null : Math.ceil(remainingMs / 60_000),
  );

  onMount(() => {
    const refresh = async () => {
      remainingMs = await gracePeriodRemainingMs(Date.now());
    };
    void (async () => {
      isChallengeRequired = await isLooseningChallengeRequired();
      await refresh();
    })();

    const timer = setInterval(refresh, 15_000);
    const unwatch = watchLooseningChallengeRequired((isRequired) => {
      isChallengeRequired = isRequired;
    });
    return () => {
      clearInterval(timer);
      unwatch();
    };
  });
</script>

{#if isChallengeRequired && minutesRemaining !== null}
  <div class="grace-note">
    <Clock size={15} strokeWidth={2} class="icon" />
    <span>
      {tp("challenges_looseningGraceMinutes", Math.max(1, minutesRemaining))}
    </span>
  </div>
{/if}

<style>
  .grace-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(115, 158, 235, 0.1);
    color: var(--rl-accent-blue);
    font-size: 12px;
    line-height: 1.4;
  }

  .grace-note span {
    color: rgba(255, 255, 255, 0.85);
  }

  .grace-note :global(.icon) {
    flex-shrink: 0;
    margin-top: 1px;
  }
</style>
