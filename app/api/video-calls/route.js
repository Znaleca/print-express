import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { buildMeetingSlots, normalizeMeetingSettings } from "@/lib/meetingScheduling";
import { sendMeetingNotification } from "@/lib/meetingEmail";

export const dynamic = "force-dynamic";

const getBearerToken = (request) => {
  const value = request.headers.get("authorization") || "";
  return value.replace(/^Bearer\s+/i, "").trim();
};

function getUserScopedClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

const RPC_BY_ACTION = {
  request: { name: "video_call_request", args: (body) => ({ p_conversation_id: body.conversationId }) },
  book: { name: "video_call_book", args: (body) => ({ p_conversation_id: body.conversationId, p_scheduled_at: body.scheduledAt, p_customer_note: body.customerNote || null, p_timezone: body.timezone || null }) },
  confirm: { name: "video_call_confirm", args: (body) => ({ p_call_id: body.callId }) },
  schedule: { name: "video_call_schedule", args: (body) => ({ p_call_id: body.callId, p_scheduled_at: body.scheduledAt }) },
  reschedule: { name: "video_call_reschedule", args: (body) => ({ p_call_id: body.callId, p_scheduled_at: body.scheduledAt, p_customer_note: body.customerNote || null, p_confirm: false }) },
  request_reschedule: { name: "video_call_request_reschedule", args: (body) => ({ p_call_id: body.callId }) },
  join: { name: "video_call_join", args: (body) => ({ p_call_id: body.callId }) },
  cancel: { name: "video_call_cancel", args: (body) => ({ p_call_id: body.callId, p_reason: body.reason || null }) },
  end: { name: "video_call_end", args: (body) => ({ p_call_id: body.callId }) },
};

function safeErrorStatus(message) {
  return /only|not|expired|available|choose|scheduled|participant|authorized|invalid|booked|notice|window|hours|reschedule|confirm/i.test(String(message || "")) ? 400 : 500;
}

function safeCall(call) {
  if (!call) return null;
  const { room_name: _roomName, ...publicCall } = call;
  return publicCall;
}

async function authenticate(request) {
  const token = getBearerToken(request);
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = getSupabaseAdminClient();
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await admin.from("profiles").select("id, role").eq("id", userData.user.id).maybeSingle();
  if (!profile) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { admin, user: userData.user, profile, token };
}

async function loadAvailability(auth, searchParams) {
  const businessId = String(searchParams.get("businessId") || "").trim();
  if (!businessId) return { error: NextResponse.json({ error: "A business ID is required." }, { status: 400 }) };
  const { data: business, error: businessError } = await auth.admin
    .from("businesses")
    .select("id, name, owner_id, status, lifecycle_state, timezone, meeting_enabled, meeting_duration_minutes, meeting_buffer_minutes, meeting_min_notice_minutes, meeting_max_days_ahead, meeting_slot_interval_minutes, meeting_requires_approval")
    .eq("id", businessId)
    .maybeSingle();
  if (businessError || !business) return { error: NextResponse.json({ error: "Meeting availability is unavailable." }, { status: 404 }) };

  const conversationId = String(searchParams.get("conversationId") || "").trim();
  const isOwner = business.owner_id === auth.user.id;
  if (!isOwner && auth.profile.role !== "ADMIN") {
    if (auth.profile.role !== "CUSTOMER" || !conversationId) return { error: NextResponse.json({ error: "You are not authorized to view this availability." }, { status: 403 }) };
    const { data: conversation } = await auth.admin.from("chat_conversations").select("id, customer_id, business_id").eq("id", conversationId).maybeSingle();
    if (!conversation || conversation.customer_id !== auth.user.id || conversation.business_id !== businessId) return { error: NextResponse.json({ error: "You are not authorized to view this availability." }, { status: 403 }) };
  }

  const [{ data: hours }, { data: bookedCalls }] = await Promise.all([
    auth.admin.from("business_hours").select("day_of_week, opens_at, closes_at, is_closed").eq("business_id", businessId).order("day_of_week"),
    auth.admin.from("video_calls").select("id, status, requested_slot_at, scheduled_at, duration_minutes, buffer_minutes").eq("business_id", businessId).in("status", ["REQUESTED", "SCHEDULED", "LIVE"]),
  ]);
  const settings = normalizeMeetingSettings(business);
  const timeZone = business.timezone || "Asia/Manila";
  const dates = buildMeetingSlots({ timeZone, hours: hours || [], settings, bookedCalls: bookedCalls || [], excludeCallId: searchParams.get("excludeCallId") || null });
  return {
    data: {
      business: { id: business.id, name: business.name, timezone: timeZone },
      settings,
      hours: hours || [],
      dates,
      hasPublishedHours: Boolean(hours?.length),
    },
  };
}

async function loadOwnerCalendar(auth) {
  if (auth.profile.role !== "BUSINESS_OWNER" && auth.profile.role !== "ADMIN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  let businessQuery = auth.admin.from("businesses").select("id, name, owner_id, status, lifecycle_state, timezone, meeting_enabled, meeting_duration_minutes, meeting_buffer_minutes, meeting_min_notice_minutes, meeting_max_days_ahead, meeting_slot_interval_minutes, meeting_requires_approval").order("created_at", { ascending: false });
  if (auth.profile.role === "BUSINESS_OWNER") businessQuery = businessQuery.eq("owner_id", auth.user.id);
  const { data: businesses, error } = await businessQuery;
  if (error) return { error: NextResponse.json({ error: "Calendar data is unavailable." }, { status: 503 }) };
  const businessIds = (businesses || []).map((business) => business.id);
  if (!businessIds.length) return { data: { businesses: [], calls: [] } };
  const { data: calls, error: callError } = await auth.admin
    .from("video_calls")
    .select("id, conversation_id, business_id, customer_id, owner_id, status, created_at, updated_at, requested_slot_at, scheduled_at, available_from_at, expires_at, duration_minutes, buffer_minutes, customer_note, booking_timezone, reschedule_count, cancellation_reason")
    .in("business_id", businessIds)
    .order("requested_slot_at", { ascending: true, nullsFirst: false });
  if (callError) return { error: NextResponse.json({ error: "Calendar data is unavailable." }, { status: 503 }) };
  const customerIds = [...new Set((calls || []).map((call) => call.customer_id).filter(Boolean))];
  const [{ data: profiles }, { data: hours }] = await Promise.all([
    customerIds.length ? auth.admin.from("profiles").select("id, full_name, email, avatar_url").in("id", customerIds) : Promise.resolve({ data: [] }),
    auth.admin.from("business_hours").select("business_id, day_of_week, opens_at, closes_at, is_closed").in("business_id", businessIds).order("day_of_week"),
  ]);
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const businessById = new Map((businesses || []).map((business) => [business.id, business]));
  const hoursByBusinessId = new Map();
  for (const hour of hours || []) hoursByBusinessId.set(hour.business_id, [...(hoursByBusinessId.get(hour.business_id) || []), hour]);
  return {
    data: {
      businesses: (businesses || []).map((business) => ({ ...business, settings: normalizeMeetingSettings(business), hours: hoursByBusinessId.get(business.id) || [] })),
      calls: (calls || []).map((call) => ({
        ...safeCall(call),
        business_name: businessById.get(call.business_id)?.name || "Print shop",
        timezone: call.booking_timezone || businessById.get(call.business_id)?.timezone || "Asia/Manila",
        customer: profileById.get(call.customer_id) || { full_name: "Customer" },
      })),
    },
  };
}

export async function GET(request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    const searchParams = new URL(request.url).searchParams;
    const view = searchParams.get("view") || "availability";
    const result = view === "owner" ? await loadOwnerCalendar(auth) : await loadAvailability(auth, searchParams);
    if (result.error) return result.error;
    return NextResponse.json(result.data);
  } catch {
    console.error("VIDEO_CALL_GET_UNAVAILABLE");
    return NextResponse.json({ error: "Meeting data is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const rpc = RPC_BY_ACTION[action];
    if (!rpc) return NextResponse.json({ error: "Unsupported video call action." }, { status: 400 });
    if (["request", "book"].includes(action) && !body.conversationId) return NextResponse.json({ error: "A conversation ID is required." }, { status: 400 });
    if (!["request", "book"].includes(action) && !body.callId) return NextResponse.json({ error: "A video call ID is required." }, { status: 400 });
    if (["book", "schedule", "reschedule"].includes(action)) {
      const scheduledAt = new Date(body.scheduledAt || "");
      if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Choose a valid meeting time." }, { status: 400 });
      if (body.customerNote && String(body.customerNote).length > 500) return NextResponse.json({ error: "Meeting notes must be 500 characters or fewer." }, { status: 400 });
    }

    const userClient = getUserScopedClient(auth.token);
    const { data, error } = await userClient.rpc(rpc.name, rpc.args(body));
    if (error) return NextResponse.json({ error: String(error.message || "Unable to update the meeting.").replace(/^.*DETAIL:\s*/i, "").slice(0, 240) }, { status: safeErrorStatus(error.message) });
    const call = Array.isArray(data) ? data[0] : data;
    let notification = null;
    const notificationType = { book: "BOOKED", confirm: "CONFIRMED", schedule: "CONFIRMED", reschedule: "RESCHEDULED", request_reschedule: "RESCHEDULE_REQUESTED", cancel: "CANCELLED" }[action];
    if (call && notificationType) notification = await sendMeetingNotification({ admin: auth.admin, call, eventType: notificationType });
    return NextResponse.json({ success: true, call: call || null, warning: notification?.ok === false ? "The meeting was saved, but email notification could not be sent." : null });
  } catch {
    console.error("VIDEO_CALL_API_ERROR");
    return NextResponse.json({ error: "Unable to process the video call request." }, { status: 500 });
  }
}
