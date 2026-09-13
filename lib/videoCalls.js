import { supabase } from "@/lib/supabaseClient";

export const VIDEO_CALL_CAPABILITIES = [
  "camera",
  "microphone",
  "screen share",
  "chat",
  "raise hand",
  "tile view",
  "quality controls",
  "shared whiteboard",
  "image upload",
];

export const VIDEO_CALL_STATUS = {
  REQUESTED: "REQUESTED",
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  ENDED: "ENDED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
};

export async function videoCallAction(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session expired. Please sign in again.");

  const response = await fetch("/api/video-calls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to update the video call.");
  return result;
}

export async function videoCallQuery(query = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session expired. Please sign in again.");
  const params = new URLSearchParams(query);
  const response = await fetch(`/api/video-calls?${params.toString()}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Unable to load meeting availability.");
  return result;
}

export function getVideoCallWindow(call, { now = Date.now() } = {}) {
  if (!call?.scheduled_at) return { expired: false, joinable: false, upcoming: false };

  const nowMillis = new Date(now).getTime();
  const scheduledAt = new Date(call.scheduled_at).getTime();
  const expiresAt = call.expires_at
    ? new Date(call.expires_at).getTime()
    : scheduledAt + 30 * 60 * 1000;
  const availableFrom = call.available_from_at
    ? new Date(call.available_from_at).getTime()
    : scheduledAt - 15 * 60 * 1000;

  return {
    expired: call.status === VIDEO_CALL_STATUS.EXPIRED || call.status === VIDEO_CALL_STATUS.CANCELLED || call.status === VIDEO_CALL_STATUS.ENDED || nowMillis > expiresAt,
    joinable: call.status === VIDEO_CALL_STATUS.SCHEDULED || call.status === VIDEO_CALL_STATUS.LIVE
      ? nowMillis >= availableFrom && nowMillis <= expiresAt
      : false,
    upcoming: nowMillis < availableFrom,
    scheduledAt,
    expiresAt,
    availableFrom,
  };
}
