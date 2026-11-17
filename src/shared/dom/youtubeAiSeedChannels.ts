import type { AiListedChannel } from "./youtubeAiLists";

/**
 * Hand-verified channels that publish fully AI-generated videos (AI music
 * compilations, AI-narrated documentaries). Bundled so AI blocking works before
 * the nightly published list exists; that list will replace this one, in the
 * same shape, with community tiers and vote counts.
 *
 * Only add channels verified by hand, as `tier: "veryLikely", reviewed: true`.
 * Prefer the stable `UC…` id; the handle is a fallback for tiles that only
 * expose `/@handle`.
 *
 * To update: vote channels AI, then in the popup use "Export to JSON" under
 * the list of channels you voted AI and paste the copied array as this value.
 * The button shows in dev builds; in release builds, type "json" while the
 * list is open to reveal it.
 */
export const YOUTUBE_AI_SEED_CHANNELS: readonly AiListedChannel[] = [];
