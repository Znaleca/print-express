import { formatMeetingDateTime } from "@/lib/meetingScheduling";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { sendResendEmail } from "@/lib/resendEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value) => String(value || "").replace(/[&<>\"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '\"': "&quot;",
  "'": "&#39;",
}[character]));

const cleanEmail = (value) => String(value || "").trim().toLowerCase();

export async function sendMeetingNotification({ admin, call, eventType }) {
  if (!admin || !call?.id || !eventType) return { ok: false, code: "INVALID_NOTIFICATION" };

  const eventKey = `${call.id}:${eventType}:${Number(call.reschedule_count || 0)}`;
  const { data: claimed, error: claimError } = await admin.rpc("claim_video_call_email", {
    p_event_key: eventKey,
    p_call_id: call.id,
    p_event_type: eventType,
    p_version: Number(call.reschedule_count || 0) + 1,
  });
  if (claimError) return { ok: false, code: "NOTIFICATION_CLAIM_FAILED" };
  if (claimed !== true) return { ok: true, skipped: true };

  const { data: currentCall, error: callError } = await admin
    .from("video_calls")
    .select("id, conversation_id, business_id, customer_id, owner_id, status, requested_slot_at, scheduled_at, rescheduled_from_at, duration_minutes, booking_timezone, customer_note, reschedule_count")
    .eq("id", call.id)
    .maybeSingle();
  const { data: business } = await admin.from("businesses").select("name").eq("id", call.business_id).maybeSingle();
  const participantIds = [currentCall?.customer_id || call.customer_id, currentCall?.owner_id || call.owner_id].filter(Boolean);
  const { data: profiles } = participantIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", participantIds)
    : { data: [] };
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const customer = profileById.get(currentCall?.customer_id || call.customer_id);
  const owner = profileById.get(currentCall?.owner_id || call.owner_id);
  const isSchedulingInvite = eventType === "SCHEDULING_INVITE";
  const recipients = (isSchedulingInvite
    ? [cleanEmail(customer?.email)]
    : [cleanEmail(customer?.email), cleanEmail(owner?.email)])
    .filter((email, index, list) => EMAIL_PATTERN.test(email) && list.indexOf(email) === index);
  const selectedCall = currentCall || call;
  const timeZone = selectedCall.booking_timezone || "Asia/Manila";
  const meetingTime = selectedCall.scheduled_at || selectedCall.requested_slot_at || selectedCall.rescheduled_from_at;
  const appUrl = getConfiguredAppUrl();

  if (callError || !recipients.length || !appUrl) {
    await admin.from("video_call_email_events").update({ status: "FAILED", last_error: "Notification details are unavailable.", updated_at: new Date().toISOString() }).eq("event_key", eventKey);
    return { ok: false, code: "NOTIFICATION_DETAILS_UNAVAILABLE" };
  }

  const isCancelled = eventType === "CANCELLED";
  const isRescheduleRequest = eventType === "RESCHEDULE_REQUESTED";
  const isRequest = eventType === "BOOKED" && selectedCall.status === "REQUESTED";
  const title = isCancelled
    ? "Your Press & Present meeting was cancelled"
    : isSchedulingInvite
      ? `${business?.name || "A print shop"} invited you to choose a meeting time`
    : isRescheduleRequest
      ? "Choose a new time for your Press & Present meeting"
      : isRequest
      ? "A Press & Present meeting request needs confirmation"
      : eventType === "RESCHEDULED"
        ? "Your Press & Present meeting was rescheduled"
        : "Your Press & Present meeting is confirmed";
  const canJoinDirectly = ["SCHEDULED", "LIVE"].includes(selectedCall.status);
  const hasDirectMeetingLink = Boolean(meetingTime) && !isCancelled && !isRescheduleRequest && !isSchedulingInvite;
  const actionUrl = isSchedulingInvite
    ? new URL(`/messages?business=${encodeURIComponent(selectedCall.business_id)}&conversation=${encodeURIComponent(selectedCall.conversation_id)}&schedule=1`, appUrl)
    : hasDirectMeetingLink
    ? new URL(`/meeting/${encodeURIComponent(selectedCall.id)}`, appUrl)
    : new URL(customer ? "/messages" : "/owner/calendar", appUrl);
  const actionLabel = isSchedulingInvite ? "Choose a meeting time" : canJoinDirectly ? "Open secure meeting" : hasDirectMeetingLink ? "View meeting request" : "Open meeting details";
  const safeBusiness = escapeHtml(business?.name || "your print shop");
  const safeTime = meetingTime ? escapeHtml(formatMeetingDateTime(meetingTime, timeZone)) : "Time to be confirmed";
  const previousTime = eventType === "RESCHEDULED" ? selectedCall.rescheduled_from_at : null;
  const safePreviousTime = previousTime ? escapeHtml(formatMeetingDateTime(previousTime, timeZone)) : "";
  const timeDetails = isSchedulingInvite
    ? "<strong>Choose any open day and time from the shop&apos;s calendar.</strong>"
    : eventType === "RESCHEDULED"
    ? `${safePreviousTime ? `<span style="color:#666;text-decoration:line-through;">Previous: ${safePreviousTime}</span><br />` : ""}<strong style="color:#1a1a1a;">New time: ${safeTime}</strong>`
    : `<span>${safeTime}</span>`;
  const safeActionUrl = escapeHtml(actionUrl.toString());
  const safeNote = selectedCall.customer_note ? `<p style="margin:16px 0 0;color:#555;">Note: ${escapeHtml(selectedCall.customer_note)}</p>` : "";

  const { data, error } = await sendResendEmail({
    from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
    to: recipients,
    subject: title,
    html: `
      <div style="background:#f6f6f2;padding:32px;font-family:Arial,sans-serif;color:#1a1a1a;">
        <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #d8d6ce;">
          <div style="height:6px;background:linear-gradient(90deg,#00ffff 0 25%,#ec008c 25% 50%,#fff200 50% 75%,#1a1a1a 75%);"></div>
          <div style="padding:28px;">
            <p style="margin:0;color:#ec008c;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Press &amp; Present</p>
            <h1 style="font-size:28px;margin:12px 0 18px;">${escapeHtml(title)}</h1>
            <p style="line-height:1.6;">${isSchedulingInvite ? "The shop has invited you to schedule an online meeting." : isCancelled ? "The meeting update is below." : "Here is the latest update for your online meeting."}</p>
            <div style="margin:22px 0;padding:18px;background:#f6f6f2;border-left:4px solid #00ffff;">
              <strong>${safeBusiness}</strong><br />
              ${timeDetails}<br />
              <span>${Number(selectedCall.duration_minutes || 30)} minutes · ${escapeHtml(timeZone)}</span>
              ${safeNote}
            </div>
            <a href="${safeActionUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 18px;font-weight:700;">${actionLabel}</a>
            ${hasDirectMeetingLink ? '<p style="margin:14px 0 0;color:#555;font-size:12px;line-height:1.6;">This private link is for the invited customer and shop owner. It shows the time remaining and opens the secure call 15 minutes before the scheduled time.</p>' : ""}
          </div>
        </div>
      </div>
    `,
  });

  if (error) {
    await admin.from("video_call_email_events").update({ status: "FAILED", last_error: error.code || "Email delivery failed.", updated_at: new Date().toISOString() }).eq("event_key", eventKey);
    return { ok: false, code: error.code || "NOTIFICATION_SEND_FAILED" };
  }
  await admin.from("video_call_email_events").update({ status: "SENT", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null }).eq("event_key", eventKey);
  return { ok: true, id: data?.id || null };
}
