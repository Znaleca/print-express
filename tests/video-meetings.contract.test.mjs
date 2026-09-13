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
  assert.match(helper, /MINIMUM_MEETING_NOTICE_MINUTES = 30/);
  assert.match(helper, /isMeetingStartBookable/);
});

test("meeting booking accepts exactly 30 minutes, accepts later slots, and blocks earlier slots", async () => {
  const { isMeetingStartBookable } = await import("../lib/meetingScheduling.js");
  const now = "2026-09-13T01:00:00.000Z";
  assert.equal(isMeetingStartBookable("2026-09-13T01:30:00.000Z", { now }), true);
  assert.equal(isMeetingStartBookable("2026-09-13T01:35:00.000Z", { now }), true);
  assert.equal(isMeetingStartBookable("2026-09-13T01:29:59.000Z", { now }), false);
  assert.equal(isMeetingStartBookable("2026-09-13T01:35:00.000Z", { now, minimumNoticeMinutes: 60 }), false);
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
  const { formatMeetingCountdown } = await import("../lib/meetingScheduling.js");
  const now = "2026-09-14T01:00:00.000Z";
  assert.equal(formatMeetingCountdown("2026-09-14T04:00:00.000Z", now), "3 hours");
  assert.equal(formatMeetingCountdown("2026-09-14T04:15:00.000Z", now), "3 hours, 15 minutes");
  assert.equal(formatMeetingCountdown("2026-09-15T03:00:00.000Z", now), "1 day, 2 hours");
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
  assert.match(customer, /VideoCallModal/);
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
  assert.match(modal, /setSelectedDate\(firstDate\?\.dateKey \|\| ""\)/);
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
  assert.match(calendar, /business_hours/);
  assert.ok(calendar.includes("owner/messages?conversation"));
  assert.match(calendar, /videoCallAction\("join"/);
  assert.match(calendar, /videoCallAction\("cancel"/);
  assert.match(sidebar, /CalendarDays/);
  assert.match(sidebar, /\/owner\/calendar/);
  assert.ok(ownerMessages.includes("new URLSearchParams(window.location.search)"));
});
