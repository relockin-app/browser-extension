import type { RelockrSettings } from "@/types/RelockrSettings";
import { SETTINGS_DEFAULTS } from "./settingsDefaults";

const STORAGE_KEY = "local:reelockrSettings";

export let relockrSettings: RelockrSettings = {};

export function mergeSettings(incoming: unknown): void {
  if (incoming && typeof incoming === "object") {
    relockrSettings = {
      ...relockrSettings,
      ...(incoming as RelockrSettings),
    };
  }
}

export async function ensureSettingsLoaded(): Promise<void> {
  try {
    const stored = await storage.getItem<RelockrSettings>(STORAGE_KEY);
    if (stored) {
      relockrSettings = stored;
    }
  } catch (e) {
    console.warn("[REELOCKR] Failed to load settings:", e);
  }
}

export function watchSettings(onUpdate: () => void): () => void {
  return storage.watch<RelockrSettings>(STORAGE_KEY, (newValue) => {
    relockrSettings = newValue ?? {};
    onUpdate();
  });
}

/**
 * Merge `patch` into the stored settings. Reads storage first, so changes made
 * elsewhere (e.g. in the popup) since this page loaded are kept.
 */
export async function saveSettingsPatch(patch: RelockrSettings): Promise<void> {
  const stored = (await storage.getItem<RelockrSettings>(STORAGE_KEY)) ?? {};
  relockrSettings = { ...stored, ...patch };
  await storage.setItem(STORAGE_KEY, relockrSettings);
}

/** Read a setting with its default fallback. */
export function getSetting<T>(key: string): T {
  const val = relockrSettings[key];
  return (val !== undefined ? val : SETTINGS_DEFAULTS[key]) as T;
}
