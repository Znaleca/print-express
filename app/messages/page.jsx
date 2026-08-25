"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Send, Loader2,
  ChevronRight, ChevronLeft, ImagePlus, Pencil, Trash2, Check, X, MoreVertical, Video, Calendar, MapPin, Sparkles, CheckCircle2, ArrowRight, FileText
} from "lucide-react";
import {
  CHAT_IMAGES_BUCKET,
  getUploadExtension,
  optimizeImageForUpload,
  resolveStorageUrl,
  toStorageRef,
} from "@/lib/imageUpload";
import { getShopQuestions } from "@/lib/chatQuestions";
import ProfileAvatar from "@/components/ProfileAvatar";
import ConversationList from "@/components/messages/ConversationList";
import VideoCallModal from "@/components/VideoCallModal";
import { getVideoCallWindow, videoCallAction } from "@/lib/videoCalls";

const DESIGN_FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,image/svg+xml,.ai,.psd,.eps,.tif,.tiff";
const DESIGN_MAX_BYTES = 10 * 1024 * 1024;

const formatBytes = (bytes = 0) => {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return "Not recorded";
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

function MessagesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initBizId = searchParams.get("business");

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
  const [videoCallSession, setVideoCallSession] = useState(null);
  const [videoCalls, setVideoCalls] = useState([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showDesignUpload, setShowDesignUpload] = useState(false);
  const [designVersion, setDesignVersion] = useState("1");
  const [viewImagePopup, setViewImagePopup] = useState(null);
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const msgLimitRef = useRef(20);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);

  const shopQuestions = useMemo(
    () => getShopQuestions(activeConv?.businesses),
    [activeConv]
  );

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
          name, logo_url, owner_id, description, products_summary, address, is_open, chat_suggested_questions,
          services ( id, name, item_type, price, price_max, description, category, available, is_customizable, specs_json )
        )
      `)
      .eq("customer_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (!convsData) {
      setLoadingConvs(false);
      return;
    }

    let hydratedConversations = convsData;
    const ownerIds = [...new Set(convsData.map((conversation) => conversation.businesses?.owner_id).filter(Boolean))];
    if (ownerIds.length > 0) {
      const { data: ownerProfiles, error: ownerProfileError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ownerIds);

      if (ownerProfileError) {
        console.warn("[Messages] Could not load shop profile photos:", ownerProfileError.message);
      } else {
        const ownerProfileMap = (ownerProfiles || []).reduce((profiles, profile) => {
          profiles[profile.id] = profile;
          return profiles;
        }, {});
        hydratedConversations = convsData.map((conversation) => ({
          ...conversation,
          businesses: {
            ...conversation.businesses,
            owner_profile: ownerProfileMap[conversation.businesses?.owner_id] || null,
          },
        }));
      }
    }

    const unreadMap = {};
    const conversationIds = hydratedConversations.map((conversation) => conversation.id);
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
    if (activeConv?.id) unreadMap[activeConv.id] = 0;

    setUnreadByConv(unreadMap);
    setConversations(hydratedConversations);

    if (initBizId) {
      const target = hydratedConversations.find((c) => c.business_id === initBizId);
      if (target) setActiveConv(target);
    } else if (hydratedConversations.length > 0 && !activeConv) {
      setActiveConv(hydratedConversations[0]);
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

  useEffect(() => {
    if (!activeConv) {
      setVideoCalls([]);
      return undefined;
    }

    let active = true;
    const loadCalls = async () => {
      const { data, error } = await supabase
        .from("video_calls")
        .select("*")
        .eq("conversation_id", activeConv.id)
        .order("created_at", { ascending: false });
      if (active && !error) setVideoCalls(data || []);
    };

    loadCalls();
    const channel = supabase
      .channel(`video-calls-customer:${activeConv.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_calls", filter: `conversation_id=eq.${activeConv.id}` },
        loadCalls
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
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
      const resolvedData = await Promise.all(data.map(async (message) => ({
        ...message,
        image_url: message.image_url ? await resolveStorageUrl(message.image_url) : null,
      })));
      const orderedMessages = resolvedData.reverse();

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

  useEffect(() => {
    if (!activeConv || !user) return;
    void markConversationRead(activeConv.id);
  }, [activeConv, user]);

  const openConversation = (conversation) => {
    setActiveConv(conversation);
    setUnreadByConv((prev) => ({ ...prev, [conversation.id]: 0 }));
    void markConversationRead(conversation.id);
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeConv || !user || sending) return;

    setSending(true);
    const content = input.trim();
    const { error: messageError } = await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content,
      is_read: false,
    });

    if (messageError) {
      window.alert(messageError.message || "Could not send your message.");
      setSending(false);
      return;
    }
    setInput("");

    await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", activeConv.id);

    setSending(false);
  };

  const sendDesignUpload = async (file, requestedVersion = designVersion) => {
    if (!file || !activeConv || !user) return;
    if (file.size > DESIGN_MAX_BYTES) {
      window.alert("Design files must be 10 MB or smaller.");
      return;
    }
    const normalizedVersion = String(requestedVersion || "").trim();
    if (!normalizedVersion) {
      window.alert("Enter a proof version before selecting the file.");
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
    const safeVersion = normalizedVersion.replace(/[^a-z0-9._-]/gi, "-").slice(0, 24) || "1";
    const filePath = `${activeConv.id}/${user.id}-customer-design-v${safeVersion}-${Date.now()}.${ext}`;
    const storageBucket = CHAT_IMAGES_BUCKET;

    const { error: uploadErr } = await supabase.storage
      .from(storageBucket)
      .upload(filePath, uploadFile, {
        upsert: false,
        cacheControl: "31536000",
        contentType: uploadFile.type,
      });

    if (uploadErr) {
      window.alert(uploadErr.message || "Could not upload this design proof.");
      setSending(false);
      return;
    }

    const storageRef = toStorageRef(storageBucket, filePath);
    const proofPayload = {
      conversation_id: activeConv.id,
      version_number: Number.parseInt(normalizedVersion, 10) || 1,
      file_url: storageRef,
      file_name: file.name,
      file_size_bytes: uploadFile.size,
      file_type: uploadProfile.fileType,
      file_format: ext,
      quality_notes: uploadProfile.quality,
      status: "PENDING",
      uploaded_by: user.id,
      uploaded_role: "CUSTOMER",
    };

    const { data: proofRow, error: proofError } = await supabase
      .from("design_proofs")
      .insert(proofPayload)
      .select("id")
      .maybeSingle();

    if (proofError || !proofRow?.id) {
      window.alert("The file uploaded, but the proof version could not be registered. Apply the design-proof database migration before continuing.");
      setSending(false);
      return;
    }

    const { error: messageError } = await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content: `Customer design proof version ${normalizedVersion} uploaded for review.`,
      message_type: "design_version",
      metadata: {
        version: normalizedVersion,
        proof_id: proofRow.id,
        proof_status: "PENDING",
        is_locked: false,
        file_name: file.name,
        file_size_bytes: uploadFile.size,
        file_type: uploadProfile.fileType,
        file_format: ext,
        file_mime: uploadProfile.mime,
        quality_notes: uploadProfile.quality,
      },
      image_url: storageRef,
      is_read: false,
    });

    if (messageError) {
      window.alert(messageError.message || "The proof was registered, but could not be added to the conversation.");
    } else {
      setShowDesignUpload(false);
      setDesignVersion((prev) => String((Number.parseInt(prev, 10) || 1) + 1));
    }

    setSending(false);
  };

  const requestVideoCall = async () => {
    if (!activeConv || !user || sending) return;
    setSending(true);
    try {
      const result = await videoCallAction("request", { conversationId: activeConv.id });
      if (result.call) setVideoCalls((current) => [result.call, ...current.filter((call) => call.id !== result.call.id)]);
    } catch (error) {
      window.alert(error.message || "Could not request a video call.");
    }
    setSending(false);
  };

  const joinVideoCall = async (callId) => {
    try {
      const result = await videoCallAction("join", { callId });
      if (!result.call?.room_name) throw new Error("The secure call room is unavailable.");
      setVideoCallSession({ callId: result.call.id, roomName: result.call.room_name });
    } catch (error) {
      window.alert(error.message || "This call cannot be joined yet.");
    }
  };

  const cancelVideoCall = async (callId) => {
    if (!window.confirm("Cancel this video call? The shop will be notified in chat.")) return;
    try {
      const result = await videoCallAction("cancel", { callId, reason: "Cancelled by customer" });
      if (result.call) setVideoCalls((current) => current.map((call) => call.id === result.call.id ? result.call : call));
    } catch (error) {
      window.alert(error.message || "Could not cancel the video call.");
    }
  };

  const updateProofStatus = async (msg, status) => {
    if (!activeConv || !user || msg.metadata?.is_locked || msg.sender_id === user.id) return;
    const metadata = {
      ...(msg.metadata || {}),
      proof_status: status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };

    setSending(true);
    await supabase.from("chat_messages").update({ metadata }).eq("id", msg.id);
    if (msg.metadata?.proof_id) {
      await supabase.from("design_proofs").update({
        status,
        reviewed_by: user.id,
        reviewed_at: metadata.reviewed_at,
      }).eq("id", msg.metadata.proof_id);
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
    <main data-tour="shop-messages" className="messages-page h-[calc(100dvh-70px)] min-h-0 overflow-hidden bg-[#F6F6F2] font-sans text-slate-900 flex flex-col sm:h-[calc(100dvh-86px)]">
      
      {/* Compact header keeps the conversation visible above the fold. */}
      <section className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 pb-4 pt-5 text-white sm:px-8 sm:pb-5 sm:pt-6 lg:px-10">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-12 -top-24 h-48 w-48 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-8 left-8 hidden h-14 w-14 rotate-12 border border-[#EC008C]/30 sm:block" />

        <div className="relative mx-auto flex max-w-6xl flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-black uppercase leading-none tracking-tight sm:text-4xl">
              Message <span className="text-[#00FFFF]">print shops.</span>
            </h1>
          </div>
          <p className="max-w-xl text-xs leading-relaxed text-white/65 sm:text-right sm:text-sm">
            Chat, review files, receive quotes, and approve proofs in one place.
          </p>
        </div>
      </section>

      {/* Main Chat Container */}
      <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col gap-3 overflow-hidden p-2.5 sm:flex-row sm:p-3">
        
        <ConversationList
          conversations={conversations}
          loading={loadingConvs}
          activeConversation={activeConv}
          unreadByConversation={unreadByConv}
          onSelect={openConversation}
        />

        {/* Chat Thread */}
        <section className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
          {activeConv ? (
            <>
              {/* Active Header */}
              <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3 z-10 shrink-0">
                <div className="flex items-center gap-3">
                  <ProfileAvatar
                    src={activeConv.businesses?.owner_profile?.avatar_url || activeConv.businesses?.logo_url}
                    name={activeConv.businesses?.owner_profile?.full_name || activeConv.businesses?.name || "Print Shop"}
                    className="h-9 w-9"
                    fallbackClassName="bg-slate-900 text-white"
                    sizes="36px"
                  />
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
                      <div key={m.id} className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                        {!isMe && (
                          <ProfileAvatar
                            src={activeConv.businesses?.owner_profile?.avatar_url || activeConv.businesses?.logo_url}
                            name={activeConv.businesses?.owner_profile?.full_name || activeConv.businesses?.name || "Print Shop"}
                            className="h-8 w-8"
                            fallbackClassName="bg-slate-900 text-[#00FFFF]"
                            sizes="32px"
                          />
                        )}
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

                          {m.message_type === "video_call" ? (
                            (() => {
                              const call = videoCalls.find((item) => item.id === meta.video_call_id);
                              const callWindow = getVideoCallWindow(call);
                              const isScheduled = meta.event === "scheduled";
                              return (
                                <div className="text-center">
                                  <Video size={26} className={`mx-auto mb-2 ${isScheduled ? "text-[#00aeb5]" : "text-[#EC008C]"}`} />
                                  <p className="font-bold">{isScheduled ? "Video call scheduled" : meta.event === "cancelled" ? "Video call cancelled" : "Video call requested"}</p>
                                  {isScheduled && call?.scheduled_at && <p className="mt-1 text-[11px] opacity-80">{new Date(call.scheduled_at).toLocaleString()}</p>}
                                  {isScheduled && <p className="mt-1 text-[11px] opacity-60">Join from 15 minutes before the scheduled time. The secure room closes 30 minutes after.</p>}
                                  {isScheduled && call && (
                                    <div className="mt-3 flex w-full flex-col gap-2">
                                      <button type="button" onClick={() => joinVideoCall(call.id)} disabled={!callWindow.joinable} className="rounded-lg bg-slate-900 px-4 py-2 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
                                        {callWindow.expired ? "Call ended" : callWindow.joinable ? "Join secure call" : "Available 15 minutes before"}
                                      </button>
                                      {call.status === "SCHEDULED" && !callWindow.expired && <button type="button" onClick={() => cancelVideoCall(call.id)} className="rounded-lg border border-rose-200 px-4 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50">Cancel call</button>}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : m.content === "[VIDEO_CALL_REQUEST]" ? (
                            <div className="text-center">
                              <Video size={26} className="mx-auto mb-2 text-[#EC008C]" />
                              <p className="font-bold">Older video call request</p>
                              <p className="mt-1 text-[11px] opacity-70">Ask the shop to schedule a new secure call.</p>
                            </div>
                          ) : m.content?.startsWith("[VIDEO_CALL_INVITE:") ? (
                            (() => {
                              const timeStr = m.content.replace("[VIDEO_CALL_INVITE:", "").replace("]", "");
                              const schedTime = new Date(timeStr);
                              return (
                                <div className="text-center">
                                  <Calendar size={26} className="mx-auto mb-2 text-[#00FFFF]" />
                                  <p className="font-bold">Video call scheduled</p>
                                  <p className="mt-1 text-[11px] opacity-80">{schedTime.toLocaleString()}</p>
                                  <p className="mt-1 text-[11px] opacity-60">Includes camera, microphone, screen share, chat, raise hand, tile view, quality controls, and whiteboard.</p>
                                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">This older invite uses the previous room system. Ask the shop to reschedule it securely.</p>
                                </div>
                              );
                            })()
                          ) : m.message_type === "quote" ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-slate-900">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Formal quotation</p>
                              {meta.service_name && <p className="mt-1 text-sm font-extrabold text-slate-900">{meta.service_name}</p>}
                              <p className="mt-1 text-2xl font-extrabold">PHP {Number(meta.total_cost || meta.quote_amount || 0).toFixed(2)}</p>
                              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                                <span className="text-slate-500">Subtotal</span><span className="text-right font-semibold">PHP {Number(meta.subtotal || meta.quote_amount || 0).toFixed(2)}</span>
                                <span className="text-slate-500">Tax/VAT</span><span className="text-right font-semibold">PHP {Number(meta.taxes || 0).toFixed(2)}</span>
                                <span className="text-slate-500">Discount</span><span className="text-right font-semibold">−PHP {Number(meta.discount || 0).toFixed(2)}</span>
                                <span className="font-bold text-slate-800">Total</span><span className="text-right font-bold text-slate-800">PHP {Number(meta.total_cost || meta.quote_amount || 0).toFixed(2)}</span>
                                <span className="text-slate-500">Valid until</span><span className="text-right font-semibold">{meta.valid_until ? new Date(meta.valid_until).toLocaleDateString() : "14 days"}</span>
                                <span className="text-slate-500">Proof version</span><span className="text-right font-semibold">{meta.proof_version || "Not locked"}</span>
                              </div>
                              {meta.terms && <p className="mt-3 text-[11px] text-slate-600">{meta.terms}</p>}
                              {m.content && <p className="mt-3 whitespace-pre-wrap">{m.content}</p>}
                              {meta.ordered ? (
                                <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-[11px] font-bold text-emerald-800">
                                  <CheckCircle2 size={14} /> Order placed from this quote
                                </div>
                              ) : meta.valid_until && new Date(meta.valid_until) < new Date() ? (
                                <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-[11px] font-bold text-rose-700">This quotation has expired. Ask the shop for a new one.</p>
                              ) : meta.service_id && Number(meta.total_cost || meta.quote_amount || 0) > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const query = new URLSearchParams({
                                      checkout_service: String(meta.service_id),
                                      quote: String(meta.total_cost || meta.quote_amount),
                                      quote_id: String(m.id),
                                    });
                                    router.push(`/business/${activeConv.business_id}?${query.toString()}`);
                                  }}
                                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-[#EC008C]"
                                >
                                  Accept quote &amp; continue to checkout <ArrowRight size={14} />
                                </button>
                              ) : (
                                <p className="mt-3 rounded-lg bg-white px-3 py-2 text-[11px] text-slate-600">This quote is missing its service reference. Ask the shop to resend it from your service request.</p>
                              )}
                            </div>
                          ) : m.message_type === "service_inquiry" ? (
                            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-slate-900">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Quote request</p>
                              <p className="mt-1 text-sm font-extrabold">{meta.service_name || "Custom printing service"}</p>
                              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                                <dt className="text-slate-500">Quantity</dt><dd className="text-right font-semibold">{meta.quantity || 1}</dd>
                                {meta.selected_specs?.size && <><dt className="text-slate-500">Size</dt><dd className="text-right font-semibold">{meta.selected_specs.size}</dd></>}
                                {meta.selected_specs?.material && <><dt className="text-slate-500">Material</dt><dd className="text-right font-semibold">{meta.selected_specs.material}</dd></>}
                                {meta.selected_specs?.quality && <><dt className="text-slate-500">Quality</dt><dd className="text-right font-semibold">{meta.selected_specs.quality}</dd></>}
                                <dt className="text-slate-500">Files</dt><dd className="text-right font-semibold">{meta.attachment_count || 0}</dd>
                              </dl>
                              {meta.selected_specs?.notes && <p className="mt-2 rounded-lg bg-white p-2 text-[11px] text-slate-600">{meta.selected_specs.notes}</p>}
                              {!meta.requires_seller_quote && m.content && (
                                <p className="mt-3 whitespace-pre-wrap text-[11px] text-slate-600">{m.content}</p>
                              )}
                              <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-cyan-700">Waiting for the shop&apos;s formal quote</p>
                            </div>
                          ) : m.message_type === "design_version" || m.message_type === "design_upload" ? (
                            <div>
                              <div className="overflow-hidden rounded-2xl border-2 border-cyan-200 bg-white text-slate-900 shadow-sm">
                                <div className="flex items-start justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#00FFFF]">Design proof</p>
                                    <p className="mt-1 text-sm font-extrabold">Version {meta.version || "1"}</p>
                                  </div>
                                  <span className="rounded bg-[#FFF200] px-2 py-1 text-[9px] font-black uppercase text-slate-900">{meta.proof_status || "PENDING"}</span>
                                </div>
                                <div className="p-4">
                                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <FileText size={15} className="shrink-0 text-[#EC008C]" />
                                    <span className="min-w-0 break-all text-[11px] font-bold">{meta.file_name || "Uploaded design proof"}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <span className="text-slate-500">Type: <strong className="text-slate-800">{meta.file_type || "Design proof"}</strong></span>
                                    <span className="text-slate-500">Format: <strong className="text-slate-800">{(meta.file_format || "file").toUpperCase()}</strong></span>
                                    <span className="text-slate-500">Size: <strong className="text-slate-800">{formatBytes(meta.file_size_bytes)}</strong></span>
                                    <span className="text-slate-500">Quality: <strong className="text-slate-800">Print-ready review</strong></span>
                                  </div>
                                  {meta.quality_notes && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500">{meta.quality_notes}</p>}
                                  {!meta.is_locked && meta.proof_id && !isMe && (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button type="button" onClick={() => updateProofStatus(m, "APPROVED")} disabled={sending || meta.proof_status === "APPROVED"} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">Approve</button>
                                    <button type="button" onClick={() => updateProofStatus(m, "NEEDS_CHANGES")} disabled={sending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 disabled:opacity-40">Request changes</button>
                                  </div>
                                )}
                                </div>
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
                        {isMe && (
                          <ProfileAvatar
                            src={user?.user_metadata?.avatar_url}
                            name={user?.user_metadata?.full_name || user?.email || "You"}
                            className="h-8 w-8"
                            fallbackClassName="bg-[#EC008C] text-white"
                            sizes="32px"
                          />
                        )}
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
                    if (file) sendDesignUpload(file, designVersion);
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
                <div className="relative shrink-0">
                  {showDesignUpload && (
                    <div className="absolute bottom-14 right-0 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#EC008C]">Upload design proof version</p>
                      <label className="mt-2 block text-[11px] font-semibold text-slate-700">
                        Version number
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={designVersion}
                          onChange={(e) => setDesignVersion(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#EC008C]"
                        />
                      </label>
                      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                        PDF, PNG, JPG, WEBP, SVG, AI, PSD, EPS, TIF/TIFF · max 10 MB. Images are optimized to 5 MB.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending || !String(designVersion).trim()}
                        className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-[#EC008C] disabled:opacity-40"
                      >
                        {sending ? "Uploading…" : "Select proof file"}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowDesignUpload((visible) => !visible)}
                    disabled={sending}
                    title="Upload design proof version"
                    className="p-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    <FileText size={18} />
                  </button>
                </div>
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
      {videoCallSession && (
        <VideoCallModal
          callSession={videoCallSession}
          participantLabel={activeConv?.businesses?.name || "Print shop"}
          onClose={() => setVideoCallSession(null)}
        />
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
