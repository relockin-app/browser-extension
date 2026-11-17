<script lang="ts">
  import type { RuleTarget } from "~/types/models";
  import { classifyFavicon, ruleHostnames, siteIconSources } from "~/shared/siteIcons";
  import type { FaviconKind } from "~/shared/siteIcons";

  let { targets }: { targets: RuleTarget[] } = $props();

  const MAX_VISIBLE = 6;

  const hostnames = $derived(ruleHostnames(targets));
  const visible = $derived(hostnames.slice(0, MAX_VISIBLE));
  const overflow = $derived(hostnames.length - visible.length);

  /** Index into siteIconSources per hostname; past the end means monogram. */
  let sourceIndex = $state<Record<string, number>>({});
  /** Set once a favicon has loaded and been classified; hidden until then. */
  let faviconKind = $state<Record<string, FaviconKind>>({});

  function nextSource(hostname: string) {
    sourceIndex[hostname] = (sourceIndex[hostname] ?? 0) + 1;
  }

  async function handleFaviconLoad(hostname: string, img: HTMLImageElement) {
    const kind = await classifyFavicon(img);
    if (kind === "default") nextSource(hostname);
    else faviconKind[hostname] = kind;
  }

  function monogramHue(hostname: string): number {
    let hash = 0;
    for (const ch of hostname) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(hash) % 360;
  }
</script>

{#if visible.length > 0}
  <div class="site-icons">
    {#each visible as hostname (hostname)}
      {@const source = siteIconSources(hostname)[sourceIndex[hostname] ?? 0]}
      {#if !source}
        <span class="tile monogram" title={hostname} style:--hue={monogramHue(hostname)}>
          {hostname[0].toUpperCase()}
        </span>
      {:else if !source.isFavicon}
        <img class="tile" src={source.src} alt="" title={hostname} onerror={() => nextSource(hostname)} />
      {:else}
        {@const kind = faviconKind[hostname]}
        <span class="tile favicon" class:pending={!kind} class:inset={kind === "inset"} title={hostname}>
          <img
            src={source.src}
            alt=""
            onload={(e) => handleFaviconLoad(hostname, e.currentTarget as HTMLImageElement)}
            onerror={() => nextSource(hostname)}
          />
        </span>
      {/if}
    {/each}
    {#if overflow > 0}
      <span class="tile overflow">+{overflow}</span>
    {/if}
  </div>
{/if}

<style>
  .site-icons {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 0 3px;
  }

  /* The rounded corners sit on the element that paints the pixels (the img
     itself, or a solid tile), never on a clipping parent with a background:
     that background bleeds through the anti-aliased edge as a jagged rim. */
  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    flex-shrink: 0;
    box-sizing: border-box;
    object-fit: cover;
  }

  .favicon img {
    width: 100%;
    height: 100%;
    border-radius: 7px;
    object-fit: cover;
  }

  .favicon.pending {
    visibility: hidden;
  }

  .favicon.inset {
    background: #fff;
  }

  .favicon.inset img {
    width: 20px;
    height: 20px;
    border-radius: 0;
    object-fit: contain;
  }

  .monogram {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    background: hsl(var(--hue) 45% 42%);
  }

  .overflow {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.75);
    background: rgba(255, 255, 255, 0.12);
  }
</style>
