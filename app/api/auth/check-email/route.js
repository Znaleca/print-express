import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const { data: existingUserId, error } = await supabase.rpc("get_user_id_by_email", { lookup_email: email });
    
    if (error) throw error;

    return NextResponse.json({ exists: !!existingUserId });
  } catch (err) {
    console.error("Check email API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
