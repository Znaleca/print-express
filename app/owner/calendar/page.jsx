"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Loader2, MessageSquare, RefreshCcw, Save, Video, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MeetingBookingModal from "@/components/MeetingBookingModal";
import VideoCallModal from "@/components/VideoCallModal";
import { buildMeetingSlots, formatMeetingDateKey, formatMeetingDateTime, getMeetingStatusLabel, getZonedParts, normalizeMeetingSettings } from "@/lib/meetingScheduling";
import { getVideoCallWindow, videoCallAction, videoCallQuery } from "@/lib/videoCalls";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_HOUR = (day) => ({ business_id: null, day_of_week: day, opens_at: "09:00", closes_at: "17:00", is_closed: true });

function calendarKey(year, month, day) {
  const date = new Date(Date.UTC(year, month, day, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthCells(date) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 - first.getUTCDay() + index, 12));
    cells.push({ date: current, dateKey: calendarKey(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()), inMonth: current.getUTCMonth() === date.getUTCMonth() });
  }
  return cells;
}

function formatLocalTime(value) {
  return value ? String(value).slice(0, 5) : "09:00";
}

export default function OwnerCalendarPage() {
  const [calendar, setCalendar] = useState({ businesses: [], calls: [] });
  const [businessId, setBusinessId] = useState("");
  const [viewDate, setViewDate] = useState(() => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 12)));
  const [selectedDate, setSelectedDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [hoursDraft, setHoursDraft] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [videoCallSession, setVideoCallSession] = useState(null);
  const [showMeetingBooking, setShowMeetingBooking] = useState(false);
  const [dateOverrideDraft, setDateOverrideDraft] = useState({ mode: "DEFAULT", opens_at: "09:00", closes_at: "17:00" });

  const loadCalendar = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const data = await videoCallQuery({ view: "owner" });
      setCalendar(data);
      const requestedMeetingId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("meeting") : null;
      const requestedCall = requestedMeetingId ? data.calls?.find((call) => call.id === requestedMeetingId) : null;
      setBusinessId((current) => requestedCall?.business_id || current || data.businesses?.[0]?.id || "");
      if (requestedCall) {
        setSelectedDate(formatMeetingDateKey(requestedCall.scheduled_at || requestedCall.requested_slot_at || requestedCall.created_at, requestedCall.timezone || "Asia/Manila"));
      }
    } catch (loadError) {
      setError(loadError.message || "Calendar data is unavailable.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => { loadCalendar(); }, []);

  const business = calendar.businesses.find((item) => item.id === businessId) || calendar.businesses[0];
  const timeZone = business?.timezone || "Asia/Manila";
  const calls = useMemo(() => calendar.calls.filter((call) => call.business_id === business?.id), [calendar.calls, business?.id]);
  const filteredCalls = useMemo(() => {
    if (statusFilter === "ALL") return calls;
    if (statusFilter === "EXPIRED") {
      return calls.filter((call) => call.status === "EXPIRED" || (call.status === "SCHEDULED" && getVideoCallWindow(call).expired));
    }
    return calls.filter((call) => call.status === statusFilter);
  }, [calls, statusFilter]);
  const callsByDate = useMemo(() => {
    const grouped = new Map();
    for (const call of filteredCalls) {
      const dateKey = formatMeetingDateKey(call.scheduled_at || call.requested_slot_at || call.updated_at || call.created_at, call.timezone || timeZone);
      grouped.set(dateKey, [...(grouped.get(dateKey) || []), call]);
    }
    return grouped;
  }, [filteredCalls, timeZone]);
  const cells = useMemo(() => monthCells(viewDate), [viewDate]);
  const selectedCalls = filteredCalls.filter((call) => formatMeetingDateKey(call.scheduled_at || call.requested_slot_at || call.updated_at || call.created_at, call.timezone || timeZone) === selectedDate);
  const previewSlots = useMemo(() => buildMeetingSlots({ timeZone, hours: hoursDraft, dateOverrides: business?.dateOverrides || [], settings: settingsDraft || {}, bookedCalls: calls }), [timeZone, hoursDraft, settingsDraft, calls, business?.dateOverrides]);

  useEffect(() => {
    if (!business) return;
    setSettingsDraft(normalizeMeetingSettings(business));
    const currentHours = DAY_NAMES.map((_, day) => {
      const saved = (business.hours || []).find((row) => Number(row.day_of_week) === day);
      return saved ? { ...saved, opens_at: formatLocalTime(saved.opens_at), closes_at: formatLocalTime(saved.closes_at) } : DEFAULT_HOUR(day);
    });
    setHoursDraft(currentHours);
    setSelectedDate((current) => current || formatMeetingDateKey(new Date(), business.timezone || "Asia/Manila"));
  }, [business]);

  useEffect(() => {
    const saved = business?.dateOverrides?.find((row) => row.available_date === selectedDate);
    setDateOverrideDraft(saved
      ? { mode: saved.is_available ? "CUSTOM" : "BLOCKED", opens_at: formatLocalTime(saved.opens_at), closes_at: formatLocalTime(saved.closes_at || "17:00") }
      : { mode: "DEFAULT", opens_at: "09:00", closes_at: "17:00" });
  }, [business?.dateOverrides, selectedDate]);

  const updateSetting = (key, value) => setSettingsDraft((current) => ({ ...current, [key]: key === "meeting_enabled" ? value : Number(value) }));
  const updateHour = (day, patch) => setHoursDraft((current) => current.map((row) => row.day_of_week === day ? { ...row, ...patch } : row));

  const saveAvailability = async () => {
    if (!business?.id || !settingsDraft || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const { error: businessError } = await supabase.from("businesses").update({
        meeting_enabled: settingsDraft.meeting_enabled,
        meeting_duration_minutes: settingsDraft.meeting_duration_minutes,
        meeting_buffer_minutes: settingsDraft.meeting_buffer_minutes,
        meeting_min_notice_minutes: settingsDraft.meeting_min_notice_minutes,
        meeting_max_days_ahead: settingsDraft.meeting_max_days_ahead,
        meeting_slot_interval_minutes: settingsDraft.meeting_slot_interval_minutes,
        meeting_requires_approval: false,
      }).eq("id", business.id);
      if (businessError) throw businessError;
      const rows = hoursDraft.filter((row) => !row.is_closed).map((row) => ({ business_id: business.id, day_of_week: row.day_of_week, opens_at: row.opens_at, closes_at: row.closes_at, is_closed: false, updated_at: new Date().toISOString() }));
      const { error: hoursError } = await supabase.from("business_hours").upsert(rows, { onConflict: "business_id,day_of_week" });
      if (hoursError) throw hoursError;
      const closedDays = hoursDraft.filter((row) => row.is_closed).map((row) => row.day_of_week);
      if (closedDays.length) await supabase.from("business_hours").delete().eq("business_id", business.id).in("day_of_week", closedDays);
      setNotice("Meeting availability saved. Existing bookings keep their original time and duration.");
      await loadCalendar(true);
    } catch (saveError) {
      setError(saveError.message || "Could not save meeting availability.");
    } finally { setSaving(false); }
  };

  const saveDateOverride = async () => {
    if (!business?.id || !selectedDate || saving) return;
    if (dateOverrideDraft.mode === "CUSTOM" && dateOverrideDraft.opens_at >= dateOverrideDraft.closes_at) {
      setError("The custom end time must be later than the start time.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      if (dateOverrideDraft.mode === "DEFAULT") {
        const { error: deleteError } = await supabase.from("business_meeting_date_overrides").delete().eq("business_id", business.id).eq("available_date", selectedDate);
        if (deleteError) throw deleteError;
        setNotice(`${selectedDate} now follows the weekly schedule.`);
      } else {
        const isAvailable = dateOverrideDraft.mode === "CUSTOM";
        const { error: overrideError } = await supabase.from("business_meeting_date_overrides").upsert({
          business_id: business.id,
          available_date: selectedDate,
          is_available: isAvailable,
          opens_at: isAvailable ? dateOverrideDraft.opens_at : null,
          closes_at: isAvailable ? dateOverrideDraft.closes_at : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "business_id,available_date" });
        if (overrideError) throw overrideError;
        setNotice(isAvailable ? `Custom availability saved for ${selectedDate}.` : `${selectedDate} is blocked for customer bookings.`);
      }
      await loadCalendar(true);
    } catch (saveError) {
      setError(saveError.message || "Could not save availability for this date.");
    } finally { setSaving(false); }
  };

  const joinCall = async (callId) => {
    try {
      const result = await videoCallAction("join", { callId });
      if (!result.call?.room_name) throw new Error("The secure call room is unavailable.");
      setVideoCallSession({ callId: result.call.id, roomName: result.call.room_name });
    } catch (joinError) { setError(joinError.message || "This call cannot be joined yet."); }
  };

  const cancelCall = async (callId) => {
    if (!window.confirm("Cancel this meeting? The customer will be notified.")) return;
    try {
      await videoCallAction("cancel", { callId, reason: "Cancelled by shop" });
      setNotice("Meeting cancelled.");
      await loadCalendar(true);
    } catch (cancelError) { setError(cancelError.message || "Could not cancel the meeting."); }
  };

  const requestReschedule = async (callId) => {
    if (!window.confirm("Ask the customer to choose a new meeting time? The old meeting will be reopened as pending.")) return;
    try {
      await videoCallAction("request_reschedule", { callId });
      setNotice("The customer was asked to choose a new meeting time.");
      setSelectedDate(formatMeetingDateKey(new Date(), timeZone));
      await loadCalendar(true);
    } catch (rescheduleError) { setError(rescheduleError.message || "Could not request a new meeting time."); }
  };

  return (
    <div className="min-h-full bg-[#F6F6F2] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-col gap-4 border-b border-[#D8D6CE] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#EC008C]">Owner workspace</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-5xl">Calendar</h1><p className="mt-2 text-sm text-slate-500">Publish open times and manage every online meeting in one place.</p></div>
          <div className="flex items-center gap-2"><select value={business?.id || ""} onChange={(event) => { setBusinessId(event.target.value); setSelectedDate(""); }} className="max-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold"><option value="">Choose shop</option>{calendar.businesses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => loadCalendar()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold hover:border-slate-900 disabled:opacity-50"><RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button></div>
        </header>

        {error && <div role="alert" className="mb-4 border-l-4 border-[#EC008C] bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}
        {notice && <div role="status" className="mb-4 border-l-4 border-[#00aeb5] bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">{notice}</div>}
        {loading && !business ? <div className="flex min-h-72 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 size={18} className="animate-spin" /> Loading calendar…</div> : !business ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Create or verify a shop before publishing meeting availability.</div> : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-2xl border border-[#D8D6CE] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#EC008C]"><CalendarDays size={14} /> Meetings</p><p className="mt-1 text-xs text-slate-500">Shop timezone: <strong className="text-slate-800">{timeZone}</strong></p></div><div className="flex items-center gap-2"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"><option value="ALL">All statuses</option><option value="REQUESTED">Awaiting confirmation</option><option value="SCHEDULED">Confirmed</option><option value="EXPIRED">Missed / expired</option><option value="CANCELLED">Cancelled</option><option value="ENDED">Completed</option></select></div></div>
              <div className="mt-4 flex items-center justify-between"><button type="button" aria-label="Previous month" onClick={() => setViewDate((date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1, 12)))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"><ChevronLeft size={17} /></button><h2 className="text-lg font-black">{viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone })}</h2><button type="button" aria-label="Next month" onClick={() => setViewDate((date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12)))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"><ChevronRight size={17} /></button></div>
              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-400">{DAY_NAMES.map((day) => <span key={day} className="py-2">{day.slice(0, 3)}</span>)}{cells.map((cell) => { const count = callsByDate.get(cell.dateKey)?.length || 0; const override = business?.dateOverrides?.find((row) => row.available_date === cell.dateKey); return <button type="button" key={cell.dateKey} onClick={() => setSelectedDate(cell.dateKey)} className={`min-h-16 rounded-lg border p-2 text-left transition-colors ${cell.inMonth ? override?.is_available === false ? "bg-slate-200 text-slate-500" : override?.is_available ? "bg-cyan-50" : "bg-white" : "bg-slate-50 text-slate-300"} ${selectedDate === cell.dateKey ? "border-[#EC008C] ring-2 ring-[#EC008C]/15" : "border-slate-100 hover:border-slate-300"}`}><span className="text-xs font-bold">{cell.date.getUTCDate()}</span><div className="mt-2 flex flex-wrap gap-1">{count > 0 && <span className="flex w-fit items-center gap-1 rounded-full bg-[#00FFFF] px-1.5 py-0.5 text-[9px] font-black text-slate-900">{count}</span>}{override && <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${override.is_available ? "bg-cyan-100 text-cyan-800" : "bg-slate-600 text-white"}`}>{override.is_available ? "Custom" : "Blocked"}</span>}</div></button>; })}</div>
              <div className="mt-6 flex items-center justify-between border-b border-slate-200 pb-3"><h3 className="text-sm font-black">{selectedDate ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Selected day"}</h3><span className="text-xs text-slate-500">{selectedCalls.length} meeting{selectedCalls.length === 1 ? "" : "s"}</span></div>
              <div className="mt-3 space-y-3">{selectedCalls.length ? selectedCalls.map((call) => { const callWindow = getVideoCallWindow(call); const start = call.scheduled_at || call.requested_slot_at; const isMissed = call.status === "EXPIRED" || (call.status === "SCHEDULED" && callWindow.expired); const awaitingCustomerConfirmation = call.status === "REQUESTED" && call.confirmation_required_by === "CUSTOMER"; return <article key={call.id} className="rounded-xl border border-slate-200 bg-[#F6F6F2] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900">{call.customer?.full_name || "Customer"}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${call.status === "CANCELLED" ? "bg-rose-100 text-rose-700" : call.status === "REQUESTED" ? "bg-amber-100 text-amber-800" : isMissed ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>{isMissed ? "Missed / expired" : awaitingCustomerConfirmation ? "Awaiting customer confirmation" : getMeetingStatusLabel(call.status)}</span></div><p className="mt-1 text-xs font-semibold text-slate-700">{start ? formatMeetingDateTime(start, call.timezone || timeZone) : "Time to be confirmed"}</p><p className="mt-1 text-[11px] text-slate-500">{call.duration_minutes || 30} minutes · {call.timezone || timeZone}</p>{isMissed && <p className="mt-2 text-[10px] font-bold text-slate-600">The meeting window has ended. Ask the customer to choose another time.</p>}{call.customer_note && <p className="mt-3 border-l-2 border-[#FFF200] pl-3 text-xs text-slate-600">{call.customer_note}</p>}</div><div className="flex flex-wrap gap-2 sm:justify-end"><Link href={`/owner/messages?conversation=${encodeURIComponent(call.conversation_id)}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:border-slate-400"><MessageSquare size={13} /> Conversation</Link>{call.status === "REQUESTED" && !awaitingCustomerConfirmation && <button type="button" onClick={() => { setSelectedCall(call); setShowMeetingBooking(true); }} className="rounded-lg bg-[#EC008C] px-2.5 py-2 text-[10px] font-bold text-white">Confirm / choose time</button>}{["SCHEDULED", "LIVE"].includes(call.status) && <button type="button" onClick={() => joinCall(call.id)} disabled={!callWindow.joinable} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-2 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Video size={13} />{callWindow.joinable ? "Join" : isMissed ? "Missed" : "Not ready"}</button>}{isMissed && <button type="button" onClick={() => requestReschedule(call.id)} className="rounded-lg bg-[#EC008C] px-2.5 py-2 text-[10px] font-bold text-white hover:bg-[#c90078]">Ask customer to reschedule</button>}{["REQUESTED", "SCHEDULED"].includes(call.status) && !isMissed && <><button type="button" onClick={() => { setSelectedCall(call); setShowMeetingBooking(true); }} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700">{awaitingCustomerConfirmation ? "Change proposal" : "Reschedule"}</button><button type="button" onClick={() => cancelCall(call.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-[10px] font-bold text-rose-700"><XCircle size={13} /> Cancel</button></>}</div></div></article>; }) : <div className="rounded-xl border border-dashed border-slate-300 bg-[#F6F6F2] p-8 text-center text-sm text-slate-500">No meetings for this day.</div>}</div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-[#D8D6CE] bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#EC008C]">Availability</p><h2 className="mt-1 text-xl font-black">Weekly defaults</h2></div><Clock3 className="text-[#00aeb5]" size={20} /></div><p className="mt-2 text-xs leading-relaxed text-slate-500">Set recurring hours, then customize or block individual dates below. Customer choices book immediately. Minimum notice defaults to 20 minutes.</p><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-700">Duration<select value={settingsDraft?.meeting_duration_minutes || 30} onChange={(event) => updateSetting("meeting_duration_minutes", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label><label className="text-xs font-bold text-slate-700">Slot spacing (minutes)<input type="number" min="5" max="120" step="5" value={settingsDraft?.meeting_slot_interval_minutes || 30} onChange={(event) => updateSetting("meeting_slot_interval_minutes", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /></label><label className="text-xs font-bold text-slate-700">Buffer<select value={settingsDraft?.meeting_buffer_minutes || 0} onChange={(event) => updateSetting("meeting_buffer_minutes", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="0">No buffer</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label><label className="text-xs font-bold text-slate-700">Minimum notice (minutes)<input type="number" min="5" max="10080" step="5" value={settingsDraft?.meeting_min_notice_minutes || 20} onChange={(event) => updateSetting("meeting_min_notice_minutes", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /></label></div><label className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"><span>Accept online meetings</span><input type="checkbox" checked={settingsDraft?.meeting_enabled !== false} onChange={(event) => updateSetting("meeting_enabled", event.target.checked)} className="h-4 w-4 accent-[#EC008C]" /></label><div className="mt-4 border-t border-slate-200 pt-4"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Recurring open days · {timeZone}</p><div className="space-y-2">{hoursDraft.map((row) => <div key={row.day_of_week} className="grid grid-cols-[minmax(0,1fr)_82px_82px] items-center gap-2 text-xs"><label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={!row.is_closed} onChange={(event) => updateHour(row.day_of_week, { is_closed: !event.target.checked })} className="h-4 w-4 accent-[#00aeb5]" />{DAY_NAMES[row.day_of_week]}</label><input type="time" step="300" value={row.opens_at} disabled={row.is_closed} aria-label={`${DAY_NAMES[row.day_of_week]} start time`} onChange={(event) => updateHour(row.day_of_week, { opens_at: event.target.value })} className="rounded border border-slate-200 px-1 py-1 text-[11px] disabled:bg-slate-100" /><input type="time" step="300" value={row.closes_at} disabled={row.is_closed} aria-label={`${DAY_NAMES[row.day_of_week]} end time`} onChange={(event) => updateHour(row.day_of_week, { closes_at: event.target.value })} className="rounded border border-slate-200 px-1 py-1 text-[11px] disabled:bg-slate-100" /></div>)}</div></div><button type="button" onClick={saveAvailability} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-[#EC008C] disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? "Saving…" : "Save weekly defaults"}</button></section>
              <section className="rounded-2xl border border-[#D8D6CE] bg-white p-4 shadow-sm sm:p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#EC008C]">Selected date</p><h2 className="mt-1 text-xl font-black">Date availability</h2><p className="mt-1 text-xs font-semibold text-slate-700">{selectedDate || "Choose a date on the calendar"}</p><p className="mt-2 text-xs text-slate-500">Override the weekly hours for this date, block it completely, or return it to the recurring schedule.</p><div className="mt-4 grid grid-cols-3 gap-2">{[["DEFAULT", "Weekly"], ["CUSTOM", "Custom"], ["BLOCKED", "Blocked"]].map(([value, label]) => <button type="button" key={value} onClick={() => setDateOverrideDraft((current) => ({ ...current, mode: value }))} disabled={!selectedDate} aria-pressed={dateOverrideDraft.mode === value} className={`rounded-lg border px-2 py-2 text-[10px] font-black ${dateOverrideDraft.mode === value ? "border-[#EC008C] bg-[#ffe4f2] text-[#9b005d]" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>)}</div>{dateOverrideDraft.mode === "CUSTOM" && <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-700">Available from<input type="time" step="300" value={dateOverrideDraft.opens_at} onChange={(event) => setDateOverrideDraft((current) => ({ ...current, opens_at: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /></label><label className="text-xs font-bold text-slate-700">Available until<input type="time" step="300" value={dateOverrideDraft.closes_at} onChange={(event) => setDateOverrideDraft((current) => ({ ...current, closes_at: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" /></label></div>}<button type="button" onClick={saveDateOverride} disabled={saving || !selectedDate} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#00aeb5] px-3 py-2.5 text-xs font-black text-white hover:bg-[#008f95] disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}{saving ? "Saving…" : "Save selected date"}</button><div className="mt-4 border-t border-slate-200 pt-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Saved date changes</p><div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{(business?.dateOverrides || []).map((row) => <button type="button" key={row.id || row.available_date} onClick={() => setSelectedDate(row.available_date)} className="flex w-full items-center justify-between rounded-lg bg-[#F6F6F2] px-3 py-2 text-left text-xs"><span className="font-bold">{row.available_date}</span><span className={row.is_available ? "text-[#008b91]" : "text-rose-600"}>{row.is_available ? `${formatLocalTime(row.opens_at)}–${formatLocalTime(row.closes_at)}` : "Blocked"}</span></button>)}{!(business?.dateOverrides || []).length && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No date-specific changes yet.</p>}</div></div></section>
              <section className="rounded-2xl border border-[#D8D6CE] bg-white p-4 shadow-sm sm:p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#EC008C]">Preview</p><h2 className="mt-1 text-xl font-black">Next open slots</h2><p className="mt-2 text-xs text-slate-500">Customers see these times after the current notice period.</p><div className="mt-3 space-y-2">{previewSlots.flatMap((date) => date.slots).slice(0, 6).map((slot) => <div key={slot.startAt} className="flex items-center justify-between rounded-lg bg-[#F6F6F2] px-3 py-2 text-xs"><span className="font-bold">{formatMeetingDateTime(slot.startAt, timeZone)}</span><span className="text-slate-500">{slot.durationMinutes} min</span></div>)}{!previewSlots.length && <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Publish at least one open day to show slots.</p>}</div></section>
            </aside>
          </div>
        )}
      </div>
      {videoCallSession && <VideoCallModal callSession={videoCallSession} participantLabel={selectedCall?.customer?.full_name || "Customer"} isOwner onClose={() => setVideoCallSession(null)} />}
      {showMeetingBooking && selectedCall && <MeetingBookingModal businessId={selectedCall.business_id} conversationId={selectedCall.conversation_id} existingCall={selectedCall} isOwner onClose={() => { setShowMeetingBooking(false); setSelectedCall(null); }} onBooked={async (call) => { setShowMeetingBooking(false); setSelectedCall(null); setNotice(call?.confirmation_required_by === "CUSTOMER" ? "New time proposed. Waiting for the customer to confirm." : "Meeting saved and participants were notified."); await loadCalendar(true); }} />}
    </div>
  );
}
