import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const revalidate = 0;

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { data: existingUserId, error } = await supabase.rpc("get_user_id_by_email", { lookup_email: normalizedEmail });
    
    if (error) throw error;

    return NextResponse.json({ exists: !!existingUserId, checkUnavailable: false });
  } catch (err) {
    console.error("Check email API error:", err);

    return NextResponse.json(
      {
        exists: false,
        checkUnavailable: true,
        message: "Email availability check is temporarily unavailable.",
      },
      { status: 200 }
    );
  }
}
