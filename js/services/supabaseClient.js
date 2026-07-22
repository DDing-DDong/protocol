import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const runtimeEnv = globalThis.__PROTOCOL_ENV__ || {};
const bundlerEnv = import.meta.env || {};

const SUPABASE_URL =
  runtimeEnv.SUPABASE_URL ||
  bundlerEnv.SUPABASE_URL ||
  bundlerEnv.VITE_SUPABASE_URL ||
  "";

const SUPABASE_ANON_KEY =
  runtimeEnv.SUPABASE_ANON_KEY ||
  bundlerEnv.SUPABASE_ANON_KEY ||
  bundlerEnv.VITE_SUPABASE_ANON_KEY ||
  "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export async function checkSupabaseConnection() {
  if (!supabase) {
    return {
      ok: false,
      reason: "missing-supabase-config",
    };
  }

  const { error } = await supabase.auth.getSession();
  return {
    ok: !error,
    error: error || null,
  };
}
