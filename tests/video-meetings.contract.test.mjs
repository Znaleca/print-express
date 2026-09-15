import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("meeting scheduling keeps timezone, notice, duration, and overlap rules in one helper", () => {
  const helper = source("lib/meetingScheduling.js");
  assert.match(helper, /DEFAULT_MEETING_SETTINGS/);
  assert.match(helper, /zonedDateTimeToUtc/);
  assert.match(helper, /meeting_min_notice_minutes/);
  assert.match(helper, /meeting_max_days_ahead/);
  assert.match(helper, /busyIntervals/);
  assert.match(helper, /REQUESTED.*SCHEDULED.*LIVE/s);
  assert.match(helper, /MINIMUM_MEETING_NOTICE_MINUTES = 5/);
  assert.match(helper, /isMeetingStartBookable/);
});

test("meeting booking uses a customizable 20-minute default notice", async () => {
  const { isMeetingStartBookable } = await import("../lib/meetingScheduling.js");
  const now = "2026-09-13T01:00:00.000Z";
  assert.equal(isMeetingStartBookable("2026-09-13T01:20:00.000Z", { now, minimumNoticeMinutes: 20 }), true);
  assert.equal(isMeetingStartBookable("2026-09-13T01:35:00.000Z", { now }), true);
  assert.equal(isMeetingStartBookable("2026-09-13T01:19:59.000Z", { now, minimumNoticeMinutes: 20 }), false);
  assert.equal(isMeetingStartBookable("2026-09-13T01:35:00.000Z", { now, minimumNoticeMinutes: 60 }), false);
});

test("date overrides can block a day or publish custom minute-based slots", async () => {
  const { buildMeetingSlots } = await import("../lib/meetingScheduling.js");
  const settings = {
    meeting_enabled: true,
    meeting_duration_minutes: 30,
    meeting_buffer_minutes: 0,
    meeting_min_notice_minutes: 20,
    meeting_max_days_ahead: 3,
    meeting_slot_interval_minutes: 10,
  };
  const hours = [
    { day_of_week: 1, opens_at: "09:00:00", closes_at: "17:00:00", is_closed: false },
    { day_of_week: 2, opens_at: "09:00:00", closes_at: "17:00:00", is_closed: false },
  ];
  const dateOverrides = [
    { available_date: "2026-09-14", is_available: true, opens_at: "14:20:00", closes_at: "16:30:00" },
    { available_date: "2026-09-15", is_available: false, opens_at: null, closes_at: null },
  ];

  const dates = buildMeetingSlots({ timeZone: "Asia/Manila", hours, dateOverrides, settings, now: new Date("2026-09-13T23:00:00.000Z") });
  const customMonday = dates.find((date) => date.dateKey === "2026-09-14");
  assert.equal(customMonday.slots[0].time, "14:20");
  assert.equal(customMonday.slots.at(-1).time, "16:00");
  assert.equal(dates.some((date) => date.dateKey === "2026-09-15"), false);
});

test("an active booking removes its occupied time and buffer from public availability", async () => {
  const { buildMeetingSlots } = await import("../lib/meetingScheduling.js");
  const settings = {
    meeting_enabled: true,
    meeting_duration_minutes: 30,
    meeting_buffer_minutes: 15,
    meeting_min_notice_minutes: 30,
    meeting_max_days_ahead: 2,
    meeting_slot_interval_minutes: 30,
  };
  const hours = [{ day_of_week: 1, opens_at: "09:00:00", closes_at: "17:00:00", is_closed: false }];
  const bookedCalls = [{
    id: "reserved-call",
    status: "SCHEDULED",
    scheduled_at: "2026-09-14T04:00:00.000Z",
    duration_minutes: 30,
    buffer_minutes: 15,
  }];

  const dates = buildMeetingSlots({ timeZone: "Asia/Manila", hours, settings, bookedCalls, now: new Date("2026-09-13T23:00:00.000Z") });
  const monday = dates.find((date) => date.dateKey === "2026-09-14");
  assert.equal(monday.slots.length, 13);
  assert.deepEqual(monday.slots.map((slot) => slot.time).filter((time) => ["11:30", "12:00", "12:30"].includes(time)), []);

  const visibleBlockedDates = buildMeetingSlots({ timeZone: "Asia/Manila", hours, settings, bookedCalls, includeBlockedSlots: true, now: new Date("2026-09-13T23:00:00.000Z") });
  const visibleBlockedMonday = visibleBlockedDates.find((date) => date.dateKey === "2026-09-14");
  assert.equal(visibleBlockedMonday.slots.length, 16);
  assert.deepEqual(visibleBlockedMonday.slots.filter((slot) => slot.available === false).map((slot) => slot.time), ["11:30", "12:00", "12:30"]);
});

test("meeting countdown uses readable minute, hour, and day labels", async () => {
  const { findUpcomingMeetingWithin, formatMeetingCountdown } = await import("../lib/meetingScheduling.js");
  const now = "2026-09-14T01:00:00.000Z";
  const calls = [
    { id: "later", status: "SCHEDULED", scheduled_at: "2026-09-14T01:45:00.000Z" },
    { id: "nearest", status: "SCHEDULED", scheduled_at: "2026-09-14T01:01:00.000Z" },
    { id: "ended", status: "ENDED", scheduled_at: "2026-09-14T01:00:30.000Z" },
  ];
  assert.equal(formatMeetingCountdown("2026-09-14T04:00:00.000Z", now), "3 hours");
  assert.equal(formatMeetingCountdown("2026-09-14T04:15:00.000Z", now), "3 hours, 15 minutes");
  assert.equal(formatMeetingCountdown("2026-09-15T03:00:00.000Z", now), "1 day, 2 hours");
  assert.equal(findUpcomingMeetingWithin(calls, { now, withinMinutes: 60 })?.id, "nearest");
  assert.equal(findUpcomingMeetingWithin(calls, { now, withinMinutes: 0 }), null);
});

test("owner call-now checks the next hour and warns with the exact meeting countdown", () => {
  const ownerMessages = source("app/owner/messages/page.jsx");
  assert.match(ownerMessages, /videoCallQuery\(\{ view: "owner" \}\)/);
  assert.match(ownerMessages, /findUpcomingMeetingWithin\(ownerCalendar\.calls \|\| \[\], \{ now, withinMinutes: 60 \}\)/);
  assert.match(ownerMessages, /formatMeetingCountdown\(upcomingMeeting\.scheduled_at, now\)/);
  assert.match(ownerMessages, /You have a scheduled meeting with/);
  assert.match(ownerMessages, /Are you sure you want to call now\?/);
});

test("database booking is transactional and prevents duplicate business slots", () => {
  const migration = source("supabase/migrations/20260913200000_calendly_style_video_meetings.sql");
  assert.match(migration, /create extension if not exists btree_gist/i);
  assert.match(migration, /exclude using gist/i);
  assert.match(migration, /video_call_book/);
  assert.match(migration, /video_call_reschedule/);
  assert.match(migration, /video_call_confirm/);
  assert.match(migration, /for update/);
  assert.match(migration, /meeting_requires_approval/);
  assert.match(migration, /requested_slot_at/);
  assert.match(migration, /revoke all on function public.video_call_book/);
});

test("customer booking migration converts an empty request into a reserved meeting", () => {
  const migration = source("supabase/migrations/20260914110000_fix_customer_meeting_booking.sql");
  assert.match(migration, /create or replace function public\.video_call_book/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /perform public\.validate_video_call_slot/i);
  assert.match(migration, /status = next_status/i);
  assert.match(migration, /scheduled_at = case when next_status = 'SCHEDULED'/i);
  assert.match(migration, /available_from_at = case when next_status = 'SCHEDULED'/i);
  assert.match(migration, /already have an active meeting\. Reschedule it instead/i);
});

test("customer selection directly schedules an owner-published open slot", () => {
  const migration = source("supabase/migrations/20260915160000_customer_direct_meeting_booking.sql");
  const route = source("app/api/video-calls/route.js");
  const modal = source("components/MeetingBookingModal.jsx");
  const customer = source("app/messages/page.jsx");
  const ownerCalendar = source("app/owner/calendar/page.jsx");

  assert.match(migration, /set meeting_requires_approval = false/i);
  assert.match(migration, /create or replace function public\.video_call_book/i);
  assert.match(migration, /status = 'SCHEDULED'/i);
  assert.match(migration, /confirmation_required_by = null/i);
  assert.match(migration, /perform public\.validate_video_call_slot/i);
  assert.match(migration, /status in \('SCHEDULED', 'LIVE'\)[\s\S]*expires_at < now\(\)/i);
  assert.doesNotMatch(migration, /next_status := case when business_row\.meeting_requires_approval/i);
  assert.match(route, /book: "BOOKED"/);
  assert.match(modal, /This open time will be booked immediately/);
  assert.match(modal, /You and the shop will both receive an email/);
  assert.doesNotMatch(ownerCalendar, /Require owner confirmation/);
  assert.match(ownerCalendar, /Customer choices book immediately/i);
  assert.match(customer, /meetingButtonLabel/);
  assert.match(customer, /Meeting scheduled/);
  assert.match(customer, /getVideoCallWindow\(call\)\.expired/);
});

test("flexible availability is enforced in both the API and database", () => {
  const migration = source("supabase/migrations/20260915170000_flexible_meeting_availability.sql");
  const route = source("app/api/video-calls/route.js");

  assert.match(migration, /create table if not exists public\.business_meeting_date_overrides/i);
  assert.match(migration, /meeting_min_notice_minutes between 5 and 10080/i);
  assert.match(migration, /meeting_slot_interval_minutes between 5 and 120/i);
  assert.match(migration, /create policy "Owners can create meeting date overrides"/i);
  assert.match(migration, /create or replace function public\.validate_video_call_slot/i);
  assert.match(migration, /The shop blocked this date/i);
  assert.match(migration, /mod\(target_minutes - override_open_minutes, business_row\.meeting_slot_interval_minutes\)/i);
  assert.match(route, /business_meeting_date_overrides/);
  assert.match(route, /dateOverrides/);
  assert.match(route, /buildMeetingSlots\(\{ timeZone, hours, dateOverrides/);
});

test("owners have three secure meeting choices in messages", () => {
  const migration = source("supabase/migrations/20260915180000_owner_meeting_choices.sql");
  const route = source("app/api/video-calls/route.js");
  const owner = source("app/owner/messages/page.jsx");
  const modal = source("components/MeetingBookingModal.jsx");

  assert.match(owner, /Call now/);
  assert.match(owner, /Let customer choose/);
  assert.match(owner, /Propose a time/);
  assert.match(owner, /videoCallAction\("start_now"/);
  assert.match(owner, /videoCallAction\("invite_to_schedule"/);
  assert.match(modal, /ownerAction === "propose"/);
  assert.match(route, /video_call_owner_start_now/);
  assert.match(route, /video_call_owner_invite/);
  assert.match(route, /video_call_owner_propose/);
  assert.match(migration, /Only this shop owner can start the call/i);
  assert.match(migration, /The shop already has a meeting during this time/i);
  assert.match(migration, /confirmation_required_by = 'CUSTOMER'/i);
});

test("customer scheduling invites and accepted proposals use the correct email timing", () => {
  const migration = source("supabase/migrations/20260915180000_owner_meeting_choices.sql");
  const route = source("app/api/video-calls/route.js");
  const email = source("lib/meetingEmail.js");
  const customer = source("app/messages/page.jsx");

  assert.match(route, /invite_to_schedule: "SCHEDULING_INVITE"/);
  assert.doesNotMatch(route, /propose: "CONFIRMED"/);
  assert.match(email, /eventType === "SCHEDULING_INVITE"/);
  assert.match(email, /schedule=1/);
  assert.match(email, /Choose a meeting time/);
  assert.match(customer, /openScheduleFromLink/);
  assert.match(customer, /The shop invited you to choose any open time/);
  assert.match(migration, /source', 'accepted_owner_proposal'/i);
  assert.match(migration, /status = 'SCHEDULED'/i);
  assert.match(route, /confirm: "CONFIRMED"/);
});

test("customer reschedules require owner confirmation before sending the reschedule email", () => {
  const migration = source("supabase/migrations/20260914120000_require_owner_confirmation_for_customer_reschedules.sql");
  const route = source("app/api/video-calls/route.js");
  const customer = source("app/messages/page.jsx");
  assert.match(migration, /when p_confirm or call_row\.owner_id = auth\.uid\(\) then 'SCHEDULED'/i);
  assert.match(migration, /else 'REQUESTED'/i);
  assert.match(migration, /call_row\.status = 'REQUESTED' and call_row\.rescheduled_from_at is not null/i);
  assert.match(migration, /New meeting time awaiting shop confirmation/i);
  assert.match(route, /action === "reschedule" && call\.status === "REQUESTED"/);
  assert.match(route, /notificationType = null/);
  assert.match(route, /\["schedule", "confirm"\]\.includes\(action\)[\s\S]*notificationType = "RESCHEDULED"/);
  assert.match(route, /awaitingOwnerConfirmation/);
  assert.match(customer, /Reschedule awaiting owner confirmation/);
  assert.match(customer, /The reschedule email will be sent after the owner confirms it/);
});

test("owner reschedules require customer confirmation before sending the final email", () => {
  const migration = source("supabase/migrations/20260914130000_require_recipient_confirmation_for_reschedules.sql");
  const route = source("app/api/video-calls/route.js");
  const customer = source("app/messages/page.jsx");
  assert.match(migration, /add column if not exists confirmation_required_by text/i);
  assert.match(migration, /'CUSTOMER', 'BUSINESS_OWNER'/i);
  assert.match(migration, /when role_name = 'BUSINESS_OWNER' then 'CUSTOMER' else 'BUSINESS_OWNER'/i);
  assert.match(migration, /Only the customer can confirm this proposed time/i);
  assert.match(migration, /Only the shop owner can confirm this proposed time/i);
  assert.match(migration, /New meeting time awaiting customer confirmation/i);
  assert.match(migration, /create or replace function public\.video_call_confirm/i);
  assert.match(route, /\["schedule", "confirm"\]\.includes\(action\)/);
  assert.match(route, /awaitingCustomerConfirmation/);
  assert.match(customer, /Owner proposed a new meeting time/);
  assert.match(customer, /Accept proposed time/);
  assert.match(customer, /Choose another time/);
  assert.match(customer, /videoCallAction\("confirm"/);
});

test("video-call API exposes availability and never returns secure room names from list queries", () => {
  const route = source("app/api/video-calls/route.js");
  assert.match(route, /export async function GET/);
  assert.match(route, /view === "owner"/);
  assert.match(route, /view === "meeting"/);
  assert.match(route, /loadMeeting/);
  assert.match(route, /buildMeetingSlots/);
  assert.match(route, /business_hours/);
  assert.match(route, /requested_slot_at/);
  assert.match(route, /room_name: _roomName/);
  assert.match(route, /video_call_book/);
  assert.match(route, /video_call_reschedule/);
  assert.match(route, /video_call_confirm/);
  assert.match(route, /request_reschedule/);
  assert.match(route, /VIDEO_CALL_AVAILABILITY_QUERY_FAILED/);
  assert.match(route, /The meeting was not saved/);
});

test("owners can reopen a missed meeting for the customer to choose a replacement slot", () => {
  const migration = source("supabase/migrations/20260913240000_owner_requested_meeting_reschedule.sql");
  const ownerCalendar = source("app/owner/calendar/page.jsx");
  const customer = source("app/messages/page.jsx");
  const ownerMessages = source("app/owner/messages/page.jsx");
  assert.match(migration, /video_call_request_reschedule/);
  assert.match(migration, /Only the shop owner can request a reschedule/);
  assert.match(migration, /status = 'REQUESTED'/);
  assert.match(migration, /event', 'reschedule_requested'/);
  assert.match(migration, /event_name = 'reschedule_requested'/);
  assert.match(ownerCalendar, /Ask customer to reschedule/);
  assert.match(ownerCalendar, /request_reschedule/);
  assert.match(customer, /Choose a new meeting time/);
  assert.match(customer, /rescheduleRequestedMeeting/);
  assert.match(ownerMessages, /requestVideoCallReschedule/);
});

test("scheduled meeting notifications use a protected direct join link without a Vercel reminder schedule", () => {
  const email = source("lib/meetingEmail.js");
  const vercel = source("vercel.json");
  const directMeeting = source("app/meeting/[id]/page.jsx");
  assert.match(email, /eventType === "BOOKED"/);
  assert.match(email, /eventType === "RESCHEDULED"/);
  assert.match(email, /Previous:/);
  assert.match(email, /New time:/);
  assert.match(email, /customer[\s\S]*owner/);
  assert.match(email, /canJoinDirectly/);
  assert.match(email, /new URL\(`\/meeting\/\$\{encodeURIComponent\(selectedCall\.id\)\}`, appUrl\)/);
  assert.match(email, /hasDirectMeetingLink/);
  assert.match(email, /Open secure meeting/);
  assert.match(email, /View meeting request/);
  assert.doesNotMatch(email, /REMINDER_15/);
  assert.doesNotMatch(vercel, /"crons"/);
  assert.doesNotMatch(vercel, /video-call-reminders/);
  assert.match(directMeeting, /videoCallAction\("join"/);
  assert.match(directMeeting, /videoCallQuery\(\{ view: "meeting", callId \}\)/);
  assert.match(directMeeting, /Meeting starts in/);
  assert.match(directMeeting, /formatMeetingCountdown/);
  assert.match(directMeeting, /VideoCallModal/);
  assert.match(directMeeting, /\/login\?next/);
});

test("meeting notifications are deduplicated and use branded, escaped Resend email", () => {
  const email = source("lib/meetingEmail.js");
  const migration = source("supabase/migrations/20260913200000_calendly_style_video_meetings.sql");
  assert.match(email, /claim_video_call_email/);
  assert.match(email, /escapeHtml/);
  assert.match(email, /Press &amp; Present/);
  assert.match(email, /EMAIL_FROM/);
  assert.match(email, /video_call_email_events/);
  assert.ok(migration.includes("event_type in ('BOOKED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED')"));
});

test("customer messages provide booking and rescheduling without replacing the secure call room", () => {
  const customer = source("app/messages/page.jsx");
  const modal = source("components/MeetingBookingModal.jsx");
  assert.match(customer, /MeetingBookingModal/);
  assert.match(customer, /setShowMeetingBooking\(true\)/);
  assert.match(customer, /meta.event\)/);
  assert.match(modal, /videoCallQuery/);
  assert.match(modal, /videoCallAction\(action/);
  assert.match(modal, /reschedule/);
  assert.match(modal, /existingCall\?\.status === "REQUESTED" && existingCall\?\.confirmation_required_by !== "CUSTOMER" \? "schedule" : "reschedule"/);
  assert.match(modal, /Current appointment:/);
  assert.match(modal, /Current time/);
  assert.match(modal, /New meeting time/);
  assert.match(modal, /needsDifferentTime/);
  assert.match(modal, /Request new time/);
  assert.match(modal, /The owner must confirm this new time/);
  assert.match(customer, /VideoCallModal/);
});

test("meeting message cards stay readable in both incoming and outgoing chat bubbles", () => {
  const customer = source("app/messages/page.jsx");
  const owner = source("app/owner/messages/page.jsx");

  assert.match(customer, /min-w-60 rounded-xl border border-slate-200 bg-white p-4 text-center text-slate-900 shadow-sm/);
  assert.match(owner, /w-64 flex-col items-center rounded-xl border border-slate-200 border-t-4 border-t-\[#00aeb5\] bg-white p-4 text-center text-slate-900 shadow-sm/);
  assert.match(customer, /disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100/);
  assert.match(owner, /disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100/);
  assert.match(owner, /Awaiting customer confirmation/);
  assert.match(owner, /confirmation_required_by !== "CUSTOMER"/);
});

test("meeting booking uses a compact month, day, and time picker", () => {
  const modal = source("components/MeetingBookingModal.jsx");
  assert.match(modal, /availableMonths/);
  assert.match(modal, /Previous month/);
  assert.match(modal, /Next month/);
  assert.match(modal, /1\. Choose a month/);
  assert.match(modal, /2\. Choose a day/);
  assert.match(modal, /3\. Choose a time/);
  assert.match(modal, /buildCalendarDays/);
  assert.match(modal, /getAvailableSlotCount\(date\) > 0/);
  assert.match(modal, /disabled=\{!isSlotAvailable\}/);
  assert.match(modal, /unavailableReason/);
  assert.match(modal, /Unavailable/);
  assert.match(modal, /setSelectedDate\(initialDate\?\.dateKey \|\| ""\)/);
  assert.match(modal, /setSelectedSlot\(currentSlot\)/);
  assert.match(modal, /dates\.find\(\(date\) => getMonthKey\(date\.dateKey\) === nextMonth\)/);
  assert.match(modal, /disabled=\{!calendarDay\.isAvailable\}/);
  assert.match(modal, /aria-pressed/);
  assert.match(modal, /border-\[#00aeb5\] bg-\[#dffafa\]/);
  assert.match(modal, /border-slate-400 bg-slate-300/);
  assert.doesNotMatch(modal, /dates\.map\(\(date\) => <button/);
});

test("owner calendar preserves owner actions, availability settings, and conversation links", () => {
  const calendar = source("app/owner/calendar/page.jsx");
  const sidebar = source("components/owner/OwnerSidebar.jsx");
  const ownerMessages = source("app/owner/messages/page.jsx");
  assert.match(calendar, /view: "owner"/);
  assert.match(calendar, /meeting_duration_minutes/);
  assert.match(calendar, /Minimum notice \(minutes\)/);
  assert.match(calendar, /Slot spacing \(minutes\)/);
  assert.match(calendar, /Date availability/);
  assert.match(calendar, /business_meeting_date_overrides/);
  assert.match(calendar, /Blocked/);
  assert.match(calendar, /business_hours/);
  assert.ok(calendar.includes("owner/messages?conversation"));
  assert.match(calendar, /videoCallAction\("join"/);
  assert.match(calendar, /videoCallAction\("cancel"/);
  assert.match(calendar, /Awaiting customer confirmation/);
  assert.match(calendar, /Change proposal/);
  assert.match(sidebar, /CalendarDays/);
  assert.match(sidebar, /\/owner\/calendar/);
  assert.ok(ownerMessages.includes("new URLSearchParams(window.location.search)"));
});
