import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendResendEmail } from "@/lib/resendEmail";

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

    // 0. Check if user exists
    const { data: existingUserId } = await supabase.rpc("get_user_id_by_email", { lookup_email: normalizedEmail });
    
    if (normalizedType === "signup" && existingUserId) {
      return NextResponse.json({ error: "This email is already taken." }, { status: 400 });
    }
    if (normalizedType === "reset" && !existingUserId) {
      return NextResponse.json({ error: "No account found with this email." }, { status: 404 });
    }

    // Keep OTP requests bounded on the free tier and prevent mailbox abuse.
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: recentCodes } = await supabase
      .from("otp_verifications")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("type", normalizedType)
      .gte("created_at", oneMinuteAgo)
      .limit(1);
    if (recentCodes?.length) {
      return NextResponse.json({ error: "Please wait a minute before requesting another code." }, { status: 429 });
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
    const { error: dbError } = await supabase
      .from("otp_verifications")
      .insert({
        email: normalizedEmail,
        otp_code: otpCode,
        type: normalizedType,
        expires_at: expiresAt,
      });

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
      return NextResponse.json({ error: emailError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Code sent successfully" });
  } catch (err) {
    console.error("Send OTP API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
