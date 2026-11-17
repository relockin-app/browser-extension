import { RL_FONT_BODY, RL_GRADIENT } from "../designTokens";

/** Full-width gradient CTA button. Dark text for contrast against the light gradient. */
export function styleButtonGradient(btn: HTMLButtonElement): void {
  btn.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    padding: 14px 32px;

    font-family: ${RL_FONT_BODY};
    font-size: 16px;
    font-weight: 600;

    border-radius: 14px;
    cursor: pointer;
    user-select: none;

    color: #1a1a1a !important;
    background: ${RL_GRADIENT} !important;
    border: none !important;

    box-shadow:
        0 4px 10px rgba(115,158,235,0.3),
        inset 0 1px 0 rgba(255,255,255,0.2);

    transition:
        opacity 0.15s ease,
        transform 0.12s ease;

    text-align: center;
    `;

  addButtonHover(btn);
}

/** Compact pill button for starting sessions and time presets. Dark text for contrast against the light gradient. */
export function styleButtonCompact(btn: HTMLButtonElement): void {
  btn.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    padding: 6px 14px;

    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    font-weight: 600;

    border-radius: 10px;
    cursor: pointer;
    user-select: none;

    color: #1a1a1a !important;
    background: ${RL_GRADIENT} !important;
    border: none !important;

    transition:
        opacity 0.15s ease,
        transform 0.12s ease;

    text-align: center;
    `;

  addButtonHover(btn);
}

/** Compact pill button – secondary / dark variant */
export function styleButtonCompactSecondary(btn: HTMLButtonElement): void {
  btn.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    padding: 6px 14px;

    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    font-weight: 600;

    border-radius: 10px;
    cursor: pointer;
    user-select: none;

    color: rgba(255,255,255,0.7) !important;
    background: rgba(255,255,255,0.08) !important;
    border: 1px solid rgba(255,255,255,0.18) !important;

    transition:
        opacity 0.15s ease,
        transform 0.12s ease,
        background 0.15s ease;

    text-align: center;
    `;

  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(255,255,255,0.14)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "rgba(255,255,255,0.08)";
  });
  btn.addEventListener("mousedown", () => {
    btn.style.transform = "scale(0.98)";
  });
  btn.addEventListener("mouseup", () => {
    btn.style.transform = "none";
  });
}

/** Outline ghost button (e.g. "No") */
export function styleButtonOutline(btn: HTMLButtonElement): void {
  btn.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    padding: 14px 32px;

    font-family: ${RL_FONT_BODY};
    font-size: 16px;
    font-weight: 600;

    border-radius: 14px;
    cursor: pointer;
    user-select: none;

    color: rgba(255,255,255,0.7) !important;
    background: transparent !important;
    border: 1px solid rgba(255,255,255,0.25) !important;

    transition:
        opacity 0.15s ease,
        transform 0.12s ease,
        background 0.15s ease;

    text-align: center;
    `;

  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(255,255,255,0.08)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "transparent";
  });
  btn.addEventListener("mousedown", () => {
    btn.style.transform = "scale(0.98)";
  });
  btn.addEventListener("mouseup", () => {
    btn.style.transform = "none";
  });
}

export function styleButtonDisabled(btn: HTMLButtonElement): void {
  btn.style.cssText = `
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    padding: 6px 14px;

    font-family: ${RL_FONT_BODY};
    font-size: 14px;
    font-weight: 600;

    border-radius: 10px;
    cursor: not-allowed;
    user-select: none;

    color: rgba(255, 255, 255, 0.3) !important;
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;

    text-align: center;
    `;
}

export function addButtonHover(btn: HTMLButtonElement): void {
  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "0.9";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = "1";
  });
  btn.addEventListener("mousedown", () => {
    btn.style.opacity = "0.85";
    btn.style.transform = "scale(0.98)";
  });
  btn.addEventListener("mouseup", () => {
    btn.style.opacity = "1";
    btn.style.transform = "none";
  });
}
