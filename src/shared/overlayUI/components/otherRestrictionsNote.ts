import { makeText } from "../utils/domHelpers";
import {
  type BlockFlow,
  type RestrictionKind,
  restrictionLabel,
} from "../restrictions";
import { t } from "~/lib/i18n";

/**
 * Lists the restrictions a block screen isn't fronting, so a user who clears
 * the one in front of them isn't surprised that the others existed.
 *
 * Returns null when `primary` is the only thing blocking.
 */
export function createOtherRestrictionsNote(
  flow: BlockFlow,
  primary: RestrictionKind,
): HTMLDivElement | null {
  const others = flow.active.filter((kind) => kind !== primary);
  if (others.length === 0) return null;

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "2px",
    padding: "10px 14px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
  });

  wrap.appendChild(
    makeText(t("session_multipleRestrictionsLabel"), {
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.6px",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.5)",
      textAlign: "start",
    }),
  );

  wrap.appendChild(
    makeText(others.map(restrictionLabel).join(" · "), {
      fontSize: "13px",
      color: "rgba(255,200,120,0.85)",
      textAlign: "start",
    }),
  );

  return wrap;
}
