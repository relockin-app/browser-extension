import type { AiListedChannel } from "./dom/youtubeAiLists";

/**
 * The published list of AI YouTube channels, as last downloaded by the
 * background (youtubeAiSync.ts) and read by the YouTube content script. Its
 * vote counts leave out this browser's own votes.
 */
export const YOUTUBE_AI_SHARED_LIST_KEY = "local:youtubeAiSharedList";

export interface YouTubeAiSharedList {
  /** The server's list version. */
  version: number;
  /** When the server built it (ISO). */
  generatedAt: string;
  etag: string | null;
  /** When this browser last checked for a newer one (ms). */
  fetchedAt: number;
  channels: AiListedChannel[];
}
