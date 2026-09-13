"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Clock3, Loader2, Video } from "lucide-react";
import VideoCallModal from "@/components/VideoCallModal";
import { formatMeetingCountdown, formatMeetingDateTime } from "@/lib/meetingScheduling";
import { getVideoCallWindow, videoCallAction, videoCallQuery } from "@/lib/videoCalls";
import { supabase } from "@/lib/supabaseClient";

const TERMINAL_STATUSES = new Set(["ENDED", "CANCELLED", "EXPIRED"]);

export default function DirectMeetingPage() {
  const params = useParams();
  const router = useRouter();
  const callId = typeof params?.id === "string" ? params.id : "";
  const joinPromiseRef = useRef(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [meeting, setMeeting] = useState(null);
  const [callSession, setCallSession] = useState(null);
  const [participantLabel, setParticipantLabel] = useState("Online meeting");
  const [returnPath, setReturnPath] = useState("/browse");
  const [now, setNow] = useState(() => Date.now());

  const openSecureMeeting = useCallback(async (selectedMeeting) => {
    if (!selectedMeeting?.id) return;
    setState("joining");
    setError("");
    try {
      if (!joinPromiseRef.current || joinPromiseRef.current.callId !== selectedMeeting.id) {
        joinPromiseRef.current = { callId: selectedMeeting.id, promise: videoCallAction("join", { callId: selectedMeeting.id }) };
      }
      const result = await joinPromiseRef.current.promise;
      const call = result?.call;
      if (!call?.room_name) throw new Error("The secure meeting room is unavailable.");
      setCallSession({ callId: call.id, roomName: call.room_name });
      setState("ready");
    } catch (joinError) {
      joinPromiseRef.current = null;
      setState("error");
      setError(joinError.message || "This meeting cannot be joined yet.");
    }
  }, []);

  useEffect(() => {
    if (!callId) {
      setState("error");
      setError("This meeting link is incomplete.");
      return undefined;
    }

    let active = true;
    const loadMeeting = async () => {
      setState("loading");
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          const nextPath = `/meeting/${encodeURIComponent(callId)}`;
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }

        const result = await videoCallQuery({ view: "meeting", callId });
        const selectedMeeting = result?.call;
        if (!selectedMeeting?.id) throw new Error("Meeting details are unavailable.");
        if (!active) return;

        const isOwner = selectedMeeting.owner_id === session.user.id && selectedMeeting.customer_id !== session.user.id;
        setParticipantLabel(isOwner ? "Customer meeting" : selectedMeeting.business_name || "Print shop meeting");
        setReturnPath(isOwner ? "/owner/calendar" : "/messages");
        setMeeting(selectedMeeting);
        setNow(Date.now());

        if (selectedMeeting.status === "REQUESTED") {
          setState("pending");
          return;
        }
        if (TERMINAL_STATUSES.has(selectedMeeting.status)) {
          setState("ended");
          return;
        }

        const callWindow = getVideoCallWindow(selectedMeeting);
        if (callWindow.expired) setState("ended");
        else if (callWindow.joinable) await openSecureMeeting(selectedMeeting);
        else setState("waiting");
      } catch (loadError) {
        if (!active) return;
        setState("error");
        setError(loadError.message || "This meeting cannot be opened.");
      }
    };

    loadMeeting();
    return () => {
      active = false;
    };
  }, [callId, openSecureMeeting, router]);

  useEffect(() => {
    if (state !== "waiting") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "waiting" || !meeting) return;
    const callWindow = getVideoCallWindow(meeting, { now });
    if (callWindow.expired) setState("ended");
    else if (callWindow.joinable) openSecureMeeting(meeting);
  }, [meeting, now, openSecureMeeting, state]);

  if (callSession) {
    return <VideoCallModal callSession={callSession} participantLabel={participantLabel} onClose={() => router.replace(returnPath)} />;
  }

  const scheduledAt = meeting?.scheduled_at || meeting?.requested_slot_at;
  const timeZone = meeting?.timezone || meeting?.booking_timezone || "Asia/Manila";
  const countdown = scheduledAt ? formatMeetingCountdown(scheduledAt, now) : "";

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#F6F6F2] px-4 py-12 text-slate-900">
      <section className="w-full max-w-md border border-[#D8D6CE] bg-white p-6 shadow-sm sm:p-8" aria-live="polite">
        <div className="cmyk-bar -mx-6 -mt-6 mb-6 sm:-mx-8 sm:-mt-8" />

        {state === "loading" || state === "joining" ? (
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-slate-950 text-[#00FFFF]"><Loader2 className="animate-spin" size={22} /></div>
            <h1 className="mt-5 text-xl font-black">{state === "joining" ? "Joining your secure meeting" : "Opening your meeting"}</h1>
            <p className="mt-2 text-sm text-slate-500">{state === "joining" ? "The private call room is opening now…" : "Checking your invitation and scheduled time…"}</p>
          </div>
        ) : state === "waiting" ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center bg-cyan-100 text-[#007d83]"><Clock3 size={22} /></div>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-[#EC008C]">Upcoming online meeting</p>
            <h1 className="mt-2 text-2xl font-black">Meeting starts in {countdown || "a moment"}</h1>
            <p className="mt-3 text-sm font-bold text-slate-700">{formatMeetingDateTime(scheduledAt, timeZone)}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">This page will open the secure call automatically when the join window begins, 15 minutes before the scheduled time.</p>
            <Link href={returnPath} className="mt-6 inline-flex items-center gap-2 border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-slate-950"><ArrowLeft size={14} /> Leave for now</Link>
          </div>
        ) : state === "pending" ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center bg-amber-100 text-amber-700"><CalendarClock size={22} /></div>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-[#EC008C]">Meeting request received</p>
            <h1 className="mt-2 text-2xl font-black">Waiting for shop confirmation</h1>
            {scheduledAt && <p className="mt-3 text-sm font-bold text-slate-700">Requested for {formatMeetingDateTime(scheduledAt, timeZone)}</p>}
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Keep this private link. It will open the same meeting after the shop confirms the request.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 bg-slate-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-[#EC008C]"><CheckCircle2 size={14} /> Check status</button>
              <Link href={returnPath} className="inline-flex items-center gap-2 border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-slate-950"><ArrowLeft size={14} /> Leave meeting</Link>
            </div>
          </div>
        ) : (
          <div role="alert" className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center bg-rose-100 text-rose-600"><AlertTriangle size={22} /></div>
            <h1 className="mt-5 text-xl font-black">{state === "ended" ? "Meeting is no longer available" : "Meeting unavailable"}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{state === "ended" ? "This meeting was completed, cancelled, or its call window has ended." : error}</p>
            <p className="mt-3 text-xs text-slate-500">Please sign in with the invited customer or shop-owner account.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {state !== "ended" && <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 bg-slate-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-[#EC008C]"><Video size={14} /> Try again</button>}
              <Link href={returnPath} className="inline-flex items-center gap-2 border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-slate-950"><ArrowLeft size={14} /> Leave meeting</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
