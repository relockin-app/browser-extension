<script lang="ts">
  // A dropdown whose options each have a title and a description. The closed
  // button shows the selected option's title; the open list shows every
  // option's title in a larger font with its description underneath.
  import { Check, ChevronDown } from "@lucide/svelte";
  import ProBadge from "./ProBadge.svelte";

  type Option = { value: string; label: string; description: string };

  let {
    label,
    options,
    value,
    onchange,
    lockedValues = [],
  }: {
    /** Accessible name of the menu, usually the setting's label. */
    label: string;
    options: Option[];
    value: string;
    onchange: (value: string) => void;
    /** Options shown with a Pro badge that can't be picked. */
    lockedValues?: string[];
  } = $props();

  const uid = $props.id();
  const listId = `option-menu-${uid}`;

  let open = $state(false);
  // Index of the keyboard-highlighted option while open.
  let active = $state(0);
  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  let list = $state<HTMLUListElement>();

  const selectedIndex = $derived(
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const selected = $derived(options[selectedIndex]);

  function openMenu(): void {
    active = selectedIndex;
    open = true;
    // Focus the list once it renders so arrow keys work straight away.
    queueMicrotask(() => list?.focus());
  }

  function closeMenu(refocus = true): void {
    open = false;
    if (refocus) trigger?.focus();
  }

  function choose(index: number): void {
    const option = options[index];
    if (option && lockedValues.includes(option.value)) return;
    if (option && option.value !== value) onchange(option.value);
    closeMenu();
  }

  function onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu();
    }
  }

  function onListKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        active = (active + 1) % options.length;
        break;
      case "ArrowUp":
        e.preventDefault();
        active = (active - 1 + options.length) % options.length;
        break;
      case "Home":
        e.preventDefault();
        active = 0;
        break;
      case "End":
        e.preventDefault();
        active = options.length - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        closeMenu();
        break;
      case "Tab":
        closeMenu(false);
        break;
    }
  }

  function onWindowPointerDown(e: PointerEvent): void {
    if (open && !root.contains(e.target as Node)) closeMenu(false);
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="option-menu" bind:this={root}>
  <button
    type="button"
    class="trigger"
    class:trigger--open={open}
    bind:this={trigger}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={listId}
    aria-label={`${label}: ${selected?.label ?? ""}`}
    onclick={() => (open ? closeMenu() : openMenu())}
    onkeydown={onTriggerKeydown}
  >
    <span class="trigger-text">
      <span class="trigger-title">{selected?.label}</span>
      <span class="trigger-desc">{selected?.description}</span>
    </span>
    <ChevronDown class="chevron" size={18} strokeWidth={2.25} aria-hidden="true" />
  </button>

  {#if open}
    <ul
      id={listId}
      class="menu"
      role="listbox"
      tabindex="-1"
      aria-label={label}
      aria-activedescendant={`${listId}-${active}`}
      bind:this={list}
      onkeydown={onListKeydown}
    >
      {#each options as opt, i}
        <!-- Keyboard selection is handled by the listbox (aria-activedescendant). -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id={`${listId}-${i}`}
          class="item"
          class:item--active={i === active}
          class:item--selected={opt.value === value}
          class:item--locked={lockedValues.includes(opt.value)}
          role="option"
          aria-selected={opt.value === value}
          aria-disabled={lockedValues.includes(opt.value)}
          onpointerenter={() => (active = i)}
          onclick={() => choose(i)}
        >
          <span class="item-text">
            <span class="item-title">{opt.label}{#if lockedValues.includes(opt.value)}<ProBadge />{/if}</span>
            <span class="item-desc">{opt.description}</span>
          </span>
          {#if opt.value === value}
            <Check class="check" size={18} strokeWidth={2.5} aria-hidden="true" />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .option-menu {
    position: relative;
  }

  .trigger {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--rl-control-border);
    border-radius: 10px;
    background: var(--rl-control-bg);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .trigger:hover {
    background: var(--rl-control-bg-hover);
  }

  .trigger--open {
    border-color: var(--rl-accent-blue);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--rl-accent-blue);
    outline-offset: 2px;
  }

  .trigger-text,
  .item-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .trigger-title {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .trigger-desc {
    font-size: 12px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.55);
  }

  .trigger :global(.chevron) {
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.55);
    transition: transform 0.15s ease;
  }

  .trigger--open :global(.chevron) {
    transform: rotate(180deg);
  }

  .menu {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
    border: 1px solid var(--rl-card-border);
    border-radius: 12px;
    background: var(--rl-bg);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    outline: none;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
  }

  .item--active {
    background: rgba(255, 255, 255, 0.07);
  }

  .item--selected {
    background: color-mix(in srgb, var(--rl-accent-blue) 12%, transparent);
  }

  .item--selected.item--active {
    background: color-mix(in srgb, var(--rl-accent-blue) 18%, transparent);
  }

  .item--locked {
    cursor: default;
  }

  .item--locked .item-desc {
    opacity: 0.6;
  }

  .item-title {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
  }

  .item-desc {
    font-size: 12px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.55);
  }

  .item :global(.check) {
    flex-shrink: 0;
    color: var(--rl-accent-blue);
  }
</style>
