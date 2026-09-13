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
  const recipients = [cleanEmail(customer?.email), cleanEmail(owner?.email)].filter((email, index, list) => EMAIL_PATTERN.test(email) && list.indexOf(email) === index);
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
    : isRescheduleRequest
      ? "Choose a new time for your Press & Present meeting"
      : isRequest
      ? "A Press & Present meeting request needs confirmation"
      : eventType === "RESCHEDULED"
        ? "Your Press & Present meeting was rescheduled"
        : "Your Press & Present meeting is confirmed";
  const actionUrl = new URL(customer ? "/messages" : "/owner/calendar", appUrl);
  if (customer && selectedCall.conversation_id) {
    actionUrl.searchParams.set("business", selectedCall.business_id);
    actionUrl.searchParams.set("conversation", selectedCall.conversation_id);
    actionUrl.searchParams.set("meeting", selectedCall.id);
  }
  const safeBusiness = escapeHtml(business?.name || "your print shop");
  const safeTime = meetingTime ? escapeHtml(formatMeetingDateTime(meetingTime, timeZone)) : "Time to be confirmed";
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
            <p style="line-height:1.6;">${isCancelled ? "The meeting update is below." : "Here is the latest update for your online meeting."}</p>
            <div style="margin:22px 0;padding:18px;background:#f6f6f2;border-left:4px solid #00ffff;">
              <strong>${safeBusiness}</strong><br />
              <span>${safeTime}</span><br />
              <span>${Number(selectedCall.duration_minutes || 30)} minutes · ${escapeHtml(timeZone)}</span>
              ${safeNote}
            </div>
            <a href="${safeActionUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 18px;font-weight:700;">Open meeting details</a>
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

function getParticipantLink(appUrl, participantRole, call) {
  const pathname = participantRole === "CUSTOMER" ? "/messages" : "/owner/calendar";
  const url = new URL(pathname, appUrl);
  if (participantRole === "CUSTOMER") {
    url.searchParams.set("business", call.business_id);
    url.searchParams.set("conversation", call.conversation_id);
  }
  url.searchParams.set("meeting", call.id);
  return url.toString();
}

async function updateReminderEvent(admin, eventKey, patch) {
  await admin.from("video_call_email_events").update({ ...patch, updated_at: new Date().toISOString() }).eq("event_key", eventKey);
}

export async function sendMeetingReminder({ admin, call, now = new Date() }) {
  if (!admin || !call?.id) return { ok: false, code: "INVALID_REMINDER" };

  const { data: currentCall, error: callError } = await admin
    .from("video_calls")
    .select("id, conversation_id, business_id, customer_id, owner_id, status, scheduled_at, duration_minutes, booking_timezone, reschedule_count")
    .eq("id", call.id)
    .maybeSingle();
  if (callError) return { ok: false, code: "REMINDER_CALL_LOOKUP_FAILED" };
  const selectedCall = currentCall || call;
  const scheduledMillis = new Date(selectedCall.scheduled_at || "").getTime();
  const nowMillis = new Date(now || "").getTime();
  if (selectedCall.status !== "SCHEDULED" || !Number.isFinite(scheduledMillis) || !Number.isFinite(nowMillis) || scheduledMillis <= nowMillis || scheduledMillis > nowMillis + 15 * 60 * 1000) {
    return { ok: true, skipped: true, reason: "REMINDER_NOT_DUE" };
  }

  const [{ data: business }, { data: profiles }] = await Promise.all([
    admin.from("businesses").select("id, name, timezone").eq("id", selectedCall.business_id).maybeSingle(),
    admin.from("profiles").select("id, full_name, email").in("id", [selectedCall.customer_id, selectedCall.owner_id].filter(Boolean)),
  ]);
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const customer = profileById.get(selectedCall.customer_id);
  const owner = profileById.get(selectedCall.owner_id);
  const timeZone = selectedCall.booking_timezone || business?.timezone || "Asia/Manila";
  const meetingDateTime = formatMeetingDateTime(selectedCall.scheduled_at, timeZone);
  const shopName = business?.name || "your print shop";
  const customerName = customer?.full_name || "Customer";
  const duration = Number(selectedCall.duration_minutes || 30);
  const appUrl = getConfiguredAppUrl();
  const participants = [
    { role: "CUSTOMER", profile: customer, name: customerName },
    { role: "OWNER", profile: owner, name: owner?.full_name || "Shop owner" },
  ];
  const results = [];
  const version = Number(selectedCall.reschedule_count || 0);

  for (const participant of participants) {
    const eventKey = `${selectedCall.id}:REMINDER_15:${version}:${participant.role}`;
    const { data: claimed, error: claimError } = await admin.rpc("claim_video_call_email", {
      p_event_key: eventKey,
      p_call_id: selectedCall.id,
      p_event_type: "REMINDER_15",
      p_version: version + 1,
    });
    if (claimError) {
      results.push({ role: participant.role, ok: false, code: "REMINDER_CLAIM_FAILED" });
      continue;
    }
    if (claimed !== true) {
      results.push({ role: participant.role, ok: true, skipped: true });
      continue;
    }

    const email = cleanEmail(participant.profile?.email);
    if (!appUrl || !EMAIL_PATTERN.test(email)) {
      await updateReminderEvent(admin, eventKey, { status: "FAILED", last_error: "Reminder recipient or application URL is unavailable." });
      results.push({ role: participant.role, ok: false, code: "REMINDER_DETAILS_UNAVAILABLE" });
      continue;
    }

    const joinUrl = getParticipantLink(appUrl, participant.role, selectedCall);
    const safeJoinUrl = escapeHtml(joinUrl);
    const safeShopName = escapeHtml(shopName);
    const safeCustomerName = escapeHtml(customerName);
    const safeMeetingDateTime = escapeHtml(meetingDateTime);
    const safeTimeZone = escapeHtml(timeZone);
    const greeting = escapeHtml(participant.name);
    const { data, error } = await sendResendEmail({
      from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
      to: email,
      subject: `Your Press & Present meeting starts in 15 minutes`,
      html: `
        <div style="margin:0;background:#f6f6f2;padding:24px 12px;font-family:Arial,sans-serif;color:#1a1a1a;">
          <div style="width:100%;max-width:600px;margin:0 auto;background:#fff;border:1px solid #d8d6ce;">
            <div style="height:6px;background:linear-gradient(90deg,#00ffff 0 25%,#ec008c 25% 50%,#fff200 50% 75%,#1a1a1a 75%);"></div>
            <div style="padding:28px;">
              <p style="margin:0;color:#ec008c;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Press &amp; Present</p>
              <h1 style="margin:12px 0 16px;font-size:26px;line-height:1.2;">Your meeting starts in 15 minutes</h1>
              <p style="margin:0;line-height:1.6;">Hi ${greeting}, this is a friendly reminder that your confirmed online meeting starts in 15 minutes.</p>
              <div style="margin:22px 0;padding:18px;background:#f6f6f2;border-left:4px solid #00aeb5;line-height:1.7;">
                <p style="margin:0 0 8px;"><strong>Shop:</strong> ${safeShopName}</p>
                <p style="margin:0 0 8px;"><strong>Customer:</strong> ${safeCustomerName}</p>
                <p style="margin:0 0 8px;"><strong>Meeting:</strong> ${safeMeetingDateTime}</p>
                <p style="margin:0;"><strong>Timezone:</strong> ${safeTimeZone} · <strong>Duration:</strong> ${duration} minutes</p>
              </div>
              <a href="${safeJoinUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:14px 20px;font-weight:700;">Open secure meeting</a>
              <p style="margin:18px 0 0;color:#555;font-size:12px;line-height:1.6;">Only the confirmed customer and shop owner can join this private meeting. If the button does not open, sign in first and use the meeting link again.</p>
            </div>
          </div>
        </div>
      `,
    });
    if (error) {
      await updateReminderEvent(admin, eventKey, { status: "FAILED", last_error: error.code || "Reminder delivery failed." });
      results.push({ role: participant.role, ok: false, code: error.code || "REMINDER_SEND_FAILED" });
      continue;
    }
    await updateReminderEvent(admin, eventKey, { status: "SENT", sent_at: new Date().toISOString(), last_error: null });
    results.push({ role: participant.role, ok: true, id: data?.id || null });
  }

  const failed = results.filter((result) => result.ok === false);
  return {
    ok: failed.length === 0,
    sent: results.filter((result) => result.ok && !result.skipped).length,
    skipped: results.filter((result) => result.skipped).length,
    failed: failed.length,
  };
}
