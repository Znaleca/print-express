"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Eraser,
  ImagePlus,
  Loader2,
  Pencil,
  Video,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  getUploadExtension,
  optimizeImageForUpload,
  resolveStorageUrl,
  toStorageRef,
} from "@/lib/imageUpload";
import { videoCallAction } from "@/lib/videoCalls";

const BOARD_BUCKET = "video-call-board";
const MAX_BOARD_IMAGE_COUNT = 5;
const BOARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const loadJitsiExternalApi = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("Video calls require a browser."));
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI);
  if (window.__pressPresentJitsiPromise) return window.__pressPresentJitsiPromise;

  window.__pressPresentJitsiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-press-present-jitsi="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.JitsiMeetExternalAPI));
      existing.addEventListener("error", () => reject(new Error("The video service could not be loaded.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.dataset.pressPresentJitsi = "true";
    script.onload = () => window.JitsiMeetExternalAPI
      ? resolve(window.JitsiMeetExternalAPI)
      : reject(new Error("The video service is unavailable right now."));
    script.onerror = () => reject(new Error("The video service could not be loaded. Check your connection."));
    document.head.appendChild(script);
  });

  return window.__pressPresentJitsiPromise;
};

const normalizePoint = (event, canvas) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1))),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(rect.height, 1))),
  };
};

function VideoCallModal({ callSession, onClose, participantLabel = "Print shop" }) {
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const strokeRef = useRef(null);
  const [jitsiState, setJitsiState] = useState("loading");
  const [jitsiError, setJitsiError] = useState("");
  const [deviceError, setDeviceError] = useState("");
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardEvents, setBoardEvents] = useState([]);
  const [previewStroke, setPreviewStroke] = useState(null);
  const [boardTool, setBoardTool] = useState("pen");
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardSaving, setBoardSaving] = useState(false);
  const [boardOnline, setBoardOnline] = useState(true);
  const [boardUser, setBoardUser] = useState(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const drawEvents = useCallback((events, preview = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#eef1f4";
    context.lineWidth = 1;
    for (let x = 24; x < width; x += 24) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 24; y < height; y += 24) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    const lastClearIndex = events.reduce((index, event, currentIndex) => (
      event.event_type === "clear" ? currentIndex : index
    ), -1);
    const visibleEvents = events.slice(lastClearIndex + 1);

    visibleEvents.forEach((event) => {
      if (event.event_type === "stroke") {
        const points = Array.isArray(event.payload?.points) ? event.payload.points : [];
        if (!points.length) return;
        context.beginPath();
        points.forEach((point, index) => {
          const x = point.x * width;
          const y = point.y * height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.strokeStyle = event.payload?.color || "#111827";
        context.lineWidth = Number(event.payload?.width || 3);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.stroke();
      }

      if (event.event_type === "image" && event.resolvedUrl) {
        const image = new Image();
        image.onload = () => {
          const x = Number(event.payload?.x || 0.25) * width;
          const y = Number(event.payload?.y || 0.25) * height;
          const imageWidth = Math.min(width * 0.55, Number(event.payload?.width || 0.45) * width);
          const imageHeight = Math.min(height * 0.55, Number(event.payload?.height || 0.35) * height);
          context.save();
          context.shadowColor = "rgba(15, 23, 42, .16)";
          context.shadowBlur = 10;
          context.drawImage(image, x, y, imageWidth, imageHeight);
          context.restore();
        };
        image.src = event.resolvedUrl;
      }
    });

    if (preview?.length) {
      context.beginPath();
      preview.forEach((point, index) => {
        const x = point.x * width;
        const y = point.y * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = "#ec008c";
      context.lineWidth = 3;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    }
  }, []);

  const resizeBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawEvents(boardEvents, previewStroke);
  }, [boardEvents, drawEvents, previewStroke]);

  useEffect(() => {
    if (!boardOpen) return undefined;
    const observer = new ResizeObserver(resizeBoard);
    if (canvasRef.current) observer.observe(canvasRef.current);
    resizeBoard();
    return () => observer.disconnect();
  }, [boardOpen, resizeBoard]);

  useEffect(() => {
    drawEvents(boardEvents, previewStroke);
  }, [boardEvents, drawEvents, previewStroke]);

  useEffect(() => {
    let active = true;
    const setupBoard = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      setBoardUser(user);
      setBoardLoading(true);

      const { data, error } = await supabase
        .from("video_call_board_events")
        .select("id, video_call_id, event_type, created_by, payload, created_at")
        .eq("video_call_id", callSession.callId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (error) {
        setBoardOnline(false);
        setBoardLoading(false);
        return;
      }

      const resolvedEvents = await Promise.all((data || []).map(async (event) => ({
        ...event,
        resolvedUrl: event.event_type === "image" ? await resolveStorageUrl(event.payload?.storage_ref) : null,
      })));
      if (active) {
        setBoardEvents(resolvedEvents);
        setBoardOnline(true);
        setBoardLoading(false);
      }
    };

    setupBoard();
    const channel = supabase
      .channel(`video-board:${callSession.callId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "video_call_board_events", filter: `video_call_id=eq.${callSession.callId}` },
        async (payload) => {
          const event = payload.new;
          if (!event?.id) return;
          const nextEvent = {
            ...event,
            resolvedUrl: event.event_type === "image" ? await resolveStorageUrl(event.payload?.storage_ref) : null,
          };
          setBoardEvents((current) => current.some((item) => item.id === nextEvent.id) ? current : [...current, nextEvent]);
          setBoardOnline(true);
        }
      )
      .subscribe((status) => setBoardOnline(status === "SUBSCRIBED"));

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [callSession.callId]);

  useEffect(() => {
    let active = true;
    const initJitsi = async () => {
      try {
        setJitsiState("loading");
        const JitsiMeetExternalAPI = await loadJitsiExternalApi();
        if (!active || !jitsiContainerRef.current) return;

        const api = new JitsiMeetExternalAPI("meet.jit.si", {
          roomName: callSession.roomName,
          parentNode: jitsiContainerRef.current,
          width: "100%",
          height: "100%",
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            DISPLAY_WELCOME_PAGE_CONTENT: false,
            TOOLBAR_BUTTONS: [
              "microphone", "camera", "desktop", "fullscreen", "fodeviceselection",
              "hangup", "chat", "settings", "raisehand", "videoquality", "filmstrip", "tileview",
            ],
          },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            hideConferenceSubject: true,
            prejoinPageEnabled: false,
          },
        });

        jitsiApiRef.current = api;
        api.addEventListener("videoConferenceJoined", () => setJitsiState("live"));
        api.addEventListener("videoConferenceLeft", () => setJitsiState("ready"));
        api.addEventListener("readyToClose", () => {
          void videoCallAction("end", { callId: callSession.callId }).finally(() => onCloseRef.current?.());
        });
        api.addEventListener("error", () => {
          setJitsiState("error");
          setJitsiError("The video service reported an error. You can try joining again.");
        });
        api.addEventListener("cameraError", () => setDeviceError("Camera access was blocked. Check your browser permissions or continue with audio only."));
        api.addEventListener("micError", () => setDeviceError("Microphone access was blocked. Check your browser permissions or continue muted."));
        setJitsiState("ready");
      } catch (error) {
        if (active) {
          setJitsiState("error");
          setJitsiError(error.message || "The video service could not be loaded.");
        }
      }
    };

    initJitsi();
    return () => {
      active = false;
      if (jitsiApiRef.current) {
        try { jitsiApiRef.current.dispose(); } catch (_) {}
        jitsiApiRef.current = null;
      }
    };
  }, [callSession.roomName]);

  const checkDevices = async () => {
    setDeviceError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceError("Your browser does not support camera and microphone checks. You can still try joining the call.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      setDeviceError("");
    } catch (_) {
      setDeviceError("Camera or microphone permission was denied. Open your browser site settings to allow access, or join with devices muted.");
    }
  };

  const saveBoardEvent = async (eventType, payload) => {
    if (!boardUser) return;
    setBoardSaving(true);
    const { data, error } = await supabase
      .from("video_call_board_events")
      .insert({ video_call_id: callSession.callId, event_type: eventType, created_by: boardUser.id, payload })
      .select("id, video_call_id, event_type, created_by, payload, created_at")
      .single();
    if (error) {
      setBoardOnline(false);
      window.alert(error.message || "The board update could not be saved.");
    } else if (data) {
      const resolvedUrl = eventType === "image" ? await resolveStorageUrl(payload.storage_ref) : null;
      setBoardEvents((current) => current.some((item) => item.id === data.id) ? current : [...current, { ...data, resolvedUrl }]);
    }
    setBoardSaving(false);
  };

  const handlePointerDown = (event) => {
    if (boardTool !== "pen" || !canvasRef.current) return;
    canvasRef.current.setPointerCapture(event.pointerId);
    strokeRef.current = [normalizePoint(event, canvasRef.current)];
    setPreviewStroke(strokeRef.current);
  };

  const handlePointerMove = (event) => {
    if (!strokeRef.current || !canvasRef.current) return;
    strokeRef.current = [...strokeRef.current, normalizePoint(event, canvasRef.current)];
    setPreviewStroke(strokeRef.current);
  };

  const handlePointerUp = async () => {
    if (!strokeRef.current) return;
    const points = strokeRef.current;
    strokeRef.current = null;
    setPreviewStroke(null);
    if (points.length > 1) await saveBoardEvent("stroke", { points, color: "#111827", width: 3 });
  };

  const handleBoardImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !boardUser) return;
    const imageCount = boardEvents.filter((item) => item.event_type === "image").length;
    if (imageCount >= MAX_BOARD_IMAGE_COUNT) {
      window.alert(`You can add up to ${MAX_BOARD_IMAGE_COUNT} images to one board.`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      window.alert("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    try {
      const optimized = await optimizeImageForUpload(file, { maxBytes: BOARD_IMAGE_MAX_BYTES, maxDimension: 1600 });
      const extension = getUploadExtension(optimized);
      const path = `${callSession.callId}/${boardUser.id}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(BOARD_BUCKET).upload(path, optimized, {
        upsert: false,
        cacheControl: "3600",
        contentType: optimized.type,
      });
      if (uploadError) throw uploadError;
      await saveBoardEvent("image", {
        storage_ref: toStorageRef(BOARD_BUCKET, path),
        file_name: file.name,
        x: 0.25,
        y: 0.22,
        width: 0.5,
        height: 0.42,
      });
    } catch (error) {
      window.alert(error.message || "The board image could not be uploaded.");
    }
  };

  const clearBoard = () => saveBoardEvent("clear", {});

  const closeCall = async () => {
    try { await videoCallAction("end", { callId: callSession.callId }); } catch (_) {}
    onCloseRef.current?.();
  };

  return (
    <div className="fixed inset-0 z-[999] flex flex-col bg-slate-950/95 text-white backdrop-blur-sm">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-cyan-300/30 bg-[#151922] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center bg-cyan-300 text-slate-950"><Video size={18} /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase tracking-[0.12em] text-white">Live proofing call</p>
            <p className="truncate text-[11px] text-slate-400">{participantLabel} · protected app invite</p>
          </div>
          <span className={`hidden items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide sm:flex ${jitsiState === "live" ? "text-emerald-300" : "text-slate-400"}`}>
            {jitsiState === "error" ? <WifiOff size={13} /> : <Wifi size={13} />}
            {jitsiState === "loading" ? "Loading" : jitsiState === "error" ? "Needs attention" : jitsiState === "live" ? "Connected" : "Ready"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setBoardOpen((value) => !value)} className={`inline-flex items-center gap-2 border px-3 py-2 text-xs font-bold transition-colors ${boardOpen ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/20 bg-white/5 text-white hover:border-cyan-300"}`}>
            <Pencil size={15} /> {boardOpen ? "Hide board" : "Whiteboard"}
          </button>
          <button type="button" onClick={closeCall} className="inline-flex items-center gap-2 bg-[#ec008c] px-3 py-2 text-xs font-black text-white hover:bg-[#fff200] hover:text-slate-950">
            <X size={15} /> End call
          </button>
        </div>
      </header>

      {(jitsiError || deviceError) && (
        <div className="flex shrink-0 items-start gap-3 border-b border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs text-amber-100 sm:px-6">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <div className="flex-1"><p className="font-bold">{jitsiError || "Check your devices"}</p><p className="mt-0.5 text-amber-100/70">{deviceError || "You can close and try again, or continue if the call is already connected."}</p></div>
          {!deviceError && <button type="button" onClick={checkDevices} className="border border-amber-200/40 px-3 py-1.5 font-bold hover:bg-amber-200/10">Check camera & mic</button>}
        </div>
      )}

      <div className={`min-h-0 flex-1 ${boardOpen ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,42%)]" : "block"}`}>
        <div className="relative min-h-[320px] h-full bg-[#0b0e14]">
          {jitsiState === "loading" && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-xs text-slate-400"><Loader2 className="mx-auto mb-2 animate-spin text-cyan-300" size={26} />Connecting you securely to the call…</div>}
          {jitsiState === "error" && <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center"><div className="max-w-sm"><AlertTriangle className="mx-auto mb-3 text-amber-300" size={32} /><p className="font-bold text-white">The video service is unavailable</p><p className="mt-1 text-xs text-slate-400">Close this window and try again. Your conversation and board notes remain saved.</p></div></div>}
          <div ref={jitsiContainerRef} className="h-full w-full" />
        </div>

        {boardOpen && (
          <aside className="flex min-h-[360px] flex-col border-t border-white/10 bg-[#f6f6f2] text-slate-900 lg:border-l lg:border-t-0">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#00aeb5]">Shared board</p><p className="mt-0.5 text-xs text-slate-500">Sketch proofs and add reference images together.</p></div>
              <span className={`text-[10px] font-bold uppercase ${boardOnline ? "text-emerald-600" : "text-amber-600"}`}>{boardOnline ? "Synced" : "Offline"}</span>
            </div>
            <div className="relative min-h-0 flex-1 p-3">
              {boardLoading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-xs text-slate-500"><Loader2 className="mr-2 animate-spin text-[#ec008c]" size={18} />Loading board…</div>}
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="h-full min-h-[300px] w-full touch-none border border-slate-300 bg-white shadow-inner"
                aria-label="Shared proofing whiteboard"
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-3">
              <button type="button" onClick={() => setBoardTool("pen")} className={`inline-flex items-center gap-1.5 border px-3 py-2 text-xs font-bold ${boardTool === "pen" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:border-slate-900"}`}><Pencil size={14} /> Draw</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={boardSaving} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#ec008c] hover:text-[#ec008c] disabled:opacity-50"><ImagePlus size={14} /> Add image</button>
              <button type="button" onClick={clearBoard} disabled={boardSaving} className="ml-auto inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:border-amber-500 hover:text-amber-700 disabled:opacity-50"><Eraser size={14} /> Clear</button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleBoardImage} className="hidden" />
            </div>
            <p className="shrink-0 px-3 pb-3 text-[10px] text-slate-400">Up to {MAX_BOARD_IMAGE_COUNT} images · optimized to 5 MB · board changes are saved for this call.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

export default VideoCallModal;
