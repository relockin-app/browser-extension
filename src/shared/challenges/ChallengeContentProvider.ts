// Sentence pools and view factory — mirrors iOS ChallengeContentProvider.swift

import { t } from "~/lib/i18n";

const SHORT_SENTENCE_KEYS = [
  "typingSentences_short1",
  "typingSentences_short2",
  "typingSentences_short3",
  "typingSentences_short4",
  "typingSentences_short5",
] as const;

const LONG_SENTENCE_KEYS = [
  "typingSentences_long1",
  "typingSentences_long2",
  "typingSentences_long3",
] as const;

const PARAGRAPH_KEYS = [
  "typingSentences_paragraph1",
  "typingSentences_paragraph2",
  "typingSentences_paragraph3",
  "typingSentences_paragraph4",
  "typingSentences_paragraph5",
  "typingSentences_paragraph6",
] as const;

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shortSentence(): string {
  return t(randomElement(SHORT_SENTENCE_KEYS));
}

export function longSentence(): string {
  return t(randomElement(LONG_SENTENCE_KEYS));
}

export function paragraph(): string {
  return t(randomElement(PARAGRAPH_KEYS));
}
