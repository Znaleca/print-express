"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Loader2, X } from "lucide-react";
import { formatMeetingDateTime, getMeetingStatusLabel } from "@/lib/meetingScheduling";
import { videoCallAction, videoCallQuery } from "@/lib/videoCalls";

const getMonthKey = (dateKey) => String(dateKey || "").slice(0, 7);

const formatMonthLabel = (monthKey) => {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "Choose a month";

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
};

const getDateKey = (monthKey, day) => {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match || !day) return "";
  return `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`;
};

const getAvailableSlotCount = (date) => date?.slots?.filter((slot) => slot.available !== false).length || 0;
const getMeetingTime = (call) => call?.scheduled_at || call?.requested_slot_at || "";
const isSameTime = (left, right) => {
  const leftTime = new Date(left || "").getTime();
  const rightTime = new Date(right || "").getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
};

const buildCalendarDays = (monthKey, dates) => {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];

  const year = Number(match[1]);
  const month = Number(match[2]);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const datesByKey = new Map(dates.map((date) => [date.dateKey, date]));

  return Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
    if (index < firstWeekday) return { key: `empty-${index}`, day: null, date: null };

    const day = index - firstWeekday + 1;
    const dateKey = getDateKey(monthKey, day);
    const date = datesByKey.get(dateKey) || null;
    return { key: dateKey, day, date, isAvailable: getAvailableSlotCount(date) > 0 };
  });
};

export default function MeetingBookingModal({
  businessId,
  conversationId,
  existingCall = null,
  isOwner = false,
  ownerAction = "manage",
  onClose,
  onBooked,
  }) {
  const [availability, setAvailability] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [note, setNote] = useState(existingCall?.customer_note || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const loadAvailability = async () => {
    if (!businessId) return;
    setLoading(true);
    setError("");
    try {
      const result = await videoCallQuery({
        view: "availability",
        businessId,
        ...(conversationId ? { conversationId } : {}),
        ...(existingCall?.id ? { excludeCallId: existingCall.id } : {}),
      });
      setAvailability(result);
      const firstDate = result.dates?.[0];
      const currentMeetingTime = getMeetingTime(existingCall);
      const currentDate = result.dates?.find((date) => date.slots?.some((slot) => isSameTime(slot.startAt, currentMeetingTime)));
      const currentSlot = currentDate?.slots?.find((slot) => slot.available !== false && isSameTime(slot.startAt, currentMeetingTime)) || null;
      const initialDate = currentDate || firstDate;
      setSelectedMonth(getMonthKey(initialDate?.dateKey));
      setSelectedDate(initialDate?.dateKey || "");
      setSelectedSlot(currentSlot);
    } catch (loadError) {
      setError(loadError.message || "Meeting availability is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAvailability();
    // The modal is intentionally scoped to one conversation and one call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, conversationId, existingCall?.id]);

  const dates = availability?.dates || [];
  const availableMonths = useMemo(
    () => [...new Set(dates.map((date) => getMonthKey(date.dateKey)).filter(Boolean))],
    [dates],
  );
  const visibleMonth = availableMonths.includes(selectedMonth) ? selectedMonth : availableMonths[0] || "";
  const calendarDates = useMemo(
    () => dates.filter((date) => getMonthKey(date.dateKey) === visibleMonth),
    [dates, visibleMonth],
  );
  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth, calendarDates),
    [visibleMonth, calendarDates],
  );
  const activeDate = dates.find((date) => date.dateKey === selectedDate);
  const visibleMonthIndex = availableMonths.indexOf(visibleMonth);
  const title = isOwner && ownerAction === "propose"
    ? "Propose a meeting time"
    : isOwner
    ? existingCall?.status === "REQUESTED" && existingCall?.confirmation_required_by === "CUSTOMER" ? "Change proposed meeting time" : existingCall?.status === "REQUESTED" ? "Confirm online meeting" : "Reschedule online meeting"
    : existingCall ? "Reschedule online meeting" : "Schedule an online meeting";
  const actionLabel = isOwner && ownerAction === "propose"
    ? "Send time proposal"
    : isOwner && existingCall?.status === "REQUESTED" && existingCall?.confirmation_required_by === "CUSTOMER"
    ? "Send updated proposal"
    : isOwner && existingCall?.status === "REQUESTED"
    ? "Confirm meeting"
    : existingCall ? isOwner ? "Save new time" : "Request new time" : "Book meeting";
  const currentMeetingTime = getMeetingTime(existingCall);
  const isCurrentSelection = Boolean(selectedSlot && isSameTime(selectedSlot.startAt, currentMeetingTime));
  const needsDifferentTime = isCurrentSelection && (
    existingCall?.status === "SCHEDULED"
    || existingCall?.confirmation_required_by === "CUSTOMER"
  );
  const currentMeetingLabel = currentMeetingTime && availability?.business?.timezone
    ? formatMeetingDateTime(currentMeetingTime, availability.business.timezone)
    : "";
  const selectedLabel = useMemo(
    () => selectedSlot && availability?.business?.timezone ? formatMeetingDateTime(selectedSlot.startAt, availability.business.timezone) : "Choose a time",
    [selectedSlot, availability],
  );

  const handleDateChange = (date) => {
    setSelectedDate(date.dateKey);
    setSelectedSlot(null);
  };

  const handleMonthChange = (direction) => {
    const nextMonth = availableMonths[visibleMonthIndex + direction];
    if (!nextMonth) return;
    setSelectedMonth(nextMonth);
    setSelectedDate(dates.find((date) => getMonthKey(date.dateKey) === nextMonth)?.dateKey || "");
    setSelectedSlot(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedSlot || saving) return;
    setSaving(true);
    setError("");
    setWarning("");
    try {
      const action = isOwner && ownerAction === "propose"
        ? "propose"
        : isOwner
        ? existingCall?.status === "REQUESTED" && existingCall?.confirmation_required_by !== "CUSTOMER" ? "schedule" : "reschedule"
        : existingCall ? "reschedule" : "book";
      const result = await videoCallAction(action, {
        ...(action === "propose" ? { conversationId } : existingCall ? { callId: existingCall.id } : { conversationId }),
        scheduledAt: selectedSlot.startAt,
        customerNote: note.trim() || undefined,
        timezone: availability?.business?.timezone,
      });
      if (!result?.call?.id) throw new Error("The meeting was not saved. Please choose the time again.");
      setWarning(result.warning || "");
      onBooked?.(result.call);
    } catch (saveError) {
      setError(saveError.message || "That time is no longer available. Choose another slot.");
      await loadAvailability();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-labelledby="meeting-booking-title" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose?.()}>
      <form onSubmit={handleSubmit} className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="cmyk-bar shrink-0" />
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">{isOwner ? "Owner calendar" : "Meeting booking"}</p>
            <h2 id="meeting-booking-title" className="mt-1 text-xl font-black text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">Pick an open slot in the shop&apos;s local time.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close meeting booking" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#F6F6F2] p-5 sm:p-6">
          {error && <div role="alert" className="mb-4 border-l-4 border-[#EC008C] bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-800">{error}</div>}
          {warning && <div role="status" className="mb-4 border-l-4 border-[#FFF200] bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-800">{warning}</div>}
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading available times…</div>
          ) : !availability?.hasPublishedHours ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">This shop has not published meeting hours yet. Please message the shop for help.</div>
          ) : !dates.length ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-700">There are no available times in the current booking window. Try again later or message the shop.</div>
          ) : (
            <>
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <Clock3 size={17} className="shrink-0 text-[#00aeb5]" />
                <span><strong className="text-slate-900">{availability.settings.meeting_duration_minutes} minutes</strong> · {availability.business.timezone} · {getMeetingStatusLabel(existingCall?.status || "REQUESTED")}<small className="mt-1 block text-[10px] text-slate-500">Times inside the shop&apos;s {availability.settings.meeting_min_notice_minutes}-minute notice period are hidden.</small></span>
              </div>
              <div className="space-y-5">
                <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="meeting-month-heading">
                  <div className="flex items-center justify-between gap-3">
                    <p id="meeting-month-heading" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500"><Calendar size={14} /> 1. Choose a month</p>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => handleMonthChange(-1)} disabled={visibleMonthIndex <= 0} aria-label="Previous month" className="rounded-md border border-slate-200 p-1.5 text-slate-600 transition-colors hover:border-[#00aeb5] hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <span className="min-w-32 text-center text-sm font-extrabold text-slate-900">{formatMonthLabel(visibleMonth)}</span>
                      <button type="button" onClick={() => handleMonthChange(1)} disabled={visibleMonthIndex < 0 || visibleMonthIndex >= availableMonths.length - 1} aria-label="Next month" className="rounded-md border border-slate-200 p-1.5 text-slate-600 transition-colors hover:border-[#00aeb5] hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">Use the arrows to browse the shop&apos;s available months.</p>
                  <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">2. Choose a day</p>
                  <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-400" aria-hidden="true">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-1" aria-label={`${formatMonthLabel(visibleMonth)} calendar`}>
                    {calendarDays.map((calendarDay) => calendarDay.day ? (
                      <button
                        type="button"
                        key={calendarDay.key}
                        onClick={() => calendarDay.isAvailable && handleDateChange(calendarDay.date)}
                        disabled={!calendarDay.isAvailable}
                        aria-label={calendarDay.isAvailable ? `Choose ${calendarDay.date.label}` : `Day ${calendarDay.day} unavailable`}
                        aria-pressed={calendarDay.isAvailable && calendarDay.date?.dateKey === activeDate?.dateKey}
                        className={`min-h-12 rounded-lg border px-1 py-1.5 text-center transition-colors ${calendarDay.isAvailable && calendarDay.date?.dateKey === activeDate?.dateKey ? "border-[#00aeb5] bg-[#b8f0f2] text-slate-900 ring-2 ring-[#00aeb5]/25" : calendarDay.isAvailable ? "border-[#00aeb5] bg-[#dffafa] text-slate-900 hover:bg-[#c8f5f5]" : "cursor-not-allowed border-slate-400 bg-slate-300 text-slate-600 opacity-70"}`}
                      >
                        <span className="block text-xs font-extrabold">{calendarDay.day}</span>
                        {calendarDay.isAvailable && <span className="mt-0.5 block text-[9px] font-medium text-slate-500">{getAvailableSlotCount(calendarDay.date)} {getAvailableSlotCount(calendarDay.date) === 1 ? "slot" : "slots"}</span>}
                      </button>
                    ) : <span key={calendarDay.key} aria-hidden="true" />)}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="meeting-time-heading">
                  <p id="meeting-time-heading" className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">3. Choose a time</p>
                  {currentMeetingLabel && <div className="mt-3 rounded-lg border-l-4 border-[#00aeb5] bg-[#e8fbfb] px-3 py-2 text-xs text-slate-700"><span className="font-black text-slate-900">Current appointment:</span> {currentMeetingLabel}</div>}
                  {activeDate ? (
                    <>
                      <p className="mt-1 text-sm font-extrabold text-slate-900">{activeDate.label}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {activeDate.slots.map((slot) => {
                          const isSlotAvailable = slot.available !== false;
                          const isSelected = isSlotAvailable && selectedSlot?.startAt === slot.startAt;
                          const isCurrentSlot = isSameTime(slot.startAt, currentMeetingTime);
                          return (
                            <button
                              type="button"
                              key={slot.startAt}
                              onClick={() => isSlotAvailable && setSelectedSlot(slot)}
                              disabled={!isSlotAvailable}
                              aria-label={isSlotAvailable ? `Choose ${slot.label}` : `${slot.label} unavailable`}
                              aria-pressed={isSelected}
                              title={isSlotAvailable ? undefined : slot.unavailableReason || "Unavailable"}
                              className={`rounded-lg border px-3 py-2.5 text-center text-xs font-bold transition-colors ${isSelected ? "border-[#EC008C] bg-[#ffe4f2] text-slate-900 ring-2 ring-[#EC008C]/20" : isSlotAvailable ? "border-slate-200 bg-white text-slate-600 hover:border-[#EC008C]" : "cursor-not-allowed border-slate-400 bg-slate-300 text-slate-500 opacity-80"}`}
                            >
                              <span className="block">{slot.label}</span>
                              {isSelected && <span className="mt-0.5 block text-[9px] font-black uppercase tracking-wide text-[#b00069]">{isCurrentSlot ? "Current time" : "Selected"}</span>}
                              {!isSlotAvailable && <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide">Unavailable</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : <p className="mt-2 text-xs font-semibold text-slate-500">Select a cyan day above to see its open times.</p>}
                </section>
              </div>
              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{existingCall ? isCurrentSelection ? "Current meeting" : "New meeting time" : "Selected meeting"}</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">{selectedLabel}</p>
                <p className="mt-1 text-[11px] text-slate-500">{needsDifferentTime ? "Choose a different available time to reschedule this meeting." : isOwner && ownerAction === "propose" ? `The customer must accept this time. Only after confirmation will both participants receive the meeting details and secure call link in ${availability.business.timezone}.` : existingCall && selectedSlot ? isOwner && existingCall?.status === "REQUESTED" && existingCall?.confirmation_required_by !== "CUSTOMER" ? `This will confirm the requested appointment. Both participants will be emailed in ${availability.business.timezone}.` : isOwner ? `The customer must accept this proposed time. The reschedule email will be sent after confirmation in ${availability.business.timezone}.` : `The owner must confirm this new time. The reschedule email will be sent after confirmation in ${availability.business.timezone}.` : `This open time will be booked immediately. You and the shop will both receive an email in ${availability.business.timezone}.`}</p>
                <label className="mt-4 block text-xs font-bold text-slate-700">Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder="Tell the shop what you want to discuss" className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-[#00aeb5] focus:ring-2 focus:ring-[#00aeb5]/20" /></label>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={loading || saving || !selectedSlot || !dates.length || needsDifferentTime} title={!selectedSlot ? "Choose an available day and time first." : needsDifferentTime ? "Choose a different time to reschedule." : undefined} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-40">{saving && <Loader2 size={14} className="animate-spin" />}{saving ? "Saving…" : !selectedSlot || needsDifferentTime ? "Choose a new time" : actionLabel}<CheckCircle2 size={14} /></button>
        </div>
      </form>
    </div>
  );
}
