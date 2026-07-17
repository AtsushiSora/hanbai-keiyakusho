import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_CONFIG } from "./supabase-config.js";

const publicKey = SUPABASE_CONFIG.publishableKey || SUPABASE_CONFIG.anonKey || "";

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_CONFIG.url && publicKey);
}

export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_CONFIG.url, publicKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export { SUPABASE_CONFIG };
