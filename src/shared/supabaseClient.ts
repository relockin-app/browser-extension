import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_AUTH_STORAGE_KEY, SUPABASE_URL } from "./supabaseConfig";

export { SUPABASE_AUTH_STORAGE_KEY };

/**
 * Custom storage adapter that uses browser.storage.local so auth sessions
 * persist across popup open/close cycles and are accessible from the
 * background service worker.
 */
const extensionStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const result = await browser.storage.local.get(key);
    return (result[key] as string) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    storage: extensionStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
