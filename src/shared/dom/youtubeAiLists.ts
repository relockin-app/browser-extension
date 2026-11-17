import type { RelockrSettings } from "@/types/RelockrSettings";
import { SettingsKey } from "../settings/settingsKey";
import { YOUTUBE_AI_SEED_CHANNELS } from "./youtubeAiSeedChannels";

/** A YouTube channel, identified by its `UC…` id and/or its `@handle`. */
export interface AiChannelEntry {
  id?: string;
  /** Lowercase, with the leading "@". */
  handle?: string;
  name: string;
}

/** A channel's tier on the published list, from votes and RelockIn's review. */
export type AiTier = "possibly" | "likely" | "veryLikely" | "disputed";

/** A channel on the published list (downloaded daily, or the bundled seed). */
export interface AiListedChannel extends AiChannelEntry {
  tier: AiTier;
  /** RelockIn reviewed it, so votes alone don't move it. */
  reviewed?: boolean;
  aiVotes?: number;
  notAiVotes?: number;
}

/**
 * Why a video counts as AI for this viewer, strongest first: their own channel
 * vote, then the channel's tier. Disputed counts as none.
 */
export type AiVerdict = "channel" | "veryLikely" | "likely" | "possibly";

/** What the page tells us about a video's channel. */
export interface ChannelRef {
  id?: string;
  handle?: string;
}

export function normalizeHandle(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const handle = raw.trim().replace(/^\/+/, "").toLowerCase();
  return handle.startsWith("@") && handle.length > 1 ? handle : undefined;
}

function sameChannel(a: ChannelRef, b: ChannelRef): boolean {
  return (!!a.id && a.id === b.id) || (!!a.handle && a.handle === b.handle);
}

// Settings may come from storage, or (on mobile) a native bridge that hands
// lists over as JSON strings.
function readList<T>(settings: RelockrSettings, key: string): T[] {
  let value = settings[key];
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? (value as T[]) : [];
}

export function getBlockedChannels(settings: RelockrSettings): AiChannelEntry[] {
  return readList(settings, SettingsKey.YouTube.AiBlockedChannels);
}

export function getAllowedChannels(settings: RelockrSettings): AiChannelEntry[] {
  return readList(settings, SettingsKey.YouTube.AiAllowedChannels);
}

/** The personal blocklist: hidden everywhere, whether AI or not. */
export function getHiddenChannels(settings: RelockrSettings): AiChannelEntry[] {
  return readList(settings, SettingsKey.YouTube.BlockedChannels);
}

class ChannelMap<T extends AiChannelEntry> {
  private ids = new Map<string, T>();
  private handles = new Map<string, T>();

  constructor(entries: readonly T[]) {
    for (const e of entries) {
      if (e.id) this.ids.set(e.id, e);
      const handle = normalizeHandle(e.handle);
      if (handle) this.handles.set(handle, e);
    }
  }

  get(channel: ChannelRef): T | null {
    return (
      (channel.id ? this.ids.get(channel.id) : undefined) ??
      (channel.handle ? this.handles.get(channel.handle) : undefined) ??
      null
    );
  }

  has(channel: ChannelRef): boolean {
    return this.get(channel) !== null;
  }
}

export interface AiLookup {
  verdict(channel: ChannelRef): AiVerdict | null;
  /** The channel's entry on the published list, whatever this viewer voted. */
  listed(channel: ChannelRef): AiListedChannel | null;
  isChannelBlocked(channel: ChannelRef): boolean;
  isChannelAllowed(channel: ChannelRef): boolean;
  /** On the personal blocklist, independent of every AI list. */
  isChannelHidden(channel: ChannelRef): boolean;
}

let sharedList: readonly AiListedChannel[] | null = null;

/**
 * The published list, downloaded daily. Once there is one it replaces the
 * bundled seed, whose channels the server publishes too. Its vote counts
 * leave out this viewer's own vote, which the lookup's users add back.
 */
export function setSharedAiList(list: readonly AiListedChannel[] | null): void {
  sharedList = list;
}

let cachedFor: unknown[] = [];
let cachedLookup: AiLookup | null = null;

/** Lookup over the personal lists and the published list, rebuilt only when a list changes. */
export function getAiLookup(settings: RelockrSettings): AiLookup {
  const sources = [
    settings[SettingsKey.YouTube.AiBlockedChannels],
    settings[SettingsKey.YouTube.AiAllowedChannels],
    settings[SettingsKey.YouTube.BlockedChannels],
    sharedList,
  ];
  if (cachedLookup && sources.every((s, i) => s === cachedFor[i])) {
    return cachedLookup;
  }

  const blocked = new ChannelMap(getBlockedChannels(settings));
  const allowed = new ChannelMap(getAllowedChannels(settings));
  const listed = new ChannelMap(sharedList ?? YOUTUBE_AI_SEED_CHANNELS);
  const hidden = new ChannelMap(getHiddenChannels(settings));

  cachedFor = sources;
  cachedLookup = {
    // The user's own vote wins over the shared list.
    verdict(channel) {
      if (allowed.has(channel)) return null;
      if (blocked.has(channel)) return "channel";
      const tier = listed.get(channel)?.tier;
      return tier && tier !== "disputed" ? tier : null;
    },
    listed: (channel) => listed.get(channel),
    isChannelBlocked: (channel) => blocked.has(channel),
    isChannelAllowed: (channel) => allowed.has(channel),
    isChannelHidden: (channel) => hidden.has(channel),
  };
  return cachedLookup;
}

function withoutChannel(list: AiChannelEntry[], channel: ChannelRef): AiChannelEntry[] {
  return list.filter(
    (e) => !sameChannel({ id: e.id, handle: normalizeHandle(e.handle) }, channel),
  );
}

/**
 * Settings patch that puts a channel on the blocked list, the allowed list, or
 * neither. A channel is never on both.
 */
export function channelMarkPatch(
  settings: RelockrSettings,
  channel: AiChannelEntry,
  mark: "ai" | "notAi" | "none",
): RelockrSettings {
  const ref = { id: channel.id, handle: normalizeHandle(channel.handle) };
  const entry: AiChannelEntry = { ...channel, handle: ref.handle };
  const blocked = withoutChannel(getBlockedChannels(settings), ref);
  const allowed = withoutChannel(getAllowedChannels(settings), ref);
  if (mark === "ai") blocked.push(entry);
  if (mark === "notAi") allowed.push(entry);
  return {
    [SettingsKey.YouTube.AiBlockedChannels]: blocked,
    [SettingsKey.YouTube.AiAllowedChannels]: allowed,
  };
}

export function channelBlockPatch(
  settings: RelockrSettings,
  channel: AiChannelEntry,
  blocked: boolean,
): RelockrSettings {
  const ref = { id: channel.id, handle: normalizeHandle(channel.handle) };
  const list = withoutChannel(getHiddenChannels(settings), ref);
  if (blocked) list.push({ ...channel, handle: ref.handle });
  return { [SettingsKey.YouTube.BlockedChannels]: list };
}

/**
 * Settings patch that brings stored entries for `channel` up to date, or null
 * if none need it: adds its `UC…` id to entries that only had its handle
 * (marked where the id wasn't known; handles can change, ids can't), and sets
 * `name` where it differs. Pass `name` only when read from YouTube's data:
 * earlier versions could save the previous channel's name.
 */
export function channelBackfillPatch(
  settings: RelockrSettings,
  channel: ChannelRef,
  name: string | null,
): RelockrSettings | null {
  if (!channel.id) return null;
  const isThis = (e: AiChannelEntry) =>
    e.id ? e.id === channel.id : !!channel.handle && normalizeHandle(e.handle) === channel.handle;
  const update = (e: AiChannelEntry): AiChannelEntry | null => {
    if (!isThis(e)) return null;
    const fixed = { ...e, id: channel.id };
    if (name) fixed.name = name;
    return fixed.id !== e.id || fixed.name !== e.name ? fixed : null;
  };
  const patch: RelockrSettings = {};
  const lists = [
    [SettingsKey.YouTube.AiBlockedChannels, getBlockedChannels(settings)],
    [SettingsKey.YouTube.AiAllowedChannels, getAllowedChannels(settings)],
    [SettingsKey.YouTube.BlockedChannels, getHiddenChannels(settings)],
  ] as const;
  for (const [key, list] of lists) {
    if (!list.some((e) => update(e))) continue;
    patch[key] = list.map((e) => update(e) ?? e);
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
