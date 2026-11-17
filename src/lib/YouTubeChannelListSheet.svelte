<script lang="ts" module>
  export type ChannelListSection = {
    /** Settings key holding the channels. */
    key: string;
    /** Its side of the switch atop a sheet with several lists. */
    label?: string;
    /**
     * Adds an "Export to JSON" button, shown in dev builds and, in release
     * builds, after typing "json" while the sheet is open. "aiSeed" marks each
     * channel reviewed and very likely AI, for youtubeAiSeedChannels.ts.
     */
    exportAs?: "aiSeed" | "plain";
  };
</script>

<script lang="ts">
  import { Wrench } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import { t } from "./i18n";

  let {
    title,
    description,
    sections,
    onBack,
  }: {
    title: string;
    description?: string;
    sections: ChannelListSection[];
    onBack: () => void;
  } = $props();

  type Settings = Record<string, unknown>;
  type Entry = { id?: string; handle?: string; name?: string };
  const STORAGE_KEY = "local:reelockrSettings";

  let settings = $state<Settings>({});
  let exportStatus = $state("");
  // Hidden in release builds until the secret word is typed; lasts while the
  // sheet stays open.
  const SECRET_WORD = "json";
  let exportRevealed = $state(import.meta.env.DEV);
  let typed = "";

  function onKeydown(e: KeyboardEvent): void {
    if (exportRevealed || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-SECRET_WORD.length);
    if (typed === SECRET_WORD) exportRevealed = true;
  }
  // Opens on the first list; the sheet is remounted for each item.
  let selectedKey = $state(untrack(() => sections[0]?.key));
  const shown = $derived(
    sections.length > 1 ? sections.filter((s) => s.key === selectedKey) : sections,
  );

  onMount(async () => {
    settings = (await storage.getItem<Settings>(STORAGE_KEY)) ?? {};
  });

  function entries(key: string): Entry[] {
    const val = settings[key];
    return Array.isArray(val) ? (val as Entry[]) : [];
  }

  function label(entry: Entry): string {
    return entry.name || entry.handle || entry.id || "";
  }

  /** The handle under a channel's name. */
  function detail(entry: Entry): string {
    return entry.name && entry.handle ? entry.handle : "";
  }

  async function remove(key: string, entry: Entry): Promise<void> {
    // Re-read first so a vote made on YouTube meanwhile isn't lost.
    const stored = (await storage.getItem<Settings>(STORAGE_KEY)) ?? {};
    const list = Array.isArray(stored[key]) ? (stored[key] as Entry[]) : [];
    const sameAs = (e: Entry) => (e.id ? e.id === entry.id : e.handle === entry.handle);
    settings = { ...stored, [key]: list.filter((e) => !sameAs(e)) };
    await storage.setItem(STORAGE_KEY, $state.snapshot(settings));
  }

  // Copies the list as a JSON array, which is also a valid TS literal: an
  // "aiSeed" export pastes as the value of YOUTUBE_AI_SEED_CHANNELS. Hidden
  // tool, so not translated.
  async function exportList(section: ChannelListSection): Promise<void> {
    const rows = entries(section.key)
      .map((e) => ({
        id: e.id,
        handle: e.handle,
        name: e.name ?? "",
        // Hand-verified, so each goes on the list as reviewed and very likely AI.
        ...(section.exportAs === "aiSeed" ? { tier: "veryLikely", reviewed: true } : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const withoutId = rows.filter((e) => !e.id).length;
    try {
      await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
      exportStatus =
        `Copied ${rows.length}` +
        (withoutId ? ` (${withoutId} without a UC… id: open their channel page to add it)` : "");
    } catch (e) {
      exportStatus = `Copy failed: ${e}`;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sheet">
  <div class="header">
    <button class="back-btn" onclick={onBack}>← {t("common_done")}</button>
    <h1>{title}</h1>
  </div>

  {#if description}
    <p class="description">{description}</p>
  {/if}

  {#if sections.length > 1}
    <!-- Same segmented control as the schedule card's mode switch. -->
    <div class="segmented" role="radiogroup">
      {#each sections as section (section.key)}
        <button
          role="radio"
          aria-checked={selectedKey === section.key}
          class:active={selectedKey === section.key}
          onclick={() => (selectedKey = section.key)}
        >
          <span>{section.label}</span>
          <span class="segment-count">{entries(section.key).length}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#each shown as section (section.key)}
    {#if entries(section.key).length === 0}
      <p class="empty">{t("settings_ytAiListEmpty")}</p>
    {:else}
      <ul class="list">
        {#each entries(section.key) as entry}
          <li class="item">
            <span class="names">
              <span class="name">{label(entry)}</span>
              {#if detail(entry)}<span class="detail">{detail(entry)}</span>{/if}
            </span>
            <button
              type="button"
              class="remove"
              aria-label={t("settings_ytAiListRemoveLabel", [label(entry)])}
              onclick={() => remove(section.key, entry)}
            >×</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if exportRevealed && section.exportAs && entries(section.key).length > 0}
      <!-- Hidden tool, so not translated. -->
      <div class="export-row">
        <button type="button" class="export-button" onclick={() => exportList(section)}>
          Export to JSON
        </button>
        <!-- Same badge as dev-only settings in WebCustomizationsTab. -->
        <span class="dev-badge" title="HIDDEN TOOL" aria-label="HIDDEN TOOL">
          <Wrench size={12} strokeWidth={2.5} aria-hidden="true" />
        </span>
        {#if exportStatus}<span class="export-status">{exportStatus}</span>{/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .sheet { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px; }
  .header { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 0 4px; }
  .back-btn { all: unset; font-size: 13px; font-weight: 600; color: var(--rl-accent-blue); cursor: pointer; }
  h1 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.25; color: rgba(255,255,255,0.95); }
  .description { margin: 0; font-size: 12px; color: rgba(255,255,255,0.45); line-height: 1.4; }
  .empty { margin: 0; font-size: 13px; font-style: italic; color: rgba(255,255,255,0.45); }

  .list { list-style: none; margin: 0; padding: 0; background: var(--rl-card-bg); border: 1px solid var(--rl-card-border); border-radius: 12px; }
  .item { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; }
  .item + .item { border-top: 1px solid var(--rl-card-border); }
  .names { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .name { font-size: 14px; color: rgba(255,255,255,0.9); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { font-size: 12px; color: rgba(255,255,255,0.45); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .remove { all: unset; flex: none; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 18px; color: rgba(255,255,255,0.5); cursor: pointer; }
  .remove:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85); }

  .segmented { display: flex; background: #141414; border-radius: 10px; padding: 3px; gap: 2px; }
  .segmented button { all: unset; flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 6px; font-size: 13px; color: var(--rl-subtitle); border-radius: 8px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease; }
  .segmented button:focus-visible { outline: 2px solid var(--rl-accent-blue); outline-offset: -2px; }
  .segmented button.active { background: #48484a; color: rgba(255,255,255,0.95); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.35); }
  .segment-count { font-weight: 400; color: rgba(255,255,255,0.45); }

  .export-row { display: flex; align-items: center; gap: 8px; }
  .export-button { padding: 6px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: var(--rl-accent-blue); color: #fff; font-size: 13px; cursor: pointer; }
  .dev-badge { display: inline-flex; color: #f5c542; cursor: help; }
  .export-status { font-size: 12px; color: rgba(255,255,255,0.6); }
</style>
