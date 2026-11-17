<script lang="ts">
  import { onMount, untrack, type Snippet } from "svelte";
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  interface Props {
    eyebrow?: string;
    /** `**words**` render in the accent gradient. */
    title: string;
    body?: string;
    /** "split" puts copy beside the visual; "center" stacks everything. */
    layout?: "split" | "center";
    /** Widens a centered slide for content laid out in columns. */
    wide?: boolean;
    /** Types the title out quickly. Highlights are dropped while typing. */
    typing?: boolean;
    visual?: Snippet;
    /** Shown above the eyebrow, e.g. an icon. */
    hero?: Snippet;
    children?: Snippet;
    actions?: Snippet;
  }

  let { eyebrow, title, body, layout = "split", wide = false, typing = false, visual, hero, children, actions }: Props = $props();

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  function highlight(s: string): string {
    return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>');
  }

  const enter = (delay: number) => ({ y: 18, duration: 520, delay, easing: cubicOut });

  // Fast enough to never hold up a quick reader. The untyped rest is laid out
  // but invisible, so the headline holds its final size and nothing jumps.
  const TYPING_MS_PER_CHARACTER = 11;
  const characters = $derived(Array.from(title.replace(/\*\*/g, "")));
  // A slide keeps the typing it was created with.
  let typed = $state(untrack(() => typing) ? 0 : Number.MAX_SAFE_INTEGER);

  onMount(() => {
    if (!typing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      typed = Number.MAX_SAFE_INTEGER;
      return;
    }
    const interval = setInterval(() => {
      typed += 1;
      if (typed >= characters.length) clearInterval(interval);
    }, TYPING_MS_PER_CHARACTER);
    return () => clearInterval(interval);
  });
</script>

<section class="slide {layout}" class:wide class:has-visual={!!visual}>
  <div class="copy">
    {#if hero}
      <div in:fly={enter(0)}>{@render hero()}</div>
    {/if}
    {#if eyebrow}
      <p class="eyebrow" in:fly={enter(0)}>{eyebrow}</p>
    {/if}
    {#if typing}
      <h1 aria-label={characters.join("")}>
        <span aria-hidden="true">{characters.slice(0, typed).join("")}</span><span
          class="untyped"
          aria-hidden="true">{characters.slice(typed).join("")}</span
        >
      </h1>
    {:else}
      <h1 in:fly={enter(60)}>{@html highlight(title)}</h1>
    {/if}
    {#if body}
      <p class="body" in:fly={enter(120)}>{body}</p>
    {/if}
    {#if children}
      <div class="controls" in:fly={enter(180)}>{@render children()}</div>
    {/if}
    {#if actions}
      <div class="actions" in:fly={enter(240)}>{@render actions()}</div>
    {/if}
  </div>
  {#if visual}
    <div class="visual" in:fade={{ duration: 600, delay: 150 }}>
      <div class="visual-inner" in:fly={{ y: 28, duration: 700, delay: 150, easing: cubicOut }}>
        {@render visual()}
      </div>
    </div>
  {/if}
</section>

<style>
  .slide {
    width: 100%;
    max-width: 1180px;
    margin: 0 auto;
    display: grid;
    align-items: center;
    gap: clamp(32px, 6vw, 88px);
  }

  .slide.split.has-visual {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  }

  .slide.center {
    justify-items: center;
    text-align: center;
    max-width: 820px;
  }

  .slide.center.wide {
    max-width: 1080px;
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 0;
  }

  .center .copy {
    align-items: center;
  }

  .eyebrow {
    margin: 0;
    font-family: var(--rl-font-title);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--rl-accent-blue);
  }

  h1 {
    margin: 0;
    font-family: var(--rl-font-body);
    font-size: clamp(36px, 4.6vw, 62px);
    font-weight: 700;
    line-height: 1.04;
    letter-spacing: -0.028em;
    color: #fff;
    text-wrap: balance;
  }

  .center h1 {
    font-size: clamp(40px, 5.4vw, 72px);
  }

  .untyped {
    opacity: 0;
  }

  h1 :global(.hl) {
    background: var(--rl-gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .body {
    margin: 0;
    max-width: 36em;
    font-size: clamp(17px, 1.35vw, 20px);
    line-height: 1.55;
    color: rgba(255, 255, 255, 0.66);
    white-space: pre-line;
    text-wrap: pretty;
  }

  .controls {
    margin-top: 8px;
    width: 100%;
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 16px;
  }

  .center .actions {
    justify-content: center;
  }

  .visual {
    min-width: 0;
  }

  @media (max-width: 900px) {
    .slide.split.has-visual {
      grid-template-columns: minmax(0, 1fr);
    }

    .visual {
      max-width: 560px;
      width: 100%;
      margin: 0 auto;
    }
  }
</style>
