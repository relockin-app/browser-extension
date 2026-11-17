<script lang="ts">
  // Marks a setting or option that's locked in the free version on a phone.
  import { Lock } from "@lucide/svelte";
  import { t } from "./i18n";
</script>

<span class="pro-badge" title={t("phoneWebext_proLockedTooltip")}>
  <Lock size={10} strokeWidth={2.75} aria-hidden="true" />
  {t("rule_proBadge")}
</span>

<style>
  .pro-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 999px;
    vertical-align: 1px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.3px;
    line-height: 1.5;
    color: #1a1a1a;
    background: var(--rl-gradient);
    cursor: help;
  }
</style>
