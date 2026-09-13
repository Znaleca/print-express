"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Video } from "lucide-react";
import VideoCallModal from "@/components/VideoCallModal";
import { videoCallAction } from "@/lib/videoCalls";
import { supabase } from "@/lib/supabaseClient";

export default function DirectMeetingPage() {
  const params = useParams();
  const router = useRouter();
  const callId = typeof params?.id === "string" ? params.id : "";
  const joinPromiseRef = useRef(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [callSession, setCallSession] = useState(null);
  const [participantLabel, setParticipantLabel] = useState("Online meeting");
  const [returnPath, setReturnPath] = useState("/browse");

  useEffect(() => {
    if (!callId) {
      setState("error");
      setError("This meeting link is incomplete.");
      return undefined;
    }

    let active = true;
    const openMeeting = async () => {
      setState("loading");
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          const nextPath = `/meeting/${encodeURIComponent(callId)}`;
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }

        if (!joinPromiseRef.current || joinPromiseRef.current.callId !== callId) {
          joinPromiseRef.current = { callId, promise: videoCallAction("join", { callId }) };
        }
        const result = await joinPromiseRef.current.promise;
        const call = result?.call;
        if (!call?.room_name) throw new Error("The secure meeting room is unavailable.");
        if (!active) return;

        const isOwner = call.owner_id === session.user.id && call.customer_id !== session.user.id;
        setParticipantLabel(isOwner ? "Customer meeting" : "Print shop meeting");
        setReturnPath(isOwner ? "/owner/calendar" : "/browse");
        setCallSession({ callId: call.id, roomName: call.room_name });
        setState("ready");
      } catch (joinError) {
        if (!active) return;
        setState("error");
        setError(joinError.message || "This meeting cannot be joined yet.");
      }
    };

    openMeeting();
    return () => {
      active = false;
    };
  }, [callId, router]);

  if (callSession) {
    return <VideoCallModal callSession={callSession} participantLabel={participantLabel} onClose={() => router.replace(returnPath)} />;
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#F6F6F2] px-4 py-12 text-slate-900">
      <section className="w-full max-w-md border border-[#D8D6CE] bg-white p-6 shadow-sm sm:p-8" aria-live="polite">
        <div className="cmyk-bar -mx-6 -mt-6 mb-6 sm:-mx-8 sm:-mt-8" />
        {state === "loading" ? (
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-slate-950 text-[#00FFFF]"><Loader2 className="animate-spin" size={22} /></div>
            <h1 className="mt-5 text-xl font-black">Opening your secure meeting</h1>
            <p className="mt-2 text-sm text-slate-500">Checking your invitation and joining the protected call…</p>
          </div>
        ) : (
          <div role="alert" className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center bg-rose-100 text-rose-600"><AlertTriangle size={22} /></div>
            <h1 className="mt-5 text-xl font-black">Meeting unavailable</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{error}</p>
            <p className="mt-3 text-xs text-slate-500">Scheduled calls open 15 minutes before the meeting time. Please sign in with the invited customer or shop-owner account.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 bg-slate-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-[#EC008C]"><Video size={14} /> Try again</button>
              <Link href={returnPath} className="inline-flex items-center gap-2 border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-slate-950"><ArrowLeft size={14} /> Leave meeting</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
