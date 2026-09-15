export const DEFAULT_MEETING_SETTINGS = Object.freeze({
  meeting_enabled: true,
  meeting_duration_minutes: 30,
  meeting_buffer_minutes: 15,
  meeting_min_notice_minutes: 20,
  meeting_max_days_ahead: 30,
  meeting_slot_interval_minutes: 30,
  meeting_requires_approval: false,
});

export const MINIMUM_MEETING_NOTICE_MINUTES = 5;

const pad = (value) => String(value).padStart(2, "0");

export function getZonedParts(value, timeZone = "Asia/Manila") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const result = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(result.year),
    month: Number(result.month),
    day: Number(result.day),
    hour: Number(result.hour),
    minute: Number(result.minute),
    second: Number(result.second),
  };
}

export function formatMeetingDateKey(value, timeZone = "Asia/Manila") {
  const parts = getZonedParts(value, timeZone);
  return parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : "";
}

export function getTimeZoneOffsetMs(value, timeZone = "Asia/Manila") {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getZonedParts(date, timeZone);
  if (!parts) return 0;
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

export function zonedDateTimeToUtc(dateKey, time, timeZone = "Asia/Manila") {
  const dateMatch = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMillis = wallClock - getTimeZoneOffsetMs(new Date(wallClock), timeZone);
  // Recalculate once for DST transitions where the first offset lands on the other side.
  utcMillis = wallClock - getTimeZoneOffsetMs(new Date(utcMillis), timeZone);
  const result = new Date(utcMillis);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

export function formatMeetingDateTime(value, timeZone = "Asia/Manila", options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
    ...options,
  }).format(date);
}

export function formatMeetingCountdown(value, now = new Date()) {
  const startMillis = new Date(value || "").getTime();
  const nowMillis = new Date(now || "").getTime();
  if (!Number.isFinite(startMillis) || !Number.isFinite(nowMillis)) return "";

  const remainingMinutes = Math.max(0, Math.ceil((startMillis - nowMillis) / 60000));
  if (remainingMinutes <= 0) return "starting now";
  if (remainingMinutes < 60) return remainingMinutes === 1 ? "1 minute" : `${remainingMinutes} minutes`;

  const hours = Math.floor(remainingMinutes / 60);
  const minutesLeft = remainingMinutes % 60;
  if (hours < 24) {
    const hourText = hours === 1 ? "1 hour" : `${hours} hours`;
    return minutesLeft ? `${hourText}, ${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"}` : hourText;
  }

  const days = Math.floor(hours / 24);
  const hoursLeft = hours % 24;
  const dayText = days === 1 ? "1 day" : `${days} days`;
  return hoursLeft ? `${dayText}, ${hoursLeft} ${hoursLeft === 1 ? "hour" : "hours"}` : dayText;
}

export function findUpcomingMeetingWithin(calls = [], { now = new Date(), withinMinutes = 60 } = {}) {
  const nowMillis = new Date(now || "").getTime();
  const windowMillis = Number(withinMinutes) * 60 * 1000;
  if (!Number.isFinite(nowMillis) || !Number.isFinite(windowMillis) || windowMillis < 0) return null;

  return calls
    .filter((call) => ["SCHEDULED", "LIVE"].includes(call?.status))
    .map((call) => ({ call, startMillis: new Date(call?.scheduled_at || "").getTime() }))
    .filter(({ startMillis }) => Number.isFinite(startMillis) && startMillis >= nowMillis && startMillis <= nowMillis + windowMillis)
    .sort((left, right) => left.startMillis - right.startMillis)[0]?.call || null;
}

export function normalizeMeetingSettings(source = {}) {
  const settings = { ...DEFAULT_MEETING_SETTINGS };
  for (const key of Object.keys(DEFAULT_MEETING_SETTINGS)) {
    if (key === "meeting_enabled" || key === "meeting_requires_approval") {
      if (source[key] !== undefined) settings[key] = source[key] !== false;
    } else if (key === "meeting_min_notice_minutes") {
      if (source[key] !== undefined && Number.isFinite(Number(source[key]))) {
        settings[key] = Math.max(MINIMUM_MEETING_NOTICE_MINUTES, Math.round(Number(source[key])));
      }
    } else if (source[key] !== undefined && Number.isFinite(Number(source[key]))) {
      settings[key] = Math.round(Number(source[key]));
    }
  }
  return settings;
}

export function validateMeetingSettings(source = {}) {
  const settings = normalizeMeetingSettings(source);
  const errors = {};
  if (![15, 30, 45, 60].includes(settings.meeting_duration_minutes)) errors.meeting_duration_minutes = "Choose a meeting length of 15, 30, 45, or 60 minutes.";
  if (settings.meeting_buffer_minutes < 0 || settings.meeting_buffer_minutes > 240) errors.meeting_buffer_minutes = "Buffer time must be between 0 and 240 minutes.";
  if (settings.meeting_min_notice_minutes < MINIMUM_MEETING_NOTICE_MINUTES || settings.meeting_min_notice_minutes > 10080) errors.meeting_min_notice_minutes = "Minimum notice must be between 5 minutes and seven days.";
  if (settings.meeting_max_days_ahead < 1 || settings.meeting_max_days_ahead > 180) errors.meeting_max_days_ahead = "The booking window must be between 1 and 180 days.";
  if (settings.meeting_slot_interval_minutes < 5 || settings.meeting_slot_interval_minutes > 120) errors.meeting_slot_interval_minutes = "Slot spacing must be between 5 and 120 minutes.";
  return { settings, errors, valid: Object.keys(errors).length === 0 };
}

function minutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function dateFromKey(dateKey, dayOffset = 0) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dayOfWeek(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function localTimeForOffset(dateKey, totalMinutes) {
  const dayOffset = Math.floor(totalMinutes / 1440);
  const minuteOfDay = totalMinutes % 1440;
  return {
    dateKey: dateFromKey(dateKey, dayOffset),
    time: `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`,
  };
}

function busyIntervals(bookedCalls = [], settings, excludeCallId) {
  return bookedCalls
    .filter((call) => call?.id !== excludeCallId && ["REQUESTED", "SCHEDULED", "LIVE"].includes(call?.status))
    .map((call) => {
      const start = new Date(call.scheduled_at || call.requested_slot_at || "").getTime();
      const duration = Number(call.duration_minutes || settings.meeting_duration_minutes) || settings.meeting_duration_minutes;
      const buffer = Number(call.buffer_minutes ?? settings.meeting_buffer_minutes) || 0;
      return { start, end: start + (duration + buffer) * 60 * 1000 };
    })
    .filter((interval) => Number.isFinite(interval.start));
}

export function buildMeetingSlots({
  timeZone = "Asia/Manila",
  hours = [],
  settings: rawSettings = {},
  bookedCalls = [],
  dateOverrides = [],
  excludeCallId = null,
  includeBlockedSlots = false,
  now = new Date(),
} = {}) {
  const { settings, valid } = validateMeetingSettings(rawSettings);
  if (!valid || !settings.meeting_enabled) return [];
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMillis = nowDate.getTime();
  const earliest = nowMillis + Math.max(MINIMUM_MEETING_NOTICE_MINUTES, settings.meeting_min_notice_minutes) * 60 * 1000;
  const latest = nowMillis + settings.meeting_max_days_ahead * 24 * 60 * 60 * 1000;
  const startKey = formatMeetingDateKey(nowDate, timeZone);
  if (!startKey) return [];
  const intervals = busyIntervals(bookedCalls, settings, excludeCallId);
  const overrideByDate = new Map(dateOverrides.map((row) => [String(row.available_date), row]));
  const result = new Map();

  for (let offset = 0; offset <= settings.meeting_max_days_ahead; offset += 1) {
    const baseDateKey = dateFromKey(startKey, offset);
    const dateOverride = overrideByDate.get(baseDateKey);
    const matchingHours = dateOverride
      ? dateOverride.is_available
        ? [{ opens_at: dateOverride.opens_at, closes_at: dateOverride.closes_at, is_closed: false }]
        : []
      : hours.filter((row) => Number(row.day_of_week) === dayOfWeek(baseDateKey) && !row.is_closed);
    for (const row of matchingHours) {
      const open = minutes(row.opens_at);
      const close = minutes(row.closes_at);
      if (open === null || close === null) continue;
      const endOfWindow = close > open ? close : close + 1440;
      for (let slotMinutes = open; slotMinutes + settings.meeting_duration_minutes <= endOfWindow; slotMinutes += settings.meeting_slot_interval_minutes) {
        const local = localTimeForOffset(baseDateKey, slotMinutes);
        const startAt = zonedDateTimeToUtc(local.dateKey, local.time, timeZone);
        if (!startAt) continue;
        const startMillis = new Date(startAt).getTime();
        const endMillis = startMillis + (settings.meeting_duration_minutes + settings.meeting_buffer_minutes) * 60 * 1000;
        if (startMillis < earliest || startMillis > latest) continue;
        const isBlocked = intervals.some((busy) => startMillis < busy.end && endMillis > busy.start);
        if (isBlocked && !includeBlockedSlots) continue;
        const dateEntry = result.get(local.dateKey) || {
          dateKey: local.dateKey,
          label: new Intl.DateTimeFormat(undefined, { timeZone, weekday: "short", month: "short", day: "numeric" }).format(new Date(startMillis)),
          slots: [],
        };
        dateEntry.slots.push({
          startAt,
          dateKey: local.dateKey,
          time: local.time,
          label: formatMeetingDateTime(startAt, timeZone, { dateStyle: undefined, timeStyle: "short" }),
          timezone: timeZone,
          durationMinutes: settings.meeting_duration_minutes,
          available: !isBlocked,
          unavailableReason: isBlocked ? "This time is already reserved" : null,
        });
        result.set(local.dateKey, dateEntry);
      }
    }
  }
  return [...result.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

export function isMeetingStartBookable(startAt, { now = new Date(), minimumNoticeMinutes = DEFAULT_MEETING_SETTINGS.meeting_min_notice_minutes } = {}) {
  const startMillis = new Date(startAt || "").getTime();
  const nowMillis = new Date(now || "").getTime();
  if (!Number.isFinite(startMillis) || !Number.isFinite(nowMillis)) return false;
  const noticeMinutes = Math.max(MINIMUM_MEETING_NOTICE_MINUTES, Number(minimumNoticeMinutes) || MINIMUM_MEETING_NOTICE_MINUTES);
  return startMillis >= nowMillis + noticeMinutes * 60 * 1000;
}

export function getMeetingStatusLabel(status) {
  return {
    REQUESTED: "Awaiting confirmation",
    SCHEDULED: "Confirmed",
    LIVE: "In progress",
    ENDED: "Completed",
    CANCELLED: "Cancelled",
    EXPIRED: "Expired",
  }[status] || "Meeting";
}
