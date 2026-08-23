import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendResendEmail } from "@/lib/resendEmail";
import {
  getRequestDevice,
  getRequestIp,
  hashOtp,
  hashRateLimitScope,
} from "@/lib/otpSecurity";

const GENERIC_OTP_RESPONSE = {
  success: true,
  message: "If the address is eligible, a verification code has been sent.",
};

function genericResponse(status = 200) {
  return NextResponse.json(GENERIC_OTP_RESPONSE, { status });
}

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
    const supabase = getSupabaseAdminClient();

    const { email, type, fullName } = await request.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedType = String(type || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!["signup", "reset"].includes(normalizedType)) {
      return NextResponse.json({ error: "Missing email or type" }, { status: 400 });
    }

    // Rate-limit before the account lookup so the endpoint cannot be used to
    // probe whether an email belongs to an account. All scopes are hashed.
    const requestIp = getRequestIp(request);
    const requestDevice = getRequestDevice(request);
    const rateLimits = [
      ["global", 100],
      [`ip:${requestIp}`, 10],
      [`device:${requestDevice}`, 5],
      [`email:${normalizedEmail}`, 3],
    ];

    for (const [scope, limit] of rateLimits) {
      if (!(await consumeRateLimit(supabase, `${normalizedType}:${scope}`, limit, 15 * 60))) {
        return genericResponse(429);
      }
    }

    const { data: existingUserId, error: lookupError } = await supabase.rpc(
      "get_user_id_by_email",
      { lookup_email: normalizedEmail }
    );
    if (lookupError) {
      console.error("OTP account lookup error:", lookupError);
      return genericResponse(503);
    }

    // Do not disclose whether an address is registered. The UI will continue
    // to the code screen and verification will return the same generic result.
    if ((normalizedType === "signup" && existingUserId) || (normalizedType === "reset" && !existingUserId)) {
      return genericResponse();
    }

    // 1. Generate 6-digit code
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 mins from now

    // 2. Delete any existing codes for this email and type
    await supabase
      .from("otp_verifications")
      .delete()
      .eq("email", normalizedEmail)
      .eq("type", normalizedType);

    // 3. Save new code
    const { data: savedOtp, error: dbError } = await supabase
      .from("otp_verifications")
      .insert({
        email: normalizedEmail,
        otp_hash: hashOtp({ email: normalizedEmail, type: normalizedType, code: otpCode }),
        attempt_count: 0,
        max_attempts: 5,
        request_ip_hash: hashRateLimitScope(requestIp),
        request_device_hash: hashRateLimitScope(requestDevice),
        type: normalizedType,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("Database error saving OTP:", dbError);
      return NextResponse.json({ error: "Failed to generate code." }, { status: 500 });
    }

    // 4. Send Email via Resend
    const subject = normalizedType === "signup" ? "Your Verification Code" : "Password Reset Code";
    const headerTitle = normalizedType === "signup" ? "Verify_Account" : "Reset_Password";
    const title = normalizedType === "signup" ? "Welcome aboard!" : "Reset your password";
    const actionText = normalizedType === "signup"
      ? "Use the code below to verify your email address and complete your registration." 
      : "Use the code below to securely reset your password.";
    const safeFullName = String(fullName || "").trim().slice(0, 120).replace(/[&<>\"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '\"': "&quot;",
      "'": "&#39;",
    }[character]));

    const { error: emailError } = await sendResendEmail({
      from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
      to: [normalizedEmail],
      subject: `[Press & Present] ${subject}: ${otpCode}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${subject}</title>
        </head>
        <body style="margin:0;padding:0;background-color:#FDFDFD;font-family:'Courier New',Courier,monospace;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDFDFD;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border:4px solid #1A1A1A;box-shadow:10px 10px 0px #00FFFF;">
                  <!-- Header -->
                  <tr>
                    <td style="background:#1A1A1A;padding:24px 32px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td>
                            <span style="color:#ffffff;font-size:22px;font-weight:900;text-transform:uppercase;font-style:italic;letter-spacing:-1px;">
                              Press <span style="color:#00FFFF;">&</span> Present
                            </span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- CMYK Strip -->
                  <tr>
                    <td>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td width="25%" style="background:#00FFFF;height:6px;"></td>
                          <td width="25%" style="background:#EC008C;height:6px;"></td>
                          <td width="25%" style="background:#FFF200;height:6px;"></td>
                          <td width="25%" style="background:#1A1A1A;height:6px;"></td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:40px 32px;">
                      <p style="margin:0 0 6px;font-size:9px;text-transform:uppercase;letter-spacing:4px;color:#EC008C;font-weight:900;">
                        ${headerTitle}
                      </p>
                      <h1 style="margin:0 0 24px;font-size:32px;font-weight:900;text-transform:uppercase;letter-spacing:-2px;line-height:1;color:#1A1A1A;font-style:italic;">
                        ${title}
                      </h1>
                      ${safeFullName ? `<p style="margin:0 0 20px;font-size:13px;text-transform:uppercase;line-height:1.8;color:#555555;letter-spacing:1px;">Hi ${safeFullName},</p>` : ''}
                      <p style="margin:0 0 28px;font-size:13px;text-transform:uppercase;line-height:1.8;color:#555555;letter-spacing:1px;">
                        ${actionText}
                      </p>
                      
                      <!-- Code Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:4px solid #1A1A1A;background:#FFF200;">
                        <tr>
                          <td align="center" style="padding:24px;">
                            <span style="font-size:36px;font-weight:900;letter-spacing:8px;color:#1A1A1A;">
                              ${otpCode}
                            </span>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0;font-size:11px;text-transform:uppercase;line-height:1.8;color:#999999;letter-spacing:1px;">
                        This code will expire in 10 minutes. If you did not request this, please ignore this email.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:20px 32px;border-top:4px solid #1A1A1A;background:#F4F4F1;">
                      <p style="margin:0;font-size:8px;text-transform:uppercase;letter-spacing:2px;color:#999;line-height:2;">
                        © 2026 Press &amp; Present · Automated security system
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      if (savedOtp?.id) {
        await supabase.from("otp_verifications").delete().eq("id", savedOtp.id);
      }
      return NextResponse.json({ error: "We could not send the verification code. Please try again." }, { status: 502 });
    }

    return NextResponse.json(GENERIC_OTP_RESPONSE);
  } catch (err) {
    console.error("Send OTP API error:", err);
    return NextResponse.json({ error: "We could not start verification. Please try again." }, { status: 503 });
  }
}
