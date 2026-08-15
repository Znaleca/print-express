"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Send, Loader2, User, Store,
  ChevronRight, ChevronLeft, ImagePlus, Pencil, Trash2, Check, X, MoreVertical, Video, Calendar, MapPin, Sparkles, CheckCircle2, ArrowRight, FileText
} from "lucide-react";
import { getUploadExtension, IMAGE_BUCKET, optimizeImageForUpload } from "@/lib/imageUpload";

const DESIGN_FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,image/svg+xml,.ai,.psd,.eps,.tif,.tiff";
const DESIGN_MAX_BYTES = 10 * 1024 * 1024;

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

const shorten = (value, maxLength = 25) => {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
};

/*
 * These are real questions sent to the shop, not synthetic answers. The
 * catalog context makes the wording useful without pretending the platform
 * knows a shop's live prices, queue, materials, or delivery coverage.
 */
const buildShopQuestions = (business) => {
  const shopName = business?.name || "your shop";
  const availableItems = (business?.services || []).filter((item) => item?.available !== false);
  const featuredItem = availableItems[0];
  const featuredName = featuredItem?.name ? shorten(featuredItem.name) : "my print job";
  const hasCustomServices = availableItems.some((item) => item.item_type !== "product" || item.is_customizable);

  return [
    {
      key: "catalog",
      label: "What do you offer?",
      customerText: `Hi! What printing services and products are currently available at ${shopName}?`,
    },
    {
      key: "quote",
      label: featuredItem ? `Price for ${featuredName}` : "Ask for a quote",
      customerText: featuredItem
        ? `Could you give me an estimate for ${featuredItem.name}? Please include the available options, minimum quantity, and expected turnaround.`
        : "Could you give me a quote? I can send the size, quantity, material, and deadline so you can price it accurately.",
    },
    {
      key: "options",
      label: "Ask about options",
      customerText: featuredItem
        ? `For ${featuredItem.name}, what sizes, materials, finishes, and quality options do you currently offer? Please include any added costs.`
        : "What sizes, materials, finishes, and quality options do you currently offer, and what does each option cost?",
    },
    {
      key: "file_check",
      label: hasCustomServices ? "Check my design file" : "Can you check my file?",
      customerText: "Can you check my PDF or image for size, resolution, bleed, margins, and print-readiness before I order?",
    },
    {
      key: "turnaround",
      label: "Ask about turnaround",
      customerText: "What is the current turnaround for my print job? I can provide the quantity, specifications, and the date I need it.",
    },
    {
      key: "fulfillment",
      label: "Pickup or delivery?",
      customerText: "Do you offer pickup or delivery? Please share the available area, delivery fee, and estimated delivery time.",
    },
  ];
};

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
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
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
  const msgLimitRef = useRef(20);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingDesignUpload = useRef(false);
  const jitsiApiRef = useRef(null);
  const jitsiScriptRef = useRef(null);

  const shopQuestions = useMemo(
    () => buildShopQuestions(activeConv?.businesses),
    [activeConv]
  );

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
        businesses (
          name, logo_url, description, products_summary, address, is_open,
          services ( id, name, item_type, price, price_max, description, category, available, is_customizable, specs_json )
        )
      `)
      .eq("customer_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (!convsData) {
      setLoadingConvs(false);
      return;
    }

    const unreadMap = {};
    const conversationIds = convsData.map((conversation) => conversation.id);
    if (conversationIds.length > 0) {
      const { data: unreadRows } = await supabase
        .from("chat_messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .neq("sender_id", currentUser.id)
        .eq("is_read", false);
      (unreadRows || []).forEach((row) => {
        unreadMap[row.conversation_id] = (unreadMap[row.conversation_id] || 0) + 1;
      });
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

    msgLimitRef.current = 20;
    setMsgLimit(20);
    setMessages([]);
    setHasMoreMsgs(false);
    fetchMessages(activeConv.id, false, 20);

    const channel = supabase
      .channel(`chat_all:${activeConv.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${activeConv.id}` },
        async (payload) => {
          const row = payload.new || payload.old;
          if (!row?.conversation_id) return;

          await fetchMessages(activeConv.id, true, msgLimitRef.current);
          await markConversationRead(activeConv.id);
          await loadConversations();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [activeConv]);

  const fetchMessages = async (convId, isBg = false, limit = 20, prepend = false) => {
    const previousHeight = scrollContainerRef.current?.scrollHeight || 0;

    if (prepend) setLoadingOlderMsgs(true);
    else if (!isBg) setLoadingMsgs(true);

    const { data, count } = await supabase
      .from("chat_messages")
      .select("*", { count: "exact" })
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (data) {
      const orderedMessages = data.reverse();

      if (prepend) {
        setMessages((currentMessages) => {
          const existingIds = new Set(currentMessages.map((message) => message.id));
          const olderMessages = orderedMessages.filter((message) => !existingIds.has(message.id));
          return [...olderMessages, ...currentMessages];
        });
      } else {
        setMessages(orderedMessages);
      }

      setHasMoreMsgs((count || 0) > limit);

      if (prepend) {
        window.setTimeout(() => {
          const container = scrollContainerRef.current;
          if (container) container.scrollTop = container.scrollHeight - previousHeight;
        }, 50);
      } else if (limit === 20 || isBg) {
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

    if (prepend) setLoadingOlderMsgs(false);
    else if (!isBg) setLoadingMsgs(false);
  };

  const loadOlderMessages = async () => {
    if (!activeConv || !hasMoreMsgs || loadingOlderMsgs) return;

    const nextLimit = msgLimitRef.current + 20;
    msgLimitRef.current = nextLimit;
    setMsgLimit(nextLimit);
    await fetchMessages(activeConv.id, false, nextLimit, true);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !activeConv) return;

    const handleScroll = () => {
      if (container.scrollTop <= 56 && hasMoreMsgs && !loadingOlderMsgs) {
        loadOlderMessages();
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeConv, hasMoreMsgs, loadingOlderMsgs, msgLimit]);

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
      window.alert("Design files must be 10 MB or smaller.");
      return;
    }

    setSending(true);
    const uploadFile = file.type?.startsWith("image/")
      ? await optimizeImageForUpload(file).catch((error) => {
          window.alert(error.message || "Images must be 5 MB or smaller after optimization.");
          return null;
        })
      : file;
    if (!uploadFile) {
      setSending(false);
      return;
    }

    const uploadProfile = getUploadProfile(uploadFile);
    const ext = uploadFile.type?.startsWith("image/") ? getUploadExtension(uploadFile) : (uploadProfile.extension || "file");
    const filePath = `${activeConv.id}/${user.id}-customer-design-${Date.now()}.${ext}`;
    const storageBucket = uploadFile.type?.startsWith("image/") ? IMAGE_BUCKET : "chat-images";

    const { error: uploadErr } = await supabase.storage
      .from(storageBucket)
      .upload(filePath, uploadFile, {
        upsert: false,
        cacheControl: "31536000",
        contentType: uploadFile.type,
      });

    if (!uploadErr) {
      const { data } = supabase.storage.from(storageBucket).getPublicUrl(filePath);
      await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        sender_role: "CUSTOMER",
        content: "Customer design file uploaded for checking and quotation.",
        message_type: "design_upload",
        metadata: {
          file_name: file.name,
          file_size_bytes: uploadFile.size,
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
    await fetchMessages(activeConv.id, true, msgLimitRef.current);
    setSending(false);
  };

  const sendQuickReply = async (action) => {
    if (!activeConv || !user) return;
    const question = shopQuestions.find((item) => item.key === action);
    if (!question) return;
    setSending(true);

    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content: question.customerText,
      is_read: false,
    });

    if (error) {
      window.alert(error.message || "Could not send this question.");
      setSending(false);
      return;
    }

    setShowQuickReplies(false);
    setSending(false);
  };

  return (
    <main className="messages-page h-[calc(100vh-70px)] sm:h-[calc(100vh-86px)] min-h-0 overflow-hidden bg-[#F6F6F2] font-sans text-slate-900 flex flex-col">
      
      {/* Header */}
      <section className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 pb-8 pt-9 text-white sm:px-8 sm:pb-10 sm:pt-11 lg:px-12">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute bottom-5 left-8 hidden h-24 w-24 rotate-12 border border-[#EC008C]/30 sm:block" />

        <div className="relative mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">
              Message <span className="text-[#00FFFF]">print shops.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
              Chat with print partners, review files, and approve proofs in one place.
            </p>
          </div>
        </div>
      </section>

      {/* Main Chat Container */}
      <div className="max-w-[1800px] w-full mx-auto p-3 sm:p-4 flex-1 flex flex-col sm:flex-row gap-4 min-h-0 overflow-hidden">
        
        {/* Sidebar Conversations List */}
        <aside className="w-full sm:w-80 h-56 sm:h-auto min-h-0 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-[#F6F6F2]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EC008C]">Inbox</p>
                <h2 className="mt-1 text-sm font-extrabold text-slate-900">Conversations</h2>
              </div>
              <span className="text-[10px] font-bold text-slate-400">{conversations.length} shops</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100">
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
                    className={`w-full p-4 text-left flex items-start gap-3 transition-colors border-l-4 ${
                      isActive ? "bg-[#EFFFFF] border-[#00FFFF] font-semibold" : "border-transparent hover:bg-slate-50"
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
        <section className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
          {activeConv ? (
            <>
              {/* Active Header */}
              <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3 z-10 shrink-0">
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
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-[#F6F6F2] text-slate-700 text-xs font-bold hover:border-[#EC008C] hover:text-[#EC008C] flex items-center gap-1.5"
                  >
                    <Sparkles size={14} className="text-[#EC008C]" /> Ask the shop
                  </button>
                </div>
              </div>

              {/* Context-aware questions are sent directly to the shop. */}
              {showQuickReplies && (
                <div className="border-b border-slate-200 bg-slate-50 p-3 animate-slide-up">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Questions for {activeConv.businesses?.name || "the shop"}</p>
                  <p className="mb-2 text-[11px] text-slate-500">These are sent directly to the shop—answers come from the shop, not an automatic estimate.</p>
                  <div className="flex flex-wrap gap-2">
                  {shopQuestions.map((question) => (
                    <button
                      key={question.key}
                      onClick={() => sendQuickReply(question.key)}
                      className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:border-slate-400 shadow-sm"
                    >
                      {question.label}
                    </button>
                  ))}
                  </div>
                </div>
              )}

              {/* Messages Scroll Thread */}
              <div ref={scrollContainerRef} className="min-h-0 flex-1 p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-4 bg-[#F6F6F2]">
                {loadingMsgs ? (
                  <div className="p-12 text-center text-xs text-slate-400">
                    <Loader2 className="animate-spin mx-auto mb-2 text-[#00FFFF]" size={24} />
                    Loading message thread...
                  </div>
                ) : (
                  <>
                    {hasMoreMsgs && (
                      <div className="sticky top-0 z-20 flex justify-center pb-1">
                        <button
                          type="button"
                          onClick={loadOlderMessages}
                          disabled={loadingOlderMsgs}
                          className="border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm hover:border-[#00FFFF] hover:text-slate-900 disabled:cursor-wait disabled:opacity-70"
                        >
                          {loadingOlderMsgs ? "Loading older messages…" : "Load older messages"}
                        </button>
                      </div>
                    )}
                    {messages.map((m) => {
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
                    })}
                  </>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick Reply Suggestions */}
              <div className="shrink-0 px-4 pt-2.5 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-[11px] font-semibold text-slate-600 no-scrollbar">
                <span className="shrink-0 text-slate-400 font-bold">Ask the shop:</span>
                {shopQuestions.slice(0, 5).map((question) => (
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
              <form onSubmit={handleSendMessage} className="shrink-0 p-4 bg-white border-t border-slate-100 flex items-center gap-3">
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
