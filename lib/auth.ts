import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface SessionContext {
  supabase: SupabaseClient | null;
  user: User | null;
  orgId: string | null;
}

/**
 * Resolve the current user + their org from a Server Component / Route Handler.
 * When Supabase is not configured, everything is null (the UI shows a setup
 * notice instead of crashing).
 */
export async function getSessionContext(): Promise<SessionContext> {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, orgId: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, orgId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  return { supabase, user, orgId: profile?.org_id ?? null };
}
