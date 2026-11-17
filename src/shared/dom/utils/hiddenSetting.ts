import type { RelockrSettings } from "@/types/RelockrSettings";
import { SETTINGS_DEFAULTS } from "../../settings/settingsDefaults";

/**
 * Whether a hidden setting is on. Hidden settings default to on, so only an
 * explicit `false` turns one off. See the note at the top of settingsKey.ts.
 */
export function isHiddenSettingOn(
  settings: RelockrSettings,
  key: string,
): boolean {
  return (settings[key] ?? SETTINGS_DEFAULTS[key]) !== false;
}
