import type { RelockrSettings } from "@/types/RelockrSettings";

export type SettingsWriter = (patch: RelockrSettings) => Promise<void>;

let writer: SettingsWriter | null = null;

/**
 * Lets DOM code save settings it changes from the page (e.g. YouTube AI votes,
 * or that a one-time notice was seen). Each platform registers its own, since
 * only it knows where settings live. Without one, changes stay in the page.
 */
export function registerDomSettingsWriter(value: SettingsWriter): void {
  writer = value;
}

/** Saves a settings patch through the platform's writer. May reject. */
export async function writeDomSettings(patch: RelockrSettings): Promise<void> {
  await writer?.(patch);
}
