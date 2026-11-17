// DOM-based typing challenge — mirrors iOS TypingChallengeView.swift
// Works in both popup and content script (page overlay) contexts.

import { t } from "~/lib/i18n";
import {
  RL_ACCENT_BLUE,
  RL_ACCENT_LAVENDER,
  RL_FONT_BODY,
  RL_FONT_TITLE,
} from "~/shared/overlayUI/designTokens";
import {
  styleButtonGradient,
  styleButtonOutline,
} from "~/shared/overlayUI/utils/buttonStyles";

export interface TypingChallengeOptions {
  targetSentence: string;
  goalText: string;
  /** Defaults to "Type the sentence to continue". */
  titleText?: string;
  /** Text above the input. Defaults to "Sentence: “…”". */
  sentenceLabelText?: string;
  /** Starting height of the input, in px. Defaults to 80. */
  inputMinHeight?: number;
  onCompleted: () => void;
  onCancelled: () => void;
}

/** Scripts written without spaces between words (Han, kana, CJK punctuation, full-width forms, Thai). */
const SPACELESS = "\\u0E00-\\u0E7F\\u3000-\\u30FF\\u31F0-\\u31FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\uFF00-\\uFFEF\\u{20000}-\\u{3FFFF}";
const SPACE_BY_SPACELESS = new RegExp(`\\s+(?=[${SPACELESS}])|(?<=[${SPACELESS}])\\s+`, "gu");

/**
 * Text the user types counts as the sentence when it differs only in ways a keyboard can't help,
 * matching iOS/Android (TypingProgress): NFKC folds full-width forms CJK IMEs type (！, Ａ, ２, the
 * ideographic space) and composes Hangul and accents; curly quotes, typographic dashes and ё count
 * as their keyboard forms; spaces next to scripts written without them don't matter.
 */
function normalize(str: string): string {
  return str
    .normalize("NFKC")
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[ёЁ]/g, (c) => (c === "ё" ? "е" : "Е"))
    .replace(SPACE_BY_SPACELESS, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function createTypingChallengeView(
  options: TypingChallengeOptions,
): HTMLDivElement {
  const {
    targetSentence,
    goalText,
    titleText = t("challengeUi_typeToConfirmTitle"),
    sentenceLabelText = t("challengeUi_sentenceLabelFormat", targetSentence),
    inputMinHeight = 80,
    onCompleted,
    onCancelled,
  } = options;

  const root = document.createElement("div");
  root.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    box-sizing: border-box;
  `;

  // Goal text
  const goalEl = document.createElement("div");
  goalEl.textContent = goalText;
  goalEl.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    color: rgba(255,255,255,0.5);
    text-align: center;
  `;
  root.appendChild(goalEl);

  // Title
  const titleEl = document.createElement("div");
  titleEl.textContent = titleText;
  titleEl.style.cssText = `
    font-family: ${RL_FONT_TITLE};
    font-size: 20px;
    font-weight: 700;
    color: rgba(255,255,255,0.95);
    text-align: center;
    line-height: 1.3;
  `;
  root.appendChild(titleEl);

  // Sentence label — anti-cheat: cannot be selected, copied, or right-clicked.
  const sentenceLabel = document.createElement("div");
  sentenceLabel.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    color: rgba(255,255,255,0.7);
    text-align: center;
    white-space: pre-wrap;
    line-height: 1.5;
    padding: 12px 16px;
    background: rgba(255,255,255,0.05);
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1);
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  `;
  sentenceLabel.textContent = sentenceLabelText;
  sentenceLabel.addEventListener("copy", (e) => e.preventDefault());
  sentenceLabel.addEventListener("cut", (e) => e.preventDefault());
  sentenceLabel.addEventListener("contextmenu", (e) => e.preventDefault());
  sentenceLabel.addEventListener("dragstart", (e) => e.preventDefault());
  root.appendChild(sentenceLabel);

  // Text area — anti-cheat: paste and drop are blocked.
  const textArea = document.createElement("textarea");
  textArea.placeholder = t("challengeUi_typeExactly");
  textArea.setAttribute("aria-label", t("challengeUi_typingInputAccessibility"));
  textArea.autocomplete = "off";
  textArea.spellcheck = false;
  textArea.setAttribute("autocorrect", "off");
  textArea.setAttribute("autocapitalize", "off");
  textArea.style.cssText = `
    all: unset;
    display: block;
    width: 100%;
    min-height: ${inputMinHeight}px;
    padding: 12px;
    box-sizing: border-box;
    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    color: rgba(255,255,255,0.9);
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px;
    resize: vertical;
    line-height: 1.5;
  `;
  textArea.addEventListener("focus", () => {
    textArea.style.borderColor = RL_ACCENT_BLUE;
  });
  textArea.addEventListener("blur", () => {
    textArea.style.borderColor = "rgba(255,255,255,0.15)";
  });
  textArea.addEventListener("paste", (e) => e.preventDefault());
  textArea.addEventListener("drop", (e) => e.preventDefault());
  root.appendChild(textArea);

  // Feedback
  const feedbackEl = document.createElement("div");
  feedbackEl.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 13px;
    min-height: 18px;
    text-align: center;
    transition: color 0.2s ease;
  `;
  feedbackEl.textContent = "";
  root.appendChild(feedbackEl);

  // Button row
  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = `
    display: flex;
    gap: 10px;
    width: 100%;
  `;

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = t("common_cancel");
  styleButtonOutline(cancelBtn);
  cancelBtn.style.flex = "1";
  cancelBtn.style.boxSizing = "border-box";
  buttonRow.appendChild(cancelBtn);

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = t("challengeUi_confirm");
  styleButtonGradient(confirmBtn);
  confirmBtn.style.flex = "1";
  confirmBtn.style.boxSizing = "border-box";
  buttonRow.appendChild(confirmBtn);

  root.appendChild(buttonRow);

  // ── Live feedback on input ──────────────────────────────────────

  let isCompleted = false;

  // Text an IME is still composing (kana before kanji conversion, pinyin, a Hangul syllable being
  // built) isn't checked until it's committed; it would otherwise read as a mismatch.
  textArea.addEventListener("input", (e) => {
    if (!(e as InputEvent).isComposing) checkInput();
  });
  textArea.addEventListener("compositionend", () => checkInput());

  function checkInput(): void {
    if (isCompleted) return;

    const typed = normalize(textArea.value);
    const target = normalize(targetSentence);

    if (typed === target) {
      isCompleted = true;
      feedbackEl.textContent = t("challengeUi_typingCompleted");
      feedbackEl.style.color = "#4caf50";
      textArea.style.borderColor = "#4caf50";
      return;
    }

    if (typed.length === 0) {
      feedbackEl.textContent = "";
      feedbackEl.style.color = "rgba(255,255,255,0.4)";
      return;
    }

    // Check if current input is a valid prefix of the target
    if (target.startsWith(typed)) {
      feedbackEl.textContent = t("challengeUi_keepGoing");
      feedbackEl.style.color = "rgba(255,255,255,0.4)";
    } else {
      feedbackEl.textContent = t("challengeUi_mismatchDetected");
      feedbackEl.style.color = "#ff9800";
    }
  }

  // ── Cancel handler ──────────────────────────────────────────────

  cancelBtn.addEventListener("click", () => {
    onCancelled();
  });

  // ── Confirm handler ─────────────────────────────────────────────

  confirmBtn.addEventListener("click", () => {
    const typed = normalize(textArea.value);
    const target = normalize(targetSentence);

    if (typed === target) {
      isCompleted = true;
      feedbackEl.textContent = t("challengeUi_typingCompleted");
      feedbackEl.style.color = "#4caf50";
      onCompleted();
    } else {
      feedbackEl.textContent = t("challengeUi_typingNoMatch");
      feedbackEl.style.color = "#ff9800";
      textArea.style.borderColor = "#ff9800";
      setTimeout(() => {
        if (!isCompleted) {
          textArea.style.borderColor = "rgba(255,255,255,0.15)";
        }
      }, 2000);
    }
  });

  return root;
}
