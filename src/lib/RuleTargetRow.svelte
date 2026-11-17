<script lang="ts">
  import { RuleTargetType, type RuleTarget } from "~/types/models";
  import { t } from "./i18n";

  let {
    target,
    onUpdate,
    onRemove,
    initialEditing = false,
  }: {
    target: RuleTarget;
    onUpdate: (updates: Partial<Pick<RuleTarget, "targetType" | "pattern">>) => void;
    onRemove: () => void;
    initialEditing?: boolean;
  } = $props();

  let editing = $state(initialEditing);

  function typeLabel(type: RuleTargetType): string {
    return type === RuleTargetType.Domain
      ? t("target_domainType")
      : t("target_urlPatternType");
  }

  function placeholderFor(type: RuleTargetType): string {
    return type === RuleTargetType.UrlPattern
      ? t("target_urlPatternPlaceholder")
      : t("target_domainPlaceholder");
  }
</script>

{#if editing}
  <div class="target-badge editing">
    <div class="badge-header">
      <span class="editing-label">{t("target_editingLabel")}</span>

      <button class="icon-btn done-btn" onclick={() => (editing = false)} title={t("common_done")} aria-label={t("common_done")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>

      <button class="icon-btn trash-btn" onclick={onRemove} title={t("target_removeTargetTitle")} aria-label={t("target_removeTargetTitle")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6M14 11v6"></path>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>
      </button>
    </div>

    <div class="badge-form">
      <select
        value={target.targetType}
        onchange={(e) => onUpdate({ targetType: (e.target as HTMLSelectElement).value as RuleTargetType })}
      >
        <option value={RuleTargetType.Domain}>{t("target_domainType")}</option>
        <option value={RuleTargetType.UrlPattern}>{t("target_urlPatternType")}</option>
      </select>

      <input
        class="pattern-input"
        type="text"
        placeholder={placeholderFor(target.targetType)}
        value={target.pattern}
        onchange={(e) => onUpdate({ pattern: (e.target as HTMLInputElement).value })}
      />
    </div>
  </div>
{:else}
  <div class="target-badge">
    <span class="pattern-text" class:empty={!target.pattern}>
      {target.pattern || t("target_emptyPattern")}
    </span>
    <span class="type-label">{typeLabel(target.targetType)}</span>

    <button class="icon-btn edit-btn" onclick={() => (editing = true)} title={t("target_editTargetTitle")} aria-label={t("target_editTargetTitle")}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
      </svg>
    </button>

    <button class="icon-btn trash-btn" onclick={onRemove} title={t("target_removeTargetTitle")} aria-label={t("target_removeTargetTitle")}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6M14 11v6"></path>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
      </svg>
    </button>
  </div>
{/if}

<style>
  .target-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px 6px 10px;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid var(--rl-card-border);
    border-radius: 8px;
  }

  .target-badge.editing {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 6px 8px 8px 10px;
    background: rgba(115, 158, 235, 0.08);
    border-color: rgba(115, 158, 235, 0.4);
  }

  .badge-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .badge-form {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .editing-label {
    flex: 1;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 700;
    color: var(--rl-accent-blue);
  }

  .type-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    flex-shrink: 0;
  }

  .pattern-text {
    flex: 1;
    min-width: 0;
    font-family: var(--rl-font-body);
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pattern-text.empty {
    color: rgba(255, 255, 255, 0.3);
    font-style: italic;
  }

  select {
    font-size: 11px;
    padding: 4px 6px;
    flex-shrink: 0;
  }

  .pattern-input {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--rl-card-border);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.85);
    font-family: var(--rl-font-body);
    font-size: 12px;
    padding: 4px 8px;
  }

  .pattern-input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .icon-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .icon-btn svg {
    width: 14px;
    height: 14px;
  }

  .edit-btn {
    color: rgba(255, 255, 255, 0.45);
  }

  .edit-btn:hover {
    color: var(--rl-accent-blue);
    background: rgba(115, 158, 235, 0.15);
  }

  .done-btn {
    color: rgba(255, 255, 255, 0.45);
  }

  .done-btn:hover {
    color: #4caf50;
    background: rgba(76, 175, 80, 0.15);
  }

  .trash-btn {
    color: #ef5350;
    opacity: 0.7;
  }

  .trash-btn:hover {
    opacity: 1;
    background: rgba(239, 83, 80, 0.15);
  }
</style>
