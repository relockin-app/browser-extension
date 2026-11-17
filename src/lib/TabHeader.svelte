<script lang="ts">
  let {
    title,
    subtitle,
    children,
  }: {
    title: string;
    subtitle?: string;
    children?: import("svelte").Snippet;
  } = $props();
</script>

<header class="page-header">
  <h1 class="page-title">{title}</h1>
  {#if subtitle}
    <p class="page-description">{subtitle}</p>
  {/if}
  {#if children}{@render children()}{/if}
</header>

<style>
  .page-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px 4px;
  }

  .page-title {
    margin: 0;
    font-family: var(--rl-font-title);
    font-size: 26px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.98);
    letter-spacing: 0.5px;
    line-height: 1.2;
  }

  .page-description {
    margin: 0;
    font-family: var(--rl-font-body);
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1.4;
  }
</style>
