<script lang="ts">
  import type { RelockrRule, RuleTarget } from "~/types/models";
  import { RuleTargetType } from "~/types/models";
  import type { ReelockrStorage, CreateTargetInput } from "~/storage";
  import { createWxtChallengeStorage } from "~/storage/challengeWxtStorage";
  import RuleTargetRow from "./RuleTargetRow.svelte";
  import RuleSiteIcons from "./RuleSiteIcons.svelte";
  import { t, tp } from "./i18n";
  import { formatHoursMinutes } from "~/shared/overlayUI/utils/intlFormat";
  import { presentChallenge } from "~/shared/challenges/ui/ChallengeModal";

  let {
    rule,
    store,
    onDeleted,
    onUpdated,
    onCustomizeChallenges,
  }: {
    rule: RelockrRule;
    store: ReelockrStorage;
    onDeleted: () => void;
    onUpdated: (rule: RelockrRule) => void;
    onCustomizeChallenges: () => void;
  } = $props();

  const challengeStore = createWxtChallengeStorage();

  const GRACE_PERIOD_MS = 30 * 60 * 1000;

  let expanded = $state(false);
  let pendingNewTargetId = $state<string | null>(null);
  let editingMinutes = $state(false);
  let minutesDraft = $state(Math.round(rule.allowedSeconds / 60));
  let editingName = $state(false);
  let nameDraft = $state("");

  function autofocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function isWithinGracePeriod(): boolean {
    if (!rule.createdAt) return false;
    return Date.now() - rule.createdAt < GRACE_PERIOD_MS;
  }

  function formatTime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return formatHoursMinutes(h, m);
  }

  function startEditName() {
    nameDraft = rule.name;
    editingName = true;
  }

  async function commitNameEdit() {
    if (!editingName) return;
    editingName = false;
    const name = nameDraft.trim();
    if (!name || name === rule.name) return;
    const updated = await store.updateRule(rule.id, { name });
    onUpdated(updated);
  }

  function startEditMinutes() {
    minutesDraft = Math.round(rule.allowedSeconds / 60);
    editingMinutes = true;
  }

  function cancelMinutesEdit() {
    editingMinutes = false;
  }

  async function commitMinutesEdit() {
    const newMinutes = Math.floor(minutesDraft);
    if (!Number.isFinite(newMinutes) || newMinutes < 1) {
      // Invalid input: discard and exit edit mode.
      editingMinutes = false;
      return;
    }
    const currentMinutes = Math.round(rule.allowedSeconds / 60);
    if (newMinutes === currentMinutes) {
      editingMinutes = false;
      return;
    }
    if (newMinutes > currentMinutes && !isWithinGracePeriod()) {
      try {
        await presentChallenge({
          context: { type: "increaseAllowedMinutes" },
          ruleId: rule.id,
          goalText: t("challengeGoals_increaseAllowedMinutes"),
        });
      } catch {
        // Challenge cancelled — stay in edit mode so the user can adjust.
        return;
      }
    }
    const updated = await store.updateRule(rule.id, { allowedSeconds: newMinutes * 60 });
    onUpdated(updated);
    editingMinutes = false;
  }

  async function handleDelete() {
    if (!isWithinGracePeriod()) {
      try {
        await presentChallenge({
          context: { type: "deleteRule" },
          ruleId: rule.id,
          goalText: t("challengeGoals_deleteRule"),
        });
      } catch {
        return; // User cancelled the challenge
      }
    }
    await store.deleteRule(rule.id);
    await challengeStore.deleteOverridesForRule(rule.id);
    onDeleted();
  }

  async function handleAddTarget() {
    const input: CreateTargetInput = {
      targetType: RuleTargetType.Domain,
      pattern: "",
      enabled: true,
    };
    const target = await store.addTarget(rule.id, input);
    pendingNewTargetId = target.id;
    rule.targets = [...rule.targets, target];
    onUpdated(rule);
  }

  async function handleUpdateTarget(
    id: string,
    updates: Partial<Pick<RuleTarget, "targetType" | "pattern">>
  ) {
    const updated = await store.updateTarget(id, updates);
    rule.targets = rule.targets.map((target) => (target.id === id ? updated : target));
    onUpdated(rule);
  }

  async function handleRemoveTarget(id: string) {
    const target = rule.targets.find((tg) => tg.id === id);
    if (target && target.pattern.trim() && !isWithinGracePeriod()) {
      try {
        await presentChallenge({
          context: { type: "deleteTarget" },
          ruleId: rule.id,
          goalText: t("challengeGoals_deleteTargetFormat", target.pattern),
        });
      } catch {
        return; // User cancelled the challenge
      }
    }
    await store.removeTarget(id);
    rule.targets = rule.targets.filter((target) => target.id !== id);
    onUpdated(rule);
  }
</script>

<div class="card">
  <div
    class="card-header"
    role="button"
    tabindex="0"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
    onkeydown={(e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        expanded = !expanded;
      }
    }}
  >
    <div class="card-summary">
      <div class="name-row">
        {#if editingName}
          <input
            class="name-input"
            bind:value={nameDraft}
            use:autofocus
            onclick={(e) => e.stopPropagation()}
            onblur={commitNameEdit}
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitNameEdit();
              if (e.key === "Escape") editingName = false;
            }}
          />
          <button
            class="icon-btn done-btn"
            onclick={(e) => { e.stopPropagation(); commitNameEdit(); }}
            title={t("common_done")}
            aria-label={t("common_done")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
        {:else}
          <span class="rule-name">{rule.name}</span>
          {#if expanded}
            <button
              class="icon-btn edit-btn"
              onclick={(e) => { e.stopPropagation(); startEditName(); }}
              title={t("common_edit")}
              aria-label={t("common_edit")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
          {/if}
        {/if}
      </div>
      <RuleSiteIcons targets={rule.targets} />
      <span class="rule-meta">{formatTime(rule.allowedSeconds)} · {tp("rule_siteCount", rule.targets.length)}</span>
    </div>
    <span class="chevron" class:open={expanded} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </span>
  </div>

  {#if expanded}
    <div class="card-body">
      <div class="targets-section">
        <span class="field-label">{t("rule_targetsSection")}</span>

        {#each rule.targets as target (target.id)}
          <RuleTargetRow
            {target}
            initialEditing={target.id === pendingNewTargetId}
            onUpdate={(u) => handleUpdateTarget(target.id, u)}
            onRemove={() => handleRemoveTarget(target.id)}
          />
        {/each}

        {#if rule.targets.length === 0}
          <p class="empty-hint">{t("rule_noTargets")}</p>
        {/if}

        <button class="add-target-btn" onclick={handleAddTarget}>+ {t("common_add")}</button>
      </div>

      <div class="field">
        <span class="field-label">{t("rule_allowedMinutesPerDay")}</span>

        {#if editingMinutes}
          <div class="minutes-edit-row">
            <input
              class="minutes-input"
              type="number"
              min="1"
              bind:value={minutesDraft}
              use:autofocus
              onkeydown={(e) => {
                if (e.key === "Enter") commitMinutesEdit();
                if (e.key === "Escape") cancelMinutesEdit();
              }}
            />
            <button class="icon-btn cancel-btn" onclick={cancelMinutesEdit} title={t("common_cancel")} aria-label={t("common_cancel")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <button class="icon-btn done-btn" onclick={commitMinutesEdit} title={t("common_done")} aria-label={t("common_done")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </div>
        {:else}
          <div class="minutes-view-row">
            <span class="minutes-display">{Math.round(rule.allowedSeconds / 60)}</span>
            <button class="icon-btn edit-btn" onclick={startEditMinutes} title={t("common_edit")} aria-label={t("common_edit")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
          </div>
        {/if}
      </div>

      <button class="customize-btn" onclick={onCustomizeChallenges}>{t("rule_customizeGuardrails")}</button>
      <button class="delete-btn" onclick={handleDelete}>{t("rule_deleteRule")}</button>
    </div>
  {/if}
</div>

<style>
  .card {
    background: var(--rl-card-bg);
    border: 1px solid var(--rl-card-border);
    border-radius: 14px;
    overflow: hidden;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 12px;
    cursor: pointer;
    box-sizing: border-box;
    transition: background 0.15s ease;
  }

  .card-header:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: -2px;
  }

  .card-header:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .card-summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .rule-name {
    font-family: var(--rl-font-body);
    font-size: 17px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    line-height: 1.2;
  }

  .name-input {
    flex: 1;
    min-width: 0;
    max-width: 170px;
    background: rgba(115, 158, 235, 0.08);
    border: 1px solid var(--rl-accent-blue);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.95);
    font-family: var(--rl-font-body);
    font-size: 17px;
    font-weight: 600;
    line-height: 1.2;
    padding: 2px 8px;
  }

  .name-input:focus {
    outline: none;
  }

  .rule-meta {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
  }

  .chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: 8px;
    color: rgba(255, 255, 255, 0.5);
    transition: transform 0.2s ease, color 0.15s ease;
  }

  .chevron svg {
    width: 18px;
    height: 18px;
  }

  .card-header:hover .chevron {
    color: rgba(255, 255, 255, 0.85);
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .card-body {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid var(--rl-divider);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 8px;
  }

  .field:first-child {
    padding-top: 10px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--rl-subtitle);
  }

  .minutes-view-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 2px;
  }

  .minutes-display {
    font-family: var(--rl-font-title);
    font-size: 22px;
    font-weight: 600;
    line-height: 1.1;
    color: rgba(255, 255, 255, 0.9);
    letter-spacing: 0.5px;
  }

  .minutes-edit-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .minutes-input {
    width: 80px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--rl-accent-blue);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.85);
    font-family: var(--rl-font-title);
    font-size: 16px;
    padding: 6px 10px;
  }

  .minutes-input:focus {
    outline: none;
    background: rgba(115, 158, 235, 0.1);
  }

  .icon-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .icon-btn svg {
    width: 15px;
    height: 15px;
  }

  .icon-btn.edit-btn {
    color: rgba(255, 255, 255, 0.5);
  }

  .icon-btn.edit-btn:hover {
    color: var(--rl-accent-blue);
    background: rgba(115, 158, 235, 0.15);
  }

  .icon-btn.done-btn {
    color: var(--rl-accent-blue);
  }

  .icon-btn.done-btn:hover {
    background: rgba(115, 158, 235, 0.15);
  }

  .icon-btn.cancel-btn {
    color: rgba(255, 255, 255, 0.45);
  }

  .icon-btn.cancel-btn:hover {
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.08);
  }

  .targets-section {
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
 
  .add-target-btn {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 4px;
    padding: 9px;
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    background: var(--rl-gradient);
    border-radius: 10px;
    cursor: pointer;
    box-sizing: border-box;
    transition: opacity 0.15s ease, transform 0.12s ease;
  }

  .add-target-btn:hover {
    opacity: 0.9;
  }

  .add-target-btn:active {
    opacity: 0.85;
    transform: scale(0.98);
  }

  .empty-hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    font-style: italic;
  }

  .customize-btn {
    all: unset;
    font-size: 12px;
    font-weight: 600;
    color: var(--rl-accent-blue);
    cursor: pointer;
    text-align: center;
    padding: 6px;
    border-radius: 6px;
    transition: background 0.15s ease;
  }

  .customize-btn:hover {
    background: rgba(115, 158, 235, 0.12);
  }

  .delete-btn {
    all: unset;
    margin-top: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #ef5350;
    cursor: pointer;
    text-align: center;
    padding: 6px;
    border-radius: 6px;
    transition: background 0.15s ease;
  }

  .delete-btn:hover {
    background: rgba(239, 83, 80, 0.12);
  }
</style>
