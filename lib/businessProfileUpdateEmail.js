import { getAppUrl } from "@/lib/appUrl";
import { sendResendEmail } from "@/lib/resendEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value || "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '\"': "&quot;",
    "'": "&#39;",
  }[character]));
}

export async function sendBusinessProfileUpdatedEmail({ ownerEmail, ownerName, businessName, changedFields = [] }) {
  const normalizedEmail = String(ownerEmail || "").trim().toLowerCase();
  const cleanBusinessName = String(businessName || "").trim();
  if (!EMAIL_PATTERN.test(normalizedEmail) || !cleanBusinessName) {
    return { sent: false, code: "OWNER_EMAIL_UNAVAILABLE" };
  }

  const safeOwnerName = escapeHtml(ownerName || "Business Owner").slice(0, 120);
  const safeBusinessName = escapeHtml(cleanBusinessName).slice(0, 160);
  const subjectBusinessName = cleanBusinessName.replace(/[\r\n]/g, " ").slice(0, 160);
  const safeFields = changedFields
    .map((field) => escapeHtml(field).slice(0, 80))
    .filter(Boolean);
  const fieldsHtml = safeFields.length > 0
    ? `<ul style="margin:12px 0 0;padding-left:18px;line-height:2;color:#1A1A1A;">${safeFields.map((field) => `<li>${field}</li>`).join("")}</ul>`
    : "";

  const { data, error } = await sendResendEmail({
    from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
    to: [normalizedEmail],
    subject: `Your ${subjectBusinessName} profile has been updated`,
    html: `<!DOCTYPE html>
      <html lang="en">
      <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Business profile updated</title></head>
      <body style="margin:0;padding:0;background:#F6F6F2;font-family:Arial,sans-serif;color:#1A1A1A;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F6F6F2;"><tr><td align="center">
          <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border:3px solid #1A1A1A;">
            <tr><td style="height:6px;background:linear-gradient(90deg,#00C7C7 0 33%,#EC008C 33% 66%,#FFF200 66%);"></td></tr>
            <tr><td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#009FA0;">Profile update complete</p>
              <h1 style="margin:0 0 20px;font-size:28px;line-height:1.1;">Your shop profile was updated</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.7;">Hi ${safeOwnerName},</p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.7;">An administrator accepted and applied your requested changes for <strong>${safeBusinessName}</strong>. The updated information is now visible on your shop profile.</p>
              ${fieldsHtml}
              <table cellpadding="0" cellspacing="0" style="margin-top:26px;"><tr><td style="background:#1A1A1A;"><a href="${getAppUrl("/owner/documents")}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:12px;font-weight:800;">View updated profile →</a></td></tr></table>
            </td></tr>
            <tr><td style="padding:18px 32px;border-top:1px solid #E5E5E0;font-size:10px;color:#777777;">Press &amp; Present · Automated notification</td></tr>
          </table>
        </td></tr></table>
      </body></html>`,
  });

  if (error) return { sent: false, code: error.code || "EMAIL_SEND_FAILED", status: error.status || null };
  return { sent: true, id: data?.id || null };
}
