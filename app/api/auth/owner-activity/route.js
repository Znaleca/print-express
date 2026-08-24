import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function getBearerToken(request) {
  const value = request.headers.get("authorization") || "";
  return value.replace(/^Bearer\s+/i, "").trim();
}

export async function POST(request) {
  try {
    const token = getBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabaseAdminClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: updatedCount, error } = await supabase.rpc("record_owner_sign_in", {
      p_user_id: user.id,
    });
    if (error) throw error;

    return NextResponse.json({ success: true, updatedCount: Number(updatedCount || 0) });
  } catch (error) {
    console.error("OWNER_ACTIVITY_RECORD_ERROR:", error);
    return NextResponse.json({ error: "Unable to record owner activity." }, { status: 500 });
  }
}
