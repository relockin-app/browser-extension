// DOM-based math challenge — mirrors iOS MathChallengeView.swift

import { t } from "~/lib/i18n";
import {
  RL_ACCENT_BLUE,
  RL_FONT_BODY,
  RL_FONT_TITLE,
} from "~/shared/overlayUI/designTokens";
import {
  styleButtonGradient,
  styleButtonOutline,
} from "~/shared/overlayUI/utils/buttonStyles";
import {
  type MathChallengeConfig,
  type MathOperation,
  MathDifficulty,
  MATH_OPERATION_SYMBOLS,
  getEnabledOperations,
  getOperandRange,
  getFactorRange,
} from "../ChallengeTypes";

export interface MathChallengeOptions {
  config: MathChallengeConfig;
  goalText: string;
  onCompleted: () => void;
  onCancelled: () => void;
}

interface MathProblem {
  expression: string;
  answer: number;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateProblem(
  operation: MathOperation,
  config: MathChallengeConfig,
): MathProblem {
  const [opMin, opMax] = getOperandRange(config.difficulty);
  const [facMin, facMax] = getFactorRange(config.difficulty);
  const sym = MATH_OPERATION_SYMBOLS[operation];

  switch (operation) {
    case "addition": {
      const a = randInt(opMin, opMax);
      const b = randInt(opMin, opMax);
      return { expression: `${a} ${sym} ${b} =`, answer: a + b };
    }
    case "subtraction": {
      let a = randInt(opMin, opMax);
      let b = randInt(opMin, opMax);
      // On easy/medium, ensure non-negative result
      if (
        config.difficulty === MathDifficulty.Easy ||
        config.difficulty === MathDifficulty.Medium
      ) {
        if (b > a) [a, b] = [b, a];
      }
      return { expression: `${a} ${sym} ${b} =`, answer: a - b };
    }
    case "multiplication": {
      const a = randInt(facMin, facMax);
      const b = randInt(facMin, facMax);
      return { expression: `${a} ${sym} ${b} =`, answer: a * b };
    }
    case "division": {
      // Generate clean division (no remainders)
      const divisor = randInt(facMin, facMax);
      const quotient = randInt(opMin, opMax);
      const dividend = divisor * quotient;
      return {
        expression: `${dividend} ${sym} ${divisor} =`,
        answer: quotient,
      };
    }
  }

  // Exhaustiveness fallback (should never be reached)
  const a = randInt(opMin, opMax);
  const b = randInt(opMin, opMax);
  return { expression: `${a} + ${b} =`, answer: a + b };
}

function generateProblems(config: MathChallengeConfig): MathProblem[] {
  const ops = getEnabledOperations(config);
  const problems: MathProblem[] = [];
  for (let i = 0; i < config.problemCount; i++) {
    const op = ops[Math.floor(Math.random() * ops.length)];
    problems.push(generateProblem(op, config));
  }
  return problems;
}

export function createMathChallengeView(
  options: MathChallengeOptions,
): HTMLDivElement {
  const { config, goalText, onCompleted, onCancelled } = options;
  const problems = generateProblems(config);

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
  titleEl.textContent = t("challengeUi_solveToConfirm");
  titleEl.style.cssText = `
    font-family: ${RL_FONT_TITLE};
    font-size: 20px;
    font-weight: 700;
    color: rgba(255,255,255,0.95);
    text-align: center;
    line-height: 1.3;
  `;
  root.appendChild(titleEl);

  // Problem rows
  const problemsContainer = document.createElement("div");
  problemsContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  const answerFields: HTMLInputElement[] = [];

  for (let i = 0; i < problems.length; i++) {
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
    `;

    const expr = document.createElement("div");
    expr.textContent = problems[i].expression;
    expr.style.cssText = `
      font-family: ${RL_FONT_TITLE};
      font-size: 16px;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
      min-width: 120px;
      text-align: right;
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = hasNegativeAnswers(config) ? "text" : "numeric";
    input.placeholder = t("challengeUi_questionPlaceholder");
    input.setAttribute(
      "aria-label",
      t("challengeUi_answerAccessibilityFormat", String(i + 1)),
    );
    input.style.cssText = `
      all: unset;
      display: block;
      width: 80px;
      padding: 8px 12px;
      font-family: ${RL_FONT_BODY};
      font-size: 14px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.06);
      border: 2px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      text-align: center;
      transition: border-color 0.2s ease;
      box-sizing: border-box;
    `;
    input.addEventListener("focus", () => {
      input.style.borderColor = RL_ACCENT_BLUE;
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "rgba(255,255,255,0.15)";
    });

    // Tab to next field or submit on Enter
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (i < answerFields.length - 1) {
          answerFields[i + 1].focus();
        } else {
          confirmBtn.click();
        }
      }
    });

    answerFields.push(input);
    row.appendChild(expr);
    row.appendChild(input);
    problemsContainer.appendChild(row);
  }

  root.appendChild(problemsContainer);

  // Feedback
  const feedbackEl = document.createElement("div");
  feedbackEl.textContent = t("challengeUi_enterAnswers");
  feedbackEl.style.cssText = `
    font-family: ${RL_FONT_BODY};
    font-size: 13px;
    color: rgba(255,255,255,0.4);
    text-align: center;
    min-height: 18px;
    transition: color 0.2s ease;
  `;
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

  // ── Cancel handler ──────────────────────────────────────────────

  cancelBtn.addEventListener("click", () => {
    onCancelled();
  });

  // ── Confirm handler ─────────────────────────────────────────────

  confirmBtn.addEventListener("click", () => {
    let allCorrect = true;

    for (let i = 0; i < problems.length; i++) {
      const parsed = parseInt(answerFields[i].value.trim(), 10);
      const correct = !isNaN(parsed) && parsed === problems[i].answer;

      if (correct) {
        answerFields[i].style.borderColor = "#4caf50";
      } else {
        answerFields[i].style.borderColor = "#ef5350";
        allCorrect = false;
      }
    }

    if (allCorrect) {
      feedbackEl.textContent = t("challengeUi_allCorrect");
      feedbackEl.style.color = "#4caf50";
      onCompleted();
    } else {
      feedbackEl.textContent = t("challengeUi_someIncorrect");
      feedbackEl.style.color = "#ff9800";
    }
  });

  // Focus first field
  requestAnimationFrame(() => answerFields[0]?.focus());

  return root;
}

function hasNegativeAnswers(config: MathChallengeConfig): boolean {
  return (
    config.allowSubtraction &&
    (config.difficulty === MathDifficulty.Hard ||
      config.difficulty === MathDifficulty.ExtraHard)
  );
}
