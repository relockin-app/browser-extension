// Kept apart from supabaseClient.ts so content scripts can use these without
// bundling the Supabase client.

export const SUPABASE_URL = "https://fkrzugemztxhrdujmikh.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_8N2jqH1ymPZr2hrvQrwikw_KjtHljwH";

/**
 * Supabase's default key for this project, pinned so other contexts can watch
 * for session changes in storage.
 */
export const SUPABASE_AUTH_STORAGE_KEY = "sb-fkrzugemztxhrdujmikh-auth-token";
