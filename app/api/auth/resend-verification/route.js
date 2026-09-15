import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { getAuthRedirectUrl } from "@/lib/appUrl";
import { getRequestDevice, getRequestIp, hashRateLimitScope } from "@/lib/otpSecurity";
import { sendAuthVerificationEmail } from "@/lib/authVerificationEmail";

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

    const { data: accountRows, error: accountError } = await admin.rpc("get_auth_user_status_by_email", {
      lookup_email: email,
    });
    if (accountError) throw accountError;

    const account = Array.isArray(accountRows) ? accountRows[0] : accountRows;
    // Keep the response generic when the account is missing or already
    // verified. In particular, never generate a magic login link for a
    // confirmed account from this public endpoint.
    if (!account || account.email_confirmed_at || account.deleted_at || account.banned_until) {
      return NextResponse.json({
        success: true,
        message: "If this address still needs verification, a new email will be sent shortly.",
      });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: emailRedirectTo },
    });
    if (linkError || !linkData?.properties?.action_link) {
      console.error("AUTH_RESEND_VERIFICATION_LINK_FAILED", String(linkError?.code || "unknown"));
      return NextResponse.json({ error: "We could not resend the verification email. Please try again." }, { status: 502 });
    }

    const { error: emailError } = await sendAuthVerificationEmail({
      email,
      actionLink: linkData.properties.action_link,
      isResend: true,
    });
    if (emailError) {
      console.error("AUTH_RESEND_VERIFICATION_EMAIL_FAILED", emailError.code || "unknown");
      return NextResponse.json({ error: "We could not resend the verification email. Please try again." }, { status: 502 });
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
