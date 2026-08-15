import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function getBearerToken(request) {
  const value = request.headers.get("authorization") || "";
  return value.replace(/^Bearer\s+/i, "").trim();
}

/** Authenticate a route request and verify the role from public.profiles. */
export async function requireAdmin(request) {
  const token = getBearerToken(request);
  if (!token) return { error: "Unauthorized", status: 401 };

  const supabase = getSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { error: "Unauthorized", status: 401 };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "ADMIN") {
    return { error: "Forbidden", status: 403 };
  }

  return { supabase, user, profile };
}
