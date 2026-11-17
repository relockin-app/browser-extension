<script lang="ts">
  import { Info } from "@lucide/svelte";

  let { text }: { text: string } = $props();

  const id = `info-tip-${Math.random().toString(36).slice(2, 9)}`;
  /** Pinned open by a click, for touch screens that have no hover. */
  let open = $state(false);
</script>

<!-- Often sits inside a <label> or row <button>, where a real <button> isn't
     allowed and a click must not toggle or open the setting it describes. -->
<span class="info-tip">
  <span
    class="info-icon"
    class:open
    role="button"
    tabindex="0"
    aria-expanded={open}
    aria-describedby={id}
    onclick={(e) => { e.preventDefault(); e.stopPropagation(); open = !open; }}
    onkeydown={(e) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open = !open; }
      if (e.key === "Escape") open = false;
    }}
    onblur={() => (open = false)}
  >
    <Info size={13} strokeWidth={2.25} aria-hidden="true" />
  </span>
  <span class="info-bubble" role="tooltip" {id}>{text}</span>
</span>

<style>
  .info-tip {
    position: relative;
    display: inline-flex;
    vertical-align: -2px;
    margin-left: 5px;
  }

  .info-icon {
    display: inline-flex;
    color: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    cursor: help;
    transition: color 0.15s ease;
  }

  .info-icon:hover,
  .info-icon:focus-visible,
  .info-icon.open {
    color: var(--rl-accent-blue);
    outline: none;
  }

  .info-bubble {
    position: absolute;
    top: calc(100% + 6px);
    left: -8px;
    z-index: 20;
    width: max-content;
    max-width: 220px;
    padding: 8px 10px;
    border: 1px solid var(--rl-card-border);
    border-radius: 8px;
    background: #1f1f23;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.85);
    white-space: normal;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-2px);
    transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s;
    pointer-events: none;
  }

  .info-icon:hover + .info-bubble,
  .info-icon:focus-visible + .info-bubble,
  .info-icon.open + .info-bubble {
    opacity: 1;
    visibility: visible;
    transform: none;
  }
</style>
