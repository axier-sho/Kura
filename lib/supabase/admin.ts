import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseAdminConfigured } from "@/lib/env";

/**
 * Service-role Supabase client bypasses RLS. SERVER-ONLY.
 * Used by the cron notify route (no user session) and background ingestion.
 * Returns null when the service-role key is not configured.
 */
export function createAdminClient(): SupabaseClient | null {
  if (!isSupabaseAdminConfigured()) return null;
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
