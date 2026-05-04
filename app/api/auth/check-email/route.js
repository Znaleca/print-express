import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
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
