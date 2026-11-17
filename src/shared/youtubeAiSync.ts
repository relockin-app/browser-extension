import type { RelockrSettings } from "@/types/RelockrSettings";
import {
  type AiListedChannel,
  type AiTier,
  getAllowedChannels,
  getBlockedChannels,
} from "./dom/youtubeAiLists";
import { AI_VOTE_DATA, hasDataConsent } from "./dataConsent";
import { supabase } from "./supabaseClient";
import { SUPABASE_AUTH_STORAGE_KEY, SUPABASE_URL } from "./supabaseConfig";
import { YOUTUBE_AI_SHARED_LIST_KEY, type YouTubeAiSharedList } from "./youtubeAiSharedList";

/**
 * Background side of the AI channel list, against the RelockIn backend:
 * - Votes: the personal "voted AI" / "voted not AI" lists are the votes. Each
 *   change is sent while signed in, and votes made signed out go up once the
 *   user signs in.
 * - The published list: downloaded about once a day; the content script reads
 *   it from storage.
 */

const PLATFORM = "youtube";
const LIST_URL = `${SUPABASE_URL}/functions/v1/ai-list?platform=${PLATFORM}`;
const SETTINGS_STORAGE_KEY = "local:reelockrSettings";
const VOTE_SYNC_KEY = "local:youtubeAiVoteSync";
const ALARM_NAME = "relockr-youtube-ai-sync";
const LIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LIST_ATTEMPT_KEY = "local:youtubeAiListAttemptAt";
const LIST_RETRY_MS = 60 * 60 * 1000;
/** When a vote upload last failed or hit the daily limit; uploads wait an hour after it. */
const VOTE_RETRY_KEY = "local:youtubeAiVoteRetryAt";
const VOTE_RETRY_MS = 60 * 60 * 1000;
// Matches the server's limit per call.
const VOTES_PER_CALL = 100;

type Vote = "ai" | "notAi" | "none";

interface SyncedVote {
  vote: Vote;
  /** Server time it was recorded (ms). */
  at: number;
  /** What the server had before it. */
  previous: Vote;
}

interface VoteSyncState {
  /** The account these votes went to; another account starts over. */
  userId: string | null;
  votes: Record<string, SyncedVote>;
}

const CHANNEL_ID = /^UC[\w-]{22}$/;
const TIERS: ReadonlySet<string> = new Set<AiTier>(["possibly", "likely", "veryLikely", "disputed"]);

async function readSyncState(): Promise<VoteSyncState> {
  return (await storage.getItem<VoteSyncState>(VOTE_SYNC_KEY)) ?? { userId: null, votes: {} };
}

// MARK: - Votes

/** This browser's current votes, by channel id. Handle-only entries wait for their id. */
function currentVotes(settings: RelockrSettings): Map<string, { vote: Vote; handle?: string; name?: string }> {
  const votes = new Map<string, { vote: Vote; handle?: string; name?: string }>();
  for (const e of getBlockedChannels(settings)) {
    if (e.id && CHANNEL_ID.test(e.id)) votes.set(e.id, { vote: "ai", handle: e.handle, name: e.name });
  }
  for (const e of getAllowedChannels(settings)) {
    if (e.id && CHANNEL_ID.test(e.id) && !votes.has(e.id)) {
      votes.set(e.id, { vote: "notAi", handle: e.handle, name: e.name });
    }
  }
  return votes;
}

let pushing: Promise<void> | null = null;
let pushAgain = false;

/** Sends every vote the server doesn't have yet. Does nothing while signed out. */
export function pushYouTubeAiVotes(): Promise<void> {
  if (pushing) {
    pushAgain = true;
    return pushing;
  }
  pushing = (async () => {
    do {
      pushAgain = false;
      await pushOnce();
    } while (pushAgain);
  })()
    .catch((e) => console.warn("[RELOCKR] AI vote sync failed", e))
    .finally(() => {
      pushing = null;
    });
  return pushing;
}

async function pushOnce(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  // Votes wait here if the user turns this off in Firefox's add-on settings.
  if (!(await hasDataConsent(AI_VOTE_DATA))) return;

  let state = await readSyncState();
  if (state.userId !== session.user.id) state = { userId: session.user.id, votes: {} };

  const settings = (await storage.getItem<RelockrSettings>(SETTINGS_STORAGE_KEY)) ?? {};
  const wanted = currentVotes(settings);
  const changes: { id: string; vote: Vote; handle?: string; name?: string }[] = [];
  for (const [id, v] of wanted) {
    if (state.votes[id]?.vote !== v.vote) changes.push({ id, ...v });
  }
  for (const [id, synced] of Object.entries(state.votes)) {
    if (synced.vote !== "none" && !wanted.has(id)) changes.push({ id, vote: "none" });
  }

  if (changes.length === 0) return;
  // The worker wakes often, so after a failure only try hourly.
  const failedAt = (await storage.getItem<number>(VOTE_RETRY_KEY)) ?? 0;
  if (Date.now() - failedAt < VOTE_RETRY_MS) return;

  // Not on Firefox, where it may count as technical data needing its own consent.
  const client = import.meta.env.FIREFOX ? undefined : `webext ${browser.runtime.getManifest().version}`;
  for (let i = 0; i < changes.length; i += VOTES_PER_CALL) {
    const batch = changes.slice(i, i + VOTES_PER_CALL);
    const { data, error } = await supabase.rpc("ai_cast_votes", {
      p_platform: PLATFORM,
      p_votes: batch,
      p_client: client,
    });
    if (error) {
      await storage.setItem(VOTE_RETRY_KEY, Date.now());
      throw error;
    }
    const result = data as { accepted: string[]; rejected: { reason: string }[]; at: string };
    const accepted = new Set(result.accepted);
    const at = Date.parse(result.at);
    for (const change of batch) {
      if (!accepted.has(change.id)) continue;
      const previous = state.votes[change.id]?.vote ?? "none";
      state.votes[change.id] = { vote: change.vote, at, previous };
    }
    await storage.setItem(VOTE_SYNC_KEY, state);
    // Over today's limit, or refused: the rest go up on a later sync.
    if (result.rejected.length > 0) {
      await storage.setItem(VOTE_RETRY_KEY, Date.now());
      return;
    }
  }
  await storage.removeItem(VOTE_RETRY_KEY);
}

// MARK: - Published list

/**
 * The list's entries, keeping only well-formed ones: it comes from the network,
 * and every YouTube page trusts it.
 */
function parseChannels(raw: unknown): AiListedChannel[] | null {
  if (!Array.isArray(raw) || raw.length > 200_000) return null;
  const count = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : 0);
  const channels: AiListedChannel[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !CHANNEL_ID.test(e.id) || !TIERS.has(e.tier as string)) continue;
    channels.push({
      id: e.id,
      tier: e.tier as AiTier,
      reviewed: e.reviewed === true || undefined,
      aiVotes: count(e.aiVotes),
      notAiVotes: count(e.notAiVotes),
      handle:
        typeof e.handle === "string" && /^@\S{1,99}$/.test(e.handle) ? e.handle.toLowerCase() : undefined,
      name: typeof e.name === "string" ? e.name.slice(0, 200) : "",
    });
  }
  return channels;
}

/**
 * Takes this browser's own votes out of the list's counts, since the channel
 * row adds them back live. A vote counts in the list if it reached the server
 * before the list was built; otherwise the list has whatever came before it.
 */
function withoutOwnVotes(channels: AiListedChannel[], generatedAt: number, state: VoteSyncState): void {
  for (const c of channels) {
    const synced = c.id ? state.votes[c.id] : undefined;
    if (!synced) continue;
    const counted = synced.at <= generatedAt ? synced.vote : synced.previous;
    if (counted === "ai") c.aiVotes = Math.max(0, (c.aiVotes ?? 0) - 1);
    if (counted === "notAi") c.notAiVotes = Math.max(0, (c.notAiVotes ?? 0) - 1);
  }
}

export async function fetchYouTubeAiList(): Promise<void> {
  const cached = await storage.getItem<YouTubeAiSharedList>(YOUTUBE_AI_SHARED_LIST_KEY);
  const res = await fetch(LIST_URL, {
    headers: cached?.etag ? { "if-none-match": cached.etag } : {},
    cache: "no-store",
  });
  if (res.status === 304 && cached) {
    await storage.setItem(YOUTUBE_AI_SHARED_LIST_KEY, { ...cached, fetchedAt: Date.now() });
    return;
  }
  if (!res.ok) throw new Error(`AI list fetch failed: ${res.status}`);

  const body = (await res.json()) as Record<string, unknown>;
  const channels = parseChannels(body.entries);
  const generatedAt = typeof body.generatedAt === "string" ? Date.parse(body.generatedAt) : NaN;
  if (!channels || !Number.isFinite(generatedAt) || typeof body.version !== "number") {
    throw new Error("AI list malformed");
  }
  withoutOwnVotes(channels, generatedAt, await readSyncState());
  await storage.setItem(YOUTUBE_AI_SHARED_LIST_KEY, {
    version: body.version,
    generatedAt: body.generatedAt as string,
    etag: res.headers.get("etag"),
    fetchedAt: Date.now(),
    channels,
  } satisfies YouTubeAiSharedList);
}

let syncing: Promise<void> | null = null;

/** Sends pending votes, then fetches the list if it's a day old. Overlapping calls share one run. */
function syncIfDue(): Promise<void> {
  syncing ??= (async () => {
    await pushYouTubeAiVotes();
    const cached = await storage.getItem<YouTubeAiSharedList>(YOUTUBE_AI_SHARED_LIST_KEY);
    if (cached && Date.now() - cached.fetchedAt < LIST_MAX_AGE_MS) return;
    // The worker wakes often, so while the server is unreachable, only try hourly.
    const lastAttempt = (await storage.getItem<number>(LIST_ATTEMPT_KEY)) ?? 0;
    if (Date.now() - lastAttempt < LIST_RETRY_MS) return;
    await storage.setItem(LIST_ATTEMPT_KEY, Date.now());
    await fetchYouTubeAiList().catch((e) => console.warn("[RELOCKR] AI list fetch failed", e));
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/**
 * Call at the top level of the background script, which runs each time the
 * service worker wakes. That run also syncs if due, so a browser opened after
 * a day away, or a fresh install, gets the list right away rather than at the
 * next alarm. An hourly alarm covers browsers left open for days; alarms wake
 * a sleeping service worker, and one missed while the computer slept fires on
 * wake. Votes also go up shortly after each change and after signing in.
 */
export function startYouTubeAiSync(): void {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void syncIfDue();
  });
  // Creating an alarm replaces one of the same name and restarts its delay,
  // and the worker wakes often, so only create it when it's missing (Chrome
  // may drop alarms on restart).
  void browser.alarms.get(ALARM_NAME).then((existing) => {
    if (!existing) void browser.alarms.create(ALARM_NAME, { periodInMinutes: 60 });
  });
  void syncIfDue();

  const settingsKey = SETTINGS_STORAGE_KEY.replace(/^local:/, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(settingsKey in changes || SUPABASE_AUTH_STORAGE_KEY in changes)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void pushYouTubeAiVotes(), 2000);
  });
}
