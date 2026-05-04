import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { ownerEmail, ownerName, businessName } = await request.json();

    if (!ownerEmail || !businessName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
      to: [ownerEmail],
      subject: `🎉 Your business "${businessName}" has been approved!`,
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
                  
                  <!-- Header -->
                  <tr>
                    <td style="background:#1A1A1A;padding:24px 32px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td>
                            <span style="color:#ffffff;font-size:22px;font-weight:900;text-transform:uppercase;font-style:italic;letter-spacing:-1px;">
                              Press <span style="color:#00FFFF;">&</span> Present
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
                        Status_Update
                      </p>
                      <h1 style="margin:0 0 24px;font-size:36px;font-weight:900;text-transform:uppercase;letter-spacing:-2px;line-height:1;color:#1A1A1A;font-style:italic;">
                        You're Approved!
                      </h1>
                      <p style="margin:0 0 20px;font-size:13px;text-transform:uppercase;line-height:1.8;color:#555555;letter-spacing:1px;">
                        Hi ${ownerName || "Business Owner"},
                      </p>
                      <p style="margin:0 0 20px;font-size:13px;text-transform:uppercase;line-height:1.8;color:#555555;letter-spacing:1px;">
                        Great news! All verification documents for <strong style="color:#1A1A1A;">[${businessName}]</strong> have been reviewed and approved by our admin team.
                      </p>
                      
                      <!-- Approval Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:4px solid #1A1A1A;background:#F9F9F7;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 4px;font-size:9px;text-transform:uppercase;letter-spacing:3px;color:#999;">What_You_Can_Do_Now</p>
                            <ul style="margin:12px 0 0;padding-left:18px;font-size:11px;text-transform:uppercase;line-height:2.2;color:#1A1A1A;letter-spacing:1px;">
                              <li>✅ Set up your shop profile & logo</li>
                              <li>✅ Add your products and services</li>
                              <li>✅ Set your operating hours & location</li>
                              <li>✅ Start receiving customer orders</li>
                              <li>✅ Manage orders through your dashboard</li>
                            </ul>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0 0 28px;font-size:13px;text-transform:uppercase;line-height:1.8;color:#555555;letter-spacing:1px;">
                        Head over to your owner dashboard to get started right away.
                      </p>

                      <!-- CTA Button -->
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="background:#1A1A1A;border:4px solid #1A1A1A;box-shadow:6px 6px 0 #EC008C;">
                            <a href="${process.env.NEXT_PUBLIC_URL || "https://pressandpresent.vercel.app"}/owner" 
                               style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:3px;">
                              Open_My_Dashboard →
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Footer -->
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
      console.error("Resend error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    console.error("Email API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
