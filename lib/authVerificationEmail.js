import { sendResendEmail } from "@/lib/resendEmail";

const DEFAULT_EMAIL_FROM = "Press & Present <noreply@pressandpresent.me>";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

export async function sendAuthVerificationEmail({ email, actionLink, isResend = false }) {
  let verificationUrl;
  try {
    verificationUrl = new URL(actionLink);
    if (!["http:", "https:"].includes(verificationUrl.protocol)) throw new Error("Invalid verification link protocol");
  } catch {
    return { data: null, error: { code: "INVALID_VERIFICATION_LINK", message: "Verification link is invalid." } };
  }

  const safeEmail = escapeHtml(email);
  const safeActionLink = escapeHtml(verificationUrl.toString());
  const subject = isResend
    ? "Your new Press & Present verification link"
    : "Verify your Press & Present account";

  return sendResendEmail({
    from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    to: email,
    subject,
    html: `
      <div style="margin:0;background:#f6f6f2;padding:32px 16px;font-family:Arial,sans-serif;color:#1a1a1a;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d8d6ce;border-radius:18px;padding:32px;">
          <p style="margin:0;color:#ec008c;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Press &amp; Present</p>
          <h1 style="margin:16px 0 10px;font-size:28px;line-height:1.15;">Verify your email</h1>
          <p style="margin:0;color:#676762;font-size:14px;line-height:1.6;">Use the button below to verify <strong>${safeEmail}</strong> and continue to your account.</p>
          <p style="margin:28px 0;"><a href="${safeActionLink}" style="display:inline-block;border-radius:999px;background:#1a1a1a;color:#fff;padding:14px 24px;font-size:13px;font-weight:800;text-decoration:none;">Verify email address</a></p>
          <p style="margin:0;color:#77776f;font-size:12px;line-height:1.6;">If you did not create this account, you can safely ignore this email. The verification link expires automatically.</p>
        </div>
      </div>
    `,
  });
}
