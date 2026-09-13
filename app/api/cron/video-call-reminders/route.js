import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendMeetingReminder } from "@/lib/meetingEmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  const secret = String(process.env.CRON_SECRET || "");
  const authorization = request.headers.get("authorization") || "";
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getSupabaseAdminClient();
    const now = new Date();
    const dueBefore = new Date(now.getTime() + 15 * 60 * 1000);
    const { data: calls, error } = await admin
      .from("video_calls")
      .select("id, conversation_id, business_id, customer_id, owner_id, status, scheduled_at, duration_minutes, booking_timezone, reschedule_count")
      .eq("status", "SCHEDULED")
      .gt("scheduled_at", now.toISOString())
      .lte("scheduled_at", dueBefore.toISOString())
      .order("scheduled_at", { ascending: true })
      .range(0, 99);
    if (error) {
      console.error("VIDEO_CALL_REMINDER_LOOKUP_FAILED", error.message);
      return NextResponse.json({ error: "Meeting reminders are temporarily unavailable." }, { status: 503 });
    }

    const results = [];
    for (const call of calls || []) {
      results.push({ callId: call.id, ...(await sendMeetingReminder({ admin, call, now })) });
    }
    const failed = results.filter((result) => result.ok === false);
    return NextResponse.json({
      success: failed.length === 0,
      checkedAt: now.toISOString(),
      meetings: results.length,
      remindersSent: results.reduce((total, result) => total + Number(result.sent || 0), 0),
      remindersSkipped: results.reduce((total, result) => total + Number(result.skipped || 0), 0),
      failures: failed.length,
    }, { status: failed.length ? 502 : 200 });
  } catch (error) {
    console.error("VIDEO_CALL_REMINDER_CRON_FAILED", error?.message || error);
    return NextResponse.json({ error: "Meeting reminders are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request) {
  return GET(request);
}
