import { NextResponse } from "next/server";
import { sendBusinessApprovalEmail } from "@/lib/businessApprovalEmail";
import { requireAdmin } from "@/lib/serverAuth";

export async function POST(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { ownerEmail, ownerName, businessName } = await request.json();
    const normalizedOwnerEmail = String(ownerEmail || "").trim().toLowerCase();
    const cleanBusinessName = String(businessName || "").trim();

    if (!cleanBusinessName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedOwnerEmail)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const notification = await sendBusinessApprovalEmail({
      ownerEmail: normalizedOwnerEmail,
      ownerName,
      businessName: cleanBusinessName,
    });

    if (!notification.sent) {
      console.error("ADMIN_APPROVAL_EMAIL_SEND_FAILED", notification.code || "EMAIL_SEND_FAILED");
      return NextResponse.json({
        error: notification.code === "RESEND_RATE_LIMITED"
          ? "Email service rate limit reached. Please try again shortly."
          : "The approval was completed, but the email could not be sent. Please try again.",
      }, { status: notification.status === 429 ? 429 : 502 });
    }

    return NextResponse.json({ success: true, id: notification.id });
  } catch {
    console.error("ADMIN_APPROVAL_EMAIL_UNAVAILABLE");
    return NextResponse.json({ error: "The approval was completed, but the email could not be sent. Please try again." }, { status: 503 });
  }
}
