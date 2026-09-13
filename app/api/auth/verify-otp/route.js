import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { isValidEmail, normalizeEmail, validatePassword } from "@/lib/auth";
import { hashOtp, safeEqualHex } from "@/lib/otpSecurity";

export const dynamic = "force-dynamic";

const INVALID_CODE_MESSAGE = "Invalid or expired code.";

async function consumeOtp(supabase, otpId) {
  const { error } = await supabase.from("otp_verifications").delete().eq("id", otpId);
  if (error) throw error;
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
    }

    const email = normalizeEmail(body?.email);
    const code = String(body?.code || "").trim();
    const type = String(body?.type || "").trim().toLowerCase();
    const password = typeof body?.password === "string" ? body.password : "";

    if (!isValidEmail(email) || !/^\d{6}$/.test(code) || type !== "reset") {
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const { data: verifications, error: verifyError } = await supabase
      .from("otp_verifications")
      .select("id, otp_hash, attempt_count, max_attempts")
      .eq("email", email)
      .eq("type", type)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (verifyError) {
      console.error("AUTH_RESET_CODE_LOOKUP_FAILED");
      return NextResponse.json({ error: "Verification is temporarily unavailable. Please try again." }, { status: 503 });
    }

    const verification = verifications?.[0];
    let codeMatches = false;
    if (verification?.otp_hash) {
      try {
        codeMatches = safeEqualHex(
          verification.otp_hash,
          hashOtp({ email, type, code }),
        );
      } catch {
        console.error("AUTH_RESET_CODE_COMPARE_FAILED");
      }
    }

    if (!verification || !codeMatches) {
      if (verification?.id) {
        const { error: attemptError } = await supabase.rpc("register_otp_attempt", {
          p_otp_id: verification.id,
        });
        if (attemptError) console.error("AUTH_RESET_ATTEMPT_TRACKING_FAILED");
      }
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }

    const { data: userId, error: lookupError } = await supabase.rpc("get_user_id_by_email", {
      lookup_email: email,
    });
    if (lookupError || !userId) {
      console.error("AUTH_RESET_USER_LOOKUP_FAILED");
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      console.error("AUTH_RESET_PASSWORD_UPDATE_FAILED");
      return NextResponse.json({ error: "Unable to update the password. Please try again." }, { status: 400 });
    }

    try {
      await consumeOtp(supabase, verification.id);
    } catch {
      console.error("AUTH_RESET_CODE_CONSUME_FAILED");
    }

    return NextResponse.json({ success: true, message: "Password updated successfully." });
  } catch {
    console.error("AUTH_RESET_UNAVAILABLE");
    return NextResponse.json({ error: "Verification is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
