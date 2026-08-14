"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Send, Loader2, User, Store,
  ChevronRight, ChevronLeft, ImagePlus, Pencil, Trash2, Check, X, MoreVertical, Video, Calendar, MapPin, Sparkles, CheckCircle2, ArrowRight, FileText
} from "lucide-react";

const DESIGN_FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,image/svg+xml,.ai,.psd,.eps,.tif,.tiff";
const DESIGN_MAX_BYTES = 50 * 1024 * 1024;

const formatBytes = (bytes = 0) => {
  if (!bytes) return "0 KB";
  const units = ["bytes", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const getUploadProfile = (file) => {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const mime = file.type || "application/octet-stream";
  const fileType = mime.startsWith("image/") ? "Artwork image" : mime === "application/pdf" ? "Print PDF" : "Source design file";
  const quality = mime.startsWith("image/") || mime === "application/pdf"
    ? "Use 300 DPI or vector-quality artwork with embedded fonts and CMYK-safe colors."
    : "Source file accepted for prepress review; export proof PDF before production.";

  return { extension, mime, fileType, quality };
};

const GENERATED_PRINT_QUESTIONS = [
  {
    key: "file_check",
    label: "Check my file before printing",
    customerText: "Can you check if my file is print-ready before I place the order?",
    reply: "Yes. Please upload the file here and we can check resolution, bleed, margins, font issues, and whether it is suitable for production.",
  },
  {
    key: "color_match",
    label: "Will colors match my screen?",
    customerText: "Will the printed colors match what I see on my screen?",
    reply: "Screen colors can differ from print output. For important colors, ask for a proof and specify CMYK-safe colors or a printed sample before full production.",
  },
  {
    key: "bleed_margin",
    label: "Do I need bleed or margins?",
    customerText: "Do I need to add bleed, crop marks, or safe margins to my design?",
    reply: "For trimmed prints, include at least 3mm bleed and keep important text/logos inside the safe margin. We can review your uploaded file before printing.",
  },
  {
    key: "paper_finish",
    label: "Best paper or finish?",
    customerText: "Which paper, material, or finish is best for my design and budget?",
    reply: "Send the product type, size, use case, and budget range. We can recommend bond, glossy, matte cardstock, sticker, vinyl, or other materials based on durability and finish.",
  },
  {
    key: "deadline",
    label: "Can this meet my deadline?",
    customerText: "Can this order be finished before my deadline?",
    reply: "Please send your needed date/time, quantity, size, material, and finishing requirements. Rush production depends on shop queue, file readiness, and material availability.",
  },
  {
    key: "proof_cost_lock",
    label: "Proof and final cost lock",
    customerText: "Can I approve a proof first and lock the final cost before production?",
    reply: "Yes. The shop can upload proof versions here. After approval, the final design and total cost can be locked before production starts.",
  },
];

function MessagesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initBizId = searchParams.get("business");
  const initServiceId = searchParams.get("service");

  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLimit, setMsgLimit] = useState(20);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [unreadByConv, setUnreadByConv] = useState({});
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [jitsiRoom, setJitsiRoom] = useState(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [viewImagePopup, setViewImagePopup] = useState(null);
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingDesignUpload = useRef(false);
  const jitsiApiRef = useRef(null);
  const jitsiScriptRef = useRef(null);

  /* Jitsi API setup */
  useEffect(() => {
    if (!jitsiRoom) {
      if (jitsiApiRef.current) {
        try { jitsiApiRef.current.dispose(); } catch (_) {}
        jitsiApiRef.current = null;
      }
      if (jitsiScriptRef.current && document.head.contains(jitsiScriptRef.current)) {
        document.head.removeChild(jitsiScriptRef.current);
        jitsiScriptRef.current = null;
      }
      return;
    }

    const initApi = () => {
      const container = document.getElementById("jitsi-container-customer");
      if (!container || !window.JitsiMeetExternalAPI) return;
      if (jitsiApiRef.current) {
        try { jitsiApiRef.current.dispose(); } catch (_) {}
      }
      jitsiApiRef.current = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: jitsiRoom,
        parentNode: container,
        width: "100%",
        height: "100%",
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          DISPLAY_WELCOME_PAGE_CONTENT: false,
          TOOLBAR_BUTTONS: [
            "microphone", "camera", "desktop", "fullscreen",
            "fodeviceselection", "hangup", "chat", "settings",
            "raisehand", "videoquality", "filmstrip", "tileview", "whiteboard",
          ],
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableDeepLinking: true,
          hideConferenceSubject: true,
        },
      });
      jitsiApiRef.current.addEventListener("readyToClose", () => setJitsiRoom(null));
    };

    if (window.JitsiMeetExternalAPI) {
      initApi();
    } else {
      const script = document.createElement("script");
      script.src = "https://meet.jit.si/external_api.js";
      script.async = true;
      script.onload = initApi;
      jitsiScriptRef.current = script;
      document.head.appendChild(script);
    }
  }, [jitsiRoom]);

  useEffect(() => {
    async function init() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        setLoadingConvs(false);
        return;
      }
      setUser(currentUser);

      if (initBizId) {
        const { data: existing } = await supabase
          .from("chat_conversations")
          .select("id")
          .eq("customer_id", currentUser.id)
          .eq("business_id", initBizId)
          .maybeSingle();

        if (!existing) {
          await supabase
            .from("chat_conversations")
            .insert({ customer_id: currentUser.id, business_id: initBizId });
        }
      }

      await loadConversations(currentUser);
    }

    init();
  }, [initBizId]);

  const loadConversations = async (currentUser = user) => {
    if (!currentUser) return;
    setLoadingConvs(true);

    const { data: convsData } = await supabase
      .from("chat_conversations")
      .select(`
        id, created_at, business_id,
        businesses ( name, logo_url )
      `)
      .eq("customer_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (!convsData) {
      setLoadingConvs(false);
      return;
    }

    const unreadMap = {};
    for (const c of convsData) {
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", c.id)
        .neq("sender_id", currentUser.id)
        .eq("is_read", false);
      unreadMap[c.id] = count || 0;
    }

    setUnreadByConv(unreadMap);
    setConversations(convsData);

    if (initBizId) {
      const target = convsData.find((c) => c.business_id === initBizId);
      if (target) setActiveConv(target);
    } else if (convsData.length > 0 && !activeConv) {
      setActiveConv(convsData[0]);
    }

    setLoadingConvs(false);
  };

  useEffect(() => {
    if (!activeConv) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    fetchMessages(activeConv.id, false, msgLimit);

    const channel = supabase
      .channel(`chat_all:${activeConv.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        async (payload) => {
          const row = payload.new || payload.old;
          if (!row?.conversation_id) return;

          if (row.conversation_id === activeConv.id) {
            await fetchMessages(activeConv.id, true);
            await markConversationRead(activeConv.id);
          }
          await loadConversations();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [activeConv, msgLimit]);

  const fetchMessages = async (convId, isBg = false, limit = 20) => {
    if (!isBg) setLoadingMsgs(true);
    const { data, count } = await supabase
      .from("chat_messages")
      .select("*", { count: "exact" })
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (data) {
      setMessages(data.reverse());
      setHasMoreMsgs(count > limit);

      if (limit === 20 || isBg) {
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
              top: scrollContainerRef.current.scrollHeight,
              behavior: isBg ? "smooth" : "auto"
            });
          }
        }, 50);
      }
    }
    if (!isBg) setLoadingMsgs(false);
  };

  const markConversationRead = async (convId) => {
    await supabase
      .from("chat_messages")
      .update({ is_read: true })
      .eq("conversation_id", convId)
      .neq("sender_id", user.id)
      .eq("is_read", false);

    setUnreadByConv((prev) => ({ ...prev, [convId]: 0 }));
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeConv || !user || sending) return;

    setSending(true);
    const content = input.trim();
    setInput("");

    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content,
      is_read: false,
    });

    await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", activeConv.id);

    setSending(false);
  };

  const sendDesignUpload = async (file) => {
    if (!file || !activeConv || !user) return;
    if (file.size > DESIGN_MAX_BYTES) {
      window.alert("Design files must be 50 MB or smaller.");
      return;
    }

    setSending(true);
    const uploadProfile = getUploadProfile(file);
    const ext = uploadProfile.extension || "file";
    const filePath = `${activeConv.id}/${user.id}-customer-design-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("chat-images")
      .upload(filePath, file, { upsert: false });

    if (!uploadErr) {
      const { data } = supabase.storage.from("chat-images").getPublicUrl(filePath);
      await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        sender_role: "CUSTOMER",
        content: "Customer design file uploaded for checking and quotation.",
        message_type: "design_upload",
        metadata: {
          file_name: file.name,
          file_size_bytes: file.size,
          file_type: uploadProfile.fileType,
          file_format: ext,
          file_mime: uploadProfile.mime,
          quality_notes: uploadProfile.quality,
        },
        image_url: data?.publicUrl || null,
        is_read: false,
      });
    }

    setSending(false);
  };

  const requestVideoCall = async () => {
    if (!activeConv || !user || sending) return;
    setSending(true);
    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content: "[VIDEO_CALL_REQUEST]",
      message_type: "video_call",
      metadata: {
        capabilities: ["camera", "microphone", "screen share", "chat", "raise hand", "tile view", "video quality controls"],
      },
      is_read: false,
    });
    setSending(false);
  };

  const updateProofStatus = async (msg, status) => {
    if (!activeConv || !user) return;
    const metadata = {
      ...(msg.metadata || {}),
      proof_status: status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };

    setSending(true);
    await supabase.from("chat_messages").update({ metadata }).eq("id", msg.id);
    if (msg.metadata?.proof_id) {
      await supabase.from("design_proofs").update({ status }).eq("id", msg.metadata.proof_id);
    }
    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content: status === "APPROVED"
        ? `I approve proof version ${msg.metadata?.version || ""}. Please lock the final cost before production.`
        : `Proof version ${msg.metadata?.version || ""} needs changes. I will send notes in this chat.`,
      message_type: "proof_status",
      metadata,
      is_read: false,
    });
    await fetchMessages(activeConv.id, true);
    setSending(false);
  };

  const sendQuickReply = async (action) => {
    if (!activeConv || !user) return;
    const question = GENERATED_PRINT_QUESTIONS.find((item) => item.key === action);
    if (!question) return;
    setSending(true);

    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content: question.customerText,
      is_read: false,
    });

    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: activeConv.business_id,
      sender_role: "BUSINESS_OWNER",
      content: question.reply,
      message_type: "generated_guidance",
      metadata: { question_key: question.key },
      is_read: false,
    });

    setSending(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      
      {/* Header */}
      <section className="bg-white border-b border-slate-200 py-6 px-4 sm:px-6 lg:px-8 relative shadow-sm shrink-0">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Messages & Proofing</h1>
            <p className="text-xs text-slate-500 mt-0.5">Chat directly with print shop owners, receive price quotes, and approve design proofs.</p>
          </div>
        </div>
      </section>

      {/* Main Chat Container */}
      <div className="max-w-[1800px] w-full mx-auto p-3 sm:p-4 flex-1 flex gap-4 h-[calc(100vh-170px)] min-h-[500px]">
        
        {/* Sidebar Conversations List */}
        <aside className="w-full sm:w-80 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Conversations</h2>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConvs ? (
              <div className="p-8 text-center text-xs text-slate-400 font-medium">
                <Loader2 className="animate-spin mx-auto mb-2 text-[#EC008C]" size={24} />
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No active conversations. Start chatting from a shop's profile page.
              </div>
            ) : (
              conversations.map((c) => {
                const isActive = activeConv?.id === c.id;
                const biz = c.businesses || {};
                const unread = unreadByConv[c.id] || 0;

                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveConv(c)}
                    className={`w-full p-4 text-left flex items-start gap-3 transition-colors ${
                      isActive ? "bg-slate-100/80 font-semibold" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 font-bold text-sm">
                      {biz.name ? biz.name.charAt(0) : <Store size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-900 truncate">{biz.name || "Print Shop"}</p>
                        {unread > 0 && (
                          <span className="w-5 h-5 rounded-full bg-[#EC008C] text-white text-[10px] font-bold flex items-center justify-center">
                            {unread}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Click to view chat history</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat Thread */}
        <section className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
          {activeConv ? (
            <>
              {/* Active Header */}
              <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                    {activeConv.businesses?.name?.charAt(0) || "S"}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">{activeConv.businesses?.name || "Print Shop"}</h2>
                    <p className="text-[11px] text-slate-500">Live chat & proofing thread</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowQuickReplies(!showQuickReplies)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-medium hover:bg-slate-100 flex items-center gap-1.5"
                  >
                    <Sparkles size={14} className="text-[#EC008C]" /> Quick Questions
                  </button>
                </div>
              </div>

              {/* Quick Reply Drawer */}
              {showQuickReplies && (
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 animate-slide-up">
                  {GENERATED_PRINT_QUESTIONS.map((question) => (
                    <button
                      key={question.key}
                      onClick={() => sendQuickReply(question.key)}
                      className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:border-slate-400 shadow-sm"
                    >
                      {question.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Messages Scroll Thread */}
              <div ref={scrollContainerRef} className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
                {loadingMsgs ? (
                  <div className="p-12 text-center text-xs text-slate-400">
                    <Loader2 className="animate-spin mx-auto mb-2 text-[#00FFFF]" size={24} />
                    Loading message thread...
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.sender_id === user?.id;
                    const meta = m.metadata || {};
                    const uploadName = meta.file_name || "Uploaded file";
                    const isPreviewable = Boolean(m.image_url && (meta.file_mime?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(uploadName)));

                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        <div className={`max-w-md p-4 rounded-2xl text-xs leading-relaxed ${
                          isMe 
                            ? "bg-slate-900 text-white rounded-br-none shadow-sm" 
                            : "bg-white border border-slate-200 text-slate-900 rounded-bl-none shadow-sm"
                        }`}>
                          {m.image_url && (
                            <div className="mb-3">
                              {isPreviewable ? (
                                <a href={m.image_url} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={m.image_url} alt={uploadName} className="max-h-80 w-auto rounded-lg border border-slate-200" />
                                </a>
                              ) : (
                                <a href={m.image_url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 rounded-lg border p-3 ${isMe ? "border-white/30" : "border-slate-200"} hover:bg-slate-100/40`}>
                                  <FileText size={24} className="shrink-0" />
                                  <span className="break-all font-semibold">{uploadName}</span>
                                </a>
                              )}
                            </div>
                          )}

                          {m.content === "[VIDEO_CALL_REQUEST]" ? (
                            <div className="text-center">
                              <Video size={26} className="mx-auto mb-2 text-[#EC008C]" />
                              <p className="font-bold">Video call requested</p>
                              <p className="mt-1 text-[11px] opacity-70">Camera, microphone, screen share, chat, raise hand, tile view, quality controls.</p>
                            </div>
                          ) : m.content?.startsWith("[VIDEO_CALL_INVITE:") ? (
                            (() => {
                              const timeStr = m.content.replace("[VIDEO_CALL_INVITE:", "").replace("]", "");
                              const schedTime = new Date(timeStr);
                              const isExpired = Date.now() - schedTime.getTime() > (30 * 60 * 1000);
                              const joinable = !isExpired && (schedTime.getTime() - Date.now()) <= (15 * 60 * 1000);
                              return (
                                <div className="text-center">
                                  <Calendar size={26} className="mx-auto mb-2 text-[#00FFFF]" />
                                  <p className="font-bold">Video call scheduled</p>
                                  <p className="mt-1 text-[11px] opacity-80">{schedTime.toLocaleString()}</p>
                                  <p className="mt-1 text-[11px] opacity-60">Includes camera, microphone, screen share, chat, raise hand, tile view, quality controls, and whiteboard.</p>
                                  <button
                                    type="button"
                                    onClick={() => setJitsiRoom(`print-app-call-${activeConv.id}`)}
                                    disabled={!joinable}
                                    className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-[11px] font-bold text-white disabled:opacity-40"
                                  >
                                    {isExpired ? "Link expired" : joinable ? "Join call" : "Available 15 minutes before"}
                                  </button>
                                </div>
                              );
                            })()
                          ) : m.message_type === "quote" ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-slate-900">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Formal quotation</p>
                              <p className="mt-1 text-2xl font-extrabold">PHP {Number(meta.total_cost || meta.quote_amount || 0).toFixed(2)}</p>
                              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                                <span className="text-slate-500">Subtotal</span><span className="text-right font-semibold">PHP {Number(meta.subtotal || meta.quote_amount || 0).toFixed(2)}</span>
                                <span className="text-slate-500">Tax/VAT</span><span className="text-right font-semibold">PHP {Number(meta.taxes || 0).toFixed(2)}</span>
                                <span className="text-slate-500">Valid until</span><span className="text-right font-semibold">{meta.valid_until ? new Date(meta.valid_until).toLocaleDateString() : "14 days"}</span>
                                <span className="text-slate-500">Proof version</span><span className="text-right font-semibold">{meta.proof_version || "Not locked"}</span>
                              </div>
                              {m.content && <p className="mt-3 whitespace-pre-wrap">{m.content}</p>}
                            </div>
                          ) : m.message_type === "design_version" ? (
                            <div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-900">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#EC008C]">Proof version {meta.version || "1"}</p>
                                  <span className="rounded bg-slate-900 px-2 py-1 text-[9px] font-bold uppercase text-white">{meta.proof_status || "PENDING"}</span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                                  <span>Type: {meta.file_type || "Design proof"}</span>
                                  <span>Format: {(meta.file_format || "file").toUpperCase()}</span>
                                  <span>Size: {formatBytes(meta.file_size_bytes)}</span>
                                  <span>Quality: print-ready review</span>
                                </div>
                                {meta.quality_notes && <p className="mt-2 text-[11px] text-slate-500">{meta.quality_notes}</p>}
                                {!meta.is_locked && (
                                  <div className="mt-3 flex gap-2">
                                    <button type="button" onClick={() => updateProofStatus(m, "APPROVED")} disabled={sending || meta.proof_status === "APPROVED"} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">Approve</button>
                                    <button type="button" onClick={() => updateProofStatus(m, "NEEDS_CHANGES")} disabled={sending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 disabled:opacity-40">Request changes</button>
                                  </div>
                                )}
                              </div>
                              {m.content && m.content !== "[image]" && <p className="mt-2 whitespace-pre-wrap">{m.content}</p>}
                            </div>
                          ) : m.message_type === "proof_status" ? (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Proof update</p>
                              <p className="whitespace-pre-wrap">{m.content}</p>
                            </div>
                          ) : m.message_type === "generated_guidance" ? (
                            <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-slate-900">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Suggested print guidance</p>
                              <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                            </div>
                          ) : (
                            m.content !== "[image]" && <p className="whitespace-pre-wrap">{m.content}</p>
                          )}
                          <span className={`block text-[10px] mt-2 text-right opacity-60`}>
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick Reply Suggestions */}
              <div className="px-4 pt-2.5 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-[11px] font-semibold text-slate-600 no-scrollbar">
                <span className="shrink-0 text-slate-400 font-bold">Quick Inquiries:</span>
                {GENERATED_PRINT_QUESTIONS.slice(0, 5).map((question) => (
                  <button
                    key={question.key}
                    type="button"
                    onClick={() => sendQuickReply(question.key)}
                    className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0 transition-colors"
                  >
                    {question.label}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={DESIGN_FILE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) sendDesignUpload(file);
                    e.target.value = "";
                  }}
                />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message or inquiry..."
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#EC008C]"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="Upload design file for proofing"
                  className="p-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <FileText size={18} />
                </button>
                <button
                  type="button"
                  onClick={requestVideoCall}
                  disabled={sending}
                  title="Request video consultation"
                  className="p-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <Video size={18} />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="p-3 bg-slate-900 text-white rounded-xl hover:bg-[#EC008C] transition-colors disabled:opacity-50"
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <MessageSquare size={48} className="mb-3 opacity-30" />
              <p className="text-sm font-semibold text-slate-600">Select a Conversation</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">Choose a print shop from the sidebar to view chat history and design proofs.</p>
            </div>
          )}
        </section>

      </div>
      {jitsiRoom && (
        <div className="fixed inset-0 z-[999] flex flex-col bg-slate-950">
          <div className="flex items-center justify-between border-b border-cyan-400 bg-slate-950 px-5 py-3 text-white">
            <div className="flex items-center gap-3">
              <Video size={18} className="text-cyan-300" />
              <div>
                <p className="text-sm font-extrabold uppercase">Live video proofing call</p>
                <p className="text-[11px] text-slate-400">Camera, microphone, screen share, chat, raise hand, tile view, quality controls, and whiteboard.</p>
              </div>
            </div>
            <button type="button" onClick={() => setJitsiRoom(null)} className="rounded-lg bg-[#EC008C] px-4 py-2 text-xs font-bold text-white">
              End & Close
            </button>
          </div>
          <div id="jitsi-container-customer" className="flex-1 w-full" />
        </div>
      )}
    </main>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs font-semibold">Loading messages...</div>}>
      <MessagesInner />
    </Suspense>
  );
}
