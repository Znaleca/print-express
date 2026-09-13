import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabasePublicServerClient } from "@/lib/supabasePublicServer";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { getAuthRedirectUrl } from "@/lib/appUrl";
import { getRequestDevice, getRequestIp, hashRateLimitScope } from "@/lib/otpSecurity";

export const dynamic = "force-dynamic";

async function consumeRateLimit(supabase, scope, limit, windowSeconds) {
  const { data, error } = await supabase.rpc("consume_otp_rate_limit", {
    p_scope: hashRateLimitScope(scope),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
    }

    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const rateLimits = [
      ["global", 100],
      [`ip:${getRequestIp(request)}`, 10],
      [`device:${getRequestDevice(request)}`, 5],
      [`email:${email}`, 3],
    ];
    for (const [scope, limit] of rateLimits) {
      if (!(await consumeRateLimit(admin, `verification-resend:${scope}`, limit, 15 * 60))) {
        return NextResponse.json({ error: "Please wait a moment before requesting another verification email." }, { status: 429 });
      }
    }

    const emailRedirectTo = getAuthRedirectUrl();
    if (!emailRedirectTo) {
      console.error("AUTH_RESEND_VERIFICATION_APP_URL_MISSING");
      return NextResponse.json({ error: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
    }

    const publicClient = getSupabasePublicServerClient();
    const { error } = await publicClient.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });

    if (error) {
      const message = String(error.message || "").toLowerCase();
      const status = message.includes("rate limit") || message.includes("too many") ? 429 : 502;
      return NextResponse.json({
        error: status === 429
          ? "Please wait a moment before requesting another verification email."
          : "We could not resend the verification email. Please try again.",
      }, { status });
    }

    return NextResponse.json({
      success: true,
      message: "A new verification email has been sent. Check your inbox and spam folder.",
    });
  } catch {
    console.error("AUTH_RESEND_VERIFICATION_UNAVAILABLE");
    return NextResponse.json({ error: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
