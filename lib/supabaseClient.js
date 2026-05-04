import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

// Singleton: reuse the same client instance across hot-reloads in dev
// and across imports in production to avoid "Multiple GoTrueClient instances" warning.
const createSupabaseClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      clockSkewInSeconds: 60,
    },
  });

export const supabase =
  globalThis.__supabase ?? (globalThis.__supabase = createSupabaseClient());
