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

/**
 * Send the notification that is shown after an administrator approves a shop.
 * Delivery failures are returned to the caller so the approval itself is not
 * rolled back after the database RPC has already completed.
 */
export async function sendBusinessApprovalEmail({ ownerEmail, ownerName, businessName }) {
  const normalizedOwnerEmail = String(ownerEmail || "").trim().toLowerCase();
  const cleanBusinessName = String(businessName || "").trim();

  if (!cleanBusinessName || !EMAIL_PATTERN.test(normalizedOwnerEmail)) {
    return { sent: false, code: "OWNER_EMAIL_UNAVAILABLE" };
  }

  const safeOwnerName = escapeHtml(ownerName || "Business Owner").slice(0, 120);
  const safeBusinessName = escapeHtml(cleanBusinessName).slice(0, 160);
  const subjectBusinessName = cleanBusinessName.replace(/[\r\n]/g, " ").slice(0, 160);
  const dashboardUrl = getAppUrl("/owner");

  const { data, error } = await sendResendEmail({
    from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
    to: [normalizedOwnerEmail],
    subject: `Your business "${subjectBusinessName}" has been approved!`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Business Approved</title>
      </head>
      <body style="margin:0;padding:0;background-color:#FDFDFD;font-family:'Courier New',Courier,monospace;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDFDFD;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border:4px solid #1A1A1A;box-shadow:10px 10px 0px #00FFFF;">
                <tr>
                  <td style="background:#1A1A1A;padding:24px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <span style="color:#ffffff;font-size:22px;font-weight:900;text-transform:uppercase;font-style:italic;letter-spacing:-1px;">
                            Press <span style="color:#00FFFF;">&amp;</span> Present
                          </span>
                          <br/>
                          <span style="color:#ffffff;font-size:9px;opacity:0.4;text-transform:uppercase;letter-spacing:4px;">
                            Production Grade Portal // 2026
                          </span>
                        </td>
                        <td align="right">
                          <span style="display:inline-block;background:#FFF200;color:#1A1A1A;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:3px;padding:4px 10px;border:2px solid #1A1A1A;">
                            VERIFIED
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
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
                <tr>
                  <td style="padding:40px 32px;">
                    <p style="margin:0 0 6px;font-size:9px;text-transform:uppercase;letter-spacing:4px;color:#EC008C;font-weight:900;">
                      Status_Update
                    </p>
                    <h1 style="margin:0 0 24px;font-size:36px;font-weight:900;text-transform:uppercase;letter-spacing:-2px;line-height:1;color:#1A1A1A;font-style:italic;">
                      You're Approved!
                    </h1>
                    <p style="margin:0 0 20px;font-size:13px;text-transform:uppercase;line-height:1.8;color:#555555;letter-spacing:1px;">
                      Hi ${safeOwnerName},
                    </p>
                    <p style="margin:0 0 20px;font-size:13px;text-transform:uppercase;line-height:1.8;color:#555555;letter-spacing:1px;">
                      Great news! Your shop <strong style="color:#1A1A1A;">[${safeBusinessName}]</strong> has been reviewed and approved by our admin team. Your shop is now unlocked and ready to move forward.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:4px solid #1A1A1A;background:#F9F9F7;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 4px;font-size:9px;text-transform:uppercase;letter-spacing:3px;color:#999;">What_You_Can_Do_Now</p>
                          <ul style="margin:12px 0 0;padding-left:18px;font-size:11px;text-transform:uppercase;line-height:2.2;color:#1A1A1A;letter-spacing:1px;">
                            <li>✅ Set up your shop profile &amp; logo</li>
                            <li>✅ Add your products and services</li>
                            <li>✅ Set your operating hours &amp; location</li>
                            <li>✅ Start receiving customer orders</li>
                            <li>✅ Manage orders through your dashboard</li>
                          </ul>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 28px;font-size:13px;text-transform:uppercase;line-height:1.8;color:#555555;letter-spacing:1px;">
                      Head over to your owner dashboard to get started right away.
                    </p>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:#1A1A1A;border:4px solid #1A1A1A;box-shadow:6px 6px 0 #EC008C;">
                          <a href="${dashboardUrl}"
                             style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:3px;">
                            Open_My_Dashboard →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 32px;border-top:4px solid #1A1A1A;background:#F4F4F1;">
                    <p style="margin:0;font-size:8px;text-transform:uppercase;letter-spacing:2px;color:#999;line-height:2;">
                      © 2026 Press &amp; Present · This is an automated message · Do not reply
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

  if (error) {
    return { sent: false, code: error.code || "EMAIL_SEND_FAILED", status: error.status || null };
  }

  return { sent: true, id: data?.id || null };
}
