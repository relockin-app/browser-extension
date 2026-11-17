/**
 * Whether this browser gets the free tier of the mobile app. The extension is
 * free on computers. On a phone (Firefox or Edge for Android) it has the app's
 * free tier: Pro site customizations off, one time limit rule and one schedule.
 *
 * "Phone" is an Android device, from `runtime.getPlatformInfo`,
 * which a site's mobile layout or "Request desktop site" doesn't change.
 * Content scripts can't call it, so the background and extension pages detect
 * it and store it here.
 */

export type DeviceOverride = "phone" | "computer";

export interface ProAccess {
  isPhone: boolean;
  /** RelockIn Pro bought in the app. Not detected in the extension yet. */
  hasPro: boolean;
}

const IS_PHONE_KEY = "local:relockrIsPhone";
/** Dev builds only: pretend to be on a phone or a computer, to test the free tier. */
const DEVICE_OVERRIDE_KEY = "local:relockrDevDeviceOverride";

export const FULL_ACCESS: ProAccess = { isPhone: false, hasPro: false };

/** Whether Pro features are off here. */
export function isLimited(access: ProAccess): boolean {
  return access.isPhone && !access.hasPro;
}

/** Detects the device and stores it. Extension pages and the background only. */
export async function detectDevice(): Promise<boolean> {
  let isPhone = false;
  try {
    const { os } = await browser.runtime.getPlatformInfo();
    isPhone = os === "android";
  } catch {
    // Unknown: count it as a computer, so no one on one is ever limited.
  }
  await storage.setItem(IS_PHONE_KEY, isPhone);
  return isPhone;
}

async function readIsPhone(): Promise<boolean> {
  const stored = await storage.getItem<boolean>(IS_PHONE_KEY);
  if (stored !== null) return stored;
  // Not detected yet (just installed); content scripts can't detect it themselves.
  return typeof browser.runtime.getPlatformInfo === "function" ? detectDevice() : false;
}

export async function getDeviceOverride(): Promise<DeviceOverride | null> {
  if (!import.meta.env.DEV) return null;
  return storage.getItem<DeviceOverride>(DEVICE_OVERRIDE_KEY);
}

export async function setDeviceOverride(override: DeviceOverride | null): Promise<void> {
  if (override === null) await storage.removeItem(DEVICE_OVERRIDE_KEY);
  else await storage.setItem(DEVICE_OVERRIDE_KEY, override);
}

export async function getProAccess(): Promise<ProAccess> {
  const override = await getDeviceOverride();
  const isPhone = override ? override === "phone" : await readIsPhone();
  return { isPhone, hasPro: false };
}

/** Calls `onChange` with the new access whenever it changes. Returns an unsubscribe fn. */
export function watchProAccess(onChange: (access: ProAccess) => void): () => void {
  const update = () => void getProAccess().then(onChange);
  const unwatchers = [
    storage.watch<boolean>(IS_PHONE_KEY, update),
    storage.watch<DeviceOverride>(DEVICE_OVERRIDE_KEY, update),
  ];
  return () => unwatchers.forEach((unwatch) => unwatch());
}
