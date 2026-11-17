import { styleQuietButton } from "./cardParts";
import type { BlockFlow } from "../restrictions";
import {
  hasAllowedOverrideTier,
  makeOverridesNotAllowedNote,
  showOverrideSizePickerScreen,
} from "../screens/overrideSizePickerScreen";

/**
 * The toned-down override entry point on a block screen, leading to the tier
 * picker. When the guardrails make every tier Impossible it's replaced by a
 * note saying so, rather than silently dropped, so a forgotten setting doesn't
 * read as a bug.
 */
export function createOverrideButton(
  container: HTMLDivElement,
  flow: BlockFlow,
  label: string,
): HTMLButtonElement {
  const overrideBtn = document.createElement("button");
  overrideBtn.textContent = label;
  // Text-only so it reads as "not encouraged".
  styleQuietButton(overrideBtn);
  // Hidden until we know it leads anywhere.
  overrideBtn.style.visibility = "hidden";
  overrideBtn.addEventListener("click", () => {
    showOverrideSizePickerScreen(container, flow);
  });

  hasAllowedOverrideTier(flow)
    .then((isAllowed) => {
      if (!isAllowed) overrideBtn.replaceWith(makeOverridesNotAllowedNote());
    })
    .catch((e) => {
      // Keep the button: the tier picker and challenge still refuse anything
      // the guardrails don't allow.
      console.warn("[RELOCKR] Override tier lookup failed:", String(e));
    })
    .finally(() => {
      overrideBtn.style.visibility = "visible";
    });

  return overrideBtn;
}
