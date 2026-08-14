"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Send, Loader2, User, Store,
  ChevronRight, ChevronLeft, Hash, ImagePlus, Pencil, Trash2, Check, X, MoreVertical, Video, Calendar, Banknote, FileText
} from "lucide-react";

const DESIGN_FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,image/svg+xml,.ai,.psd,.eps,.tif,.tiff";
const DESIGN_MAX_BYTES = 50 * 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

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

export default function OwnerMessagesPage() {
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
  const [sendingImage, setSendingImage] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [unreadByConv, setUnreadByConv] = useState({});
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [showQuote, setShowQuote] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [showDesign, setShowDesign] = useState(false);
  const [designVersion, setDesignVersion] = useState("1");
  const [jitsiRoom, setJitsiRoom] = useState(null);
  const [videoCallRequestAlert, setVideoCallRequestAlert] = useState(false);
  const [viewImagePopup, setViewImagePopup] = useState(null); // { url, label }
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const jitsiScriptRef = useRef(null);

  /* ── 0. Jitsi External API (no-logo) ── */
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
      const container = document.getElementById("jitsi-container-owner");
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

    return () => {
      if (jitsiApiRef.current) {
        try { jitsiApiRef.current.dispose(); } catch (_) {}
        jitsiApiRef.current = null;
      }
    };
  }, [jitsiRoom]);

  /* ── 1. Auth ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  /* ── 2. Load conversations ── */
  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user]);

  const loadConversations = async (isBg = false) => {
    if (!isBg) setLoadingConvs(true);
    let data = [];

    // Business owner — fetch ALL their businesses
    const { data: bizList, error: bizErr } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("owner_id", user.id);

    if (bizErr) {
      console.error("[Messages] Failed to load businesses:", bizErr.message);
      if (!isBg) setLoadingConvs(false);
      return;
    }
    if (!bizList || bizList.length === 0) {
      console.warn("[Messages] No businesses found for owner:", user.id);
      if (!isBg) setLoadingConvs(false);
      return;
    }

    const bizIds = bizList.map(b => b.id);
    const bizMap = bizList.reduce((acc, b) => { acc[b.id] = b; return acc; }, {});

    // Step 1: get conversations for any of these businesses
    const { data: convs, error: convErr } = await supabase
      .from("chat_conversations")
      .select("*")
      .in("business_id", bizIds)
      .order("updated_at", { ascending: false });

    if (convErr) {
      console.error("[Messages] Failed to load conversations:", convErr.message);
      if (!isBg) setLoadingConvs(false);
      return;
    }

    if (!convs || convs.length === 0) {
      data = [];
    } else {
      // Step 2: batch-fetch customer profile names
      const customerIds = [...new Set(convs.map((c) => c.customer_id))];
      let profileMap = {};

      if (customerIds.length > 0) {
        const { data: profileRows, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", customerIds);

        if (profErr) {
          console.warn("[Messages] Could not fetch customer profiles:", profErr.message);
        }

        profileMap = (profileRows || []).reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }

      // Step 3: merge profile info into conversations
      data = convs.map((c) => ({
        ...c,
        customer_profile: profileMap[c.customer_id] || null,
        _biz_name: bizMap[c.business_id]?.name || "Your Shop",
      }));
    }

    setConversations(data);

    if (data.length > 0) {
      const convIds = data.map((c) => c.id);
      const { data: unreadRows } = await supabase
        .from("chat_messages")
        .select("conversation_id")
        .in("conversation_id", convIds)
        .eq("is_read", false)
        .neq("sender_id", user.id);

      const unreadMap = {};
      (unreadRows || []).forEach((row) => {
        unreadMap[row.conversation_id] = (unreadMap[row.conversation_id] || 0) + 1;
      });
      setUnreadByConv(unreadMap);
    } else {
      setUnreadByConv({});
    }

    if (!isBg) setLoadingConvs(false);
  };

  /* ── 3. Open a conversation ── */
  const openConversation = (conv) => {
    setActiveConv(conv);
    setMessages([]);
    setMsgLimit(20);
    setHasMoreMsgs(false);
    setUnreadByConv((prev) => ({ ...prev, [conv.id]: 0 }));
  };

  /* ── 4. Load messages + subscribe realtime + poll fallback ── */
  useEffect(() => {
    if (!activeConv) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    fetchMessages(activeConv.id, false, msgLimit);

    const channel = supabase
      .channel(`chat_owner:${activeConv.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
        },
        async (payload) => {
          const row = payload.new || payload.old;
          if (!row?.conversation_id) return;

          if (row.conversation_id === activeConv.id) {
            await fetchMessages(activeConv.id, true);
            await markConversationRead(activeConv.id);
          }

          await loadConversations(true);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [activeConv]);

  useEffect(() => {
    if (activeConv) {
      fetchMessages(activeConv.id, false, msgLimit);
    }
  }, [msgLimit]);

  // Detect unanswered video call requests
  useEffect(() => {
    if (!messages.length || !user) return;
    const hasRequest = messages.some(m => m.content === "[VIDEO_CALL_REQUEST]" && m.sender_id !== user.id);
    const hasInvite = messages.some(m => m.content?.startsWith("[VIDEO_CALL_INVITE:") && m.sender_id === user.id);
    // Show alert if there's a request and no invite has been sent yet
    setVideoCallRequestAlert(hasRequest && !hasInvite);
  }, [messages, user]);

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
          } else {
            bottomRef.current?.scrollIntoView({ behavior: isBg ? "smooth" : "auto", block: "nearest" });
          }
        }, 50);
      }
    }
    if (!isBg) setLoadingMsgs(false);
  };

  const loadMoreMessages = () => {
    setMsgLimit(prev => prev + 20);
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

  useEffect(() => {
    if (!activeConv || !user) return;
    markConversationRead(activeConv.id);
  }, [activeConv, user]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activeConv) return;
    setSending(true);

    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "BUSINESS_OWNER",
      content: input.trim(),
      is_read: false,
    });

    setInput("");
    setSending(false);
  };

  const sendImageMessage = async (file) => {
    if (!file || !activeConv || !user) return;
    if (!file.type?.startsWith("image/") || file.size > IMAGE_MAX_BYTES) {
      window.alert("Please upload an image file up to 10 MB for regular chat attachments.");
      return;
    }
    setSendingImage(true);

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const filePath = `${activeConv.id}/${user.id}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("chat-images")
      .upload(filePath, file, { upsert: false });

    if (!uploadErr) {
      const { data } = supabase.storage.from("chat-images").getPublicUrl(filePath);
      await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        sender_role: "BUSINESS_OWNER",
        content: "[image]",
        image_url: data?.publicUrl || null,
        metadata: {
          file_name: file.name,
          file_size_bytes: file.size,
          file_type: file.type || "image",
          file_format: ext,
        },
        is_read: false,
      });
    }

    setSendingImage(false);
  };

  const startEditMessage = (msg) => {
    setMenuMessageId(null);
    setEditingId(msg.id);
    if (msg.content === "[image]" || msg.content === "[VIDEO_CALL_REQUEST]" || msg.content.startsWith("[VIDEO_CALL_INVITE:")) {
      setEditingText("");
    } else {
      setEditingText(msg.content || "");
    }
  };

  const sendVideoCallInvite = async () => {
    if (!scheduleTime || !activeConv || !user) return;
    setSending(true);
    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "BUSINESS_OWNER",
      content: `[VIDEO_CALL_INVITE:${new Date(scheduleTime).toISOString()}]`,
      is_read: false,
    });
    setSending(false);
    setShowSchedule(false);
    setScheduleTime("");
  };

  const sendQuoteMessage = async () => {
    if (!quoteAmount || isNaN(quoteAmount) || !activeConv || !user) return;
    setSending(true);
    
    const latestServiceInquiry = [...messages].reverse().find(m => m.message_type === 'service_inquiry');
    const serviceId = latestServiceInquiry?.metadata?.service_id || "";
    const latestApprovedProof = [...messages].reverse().find(
      (m) => m.message_type === "design_version" && m.metadata?.proof_status === "APPROVED"
    );
    const amount = parseFloat(quoteAmount);
    const validUntil = new Date(Date.now() + 14 * 86400000).toISOString();

    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "BUSINESS_OWNER",
      content: "Detailed quotation prepared. Final cost can be locked after proof approval.",
      message_type: 'quote',
      metadata: {
        quote_amount: amount,
        subtotal: amount,
        taxes: 0,
        discount: 0,
        total_cost: amount,
        currency: "PHP",
        valid_until: validUntil,
        service_id: serviceId,
        proof_id: latestApprovedProof?.metadata?.proof_id || null,
        proof_version: latestApprovedProof?.metadata?.version || null,
        quotation_format: "formal_print_market",
        terms: "Includes prepress review, proofing, print production, and standard finishing unless stated otherwise.",
      },
      is_read: false,
    });
    setSending(false);
    setShowQuote(false);
    setQuoteAmount("");
  };

  const sendDesignVersionMessage = async (file) => {
    if (!file || !activeConv || !user) return;
    if (file.size > DESIGN_MAX_BYTES) {
      window.alert("Design proof files must be 50 MB or smaller.");
      return;
    }
    setSending(true);

    const uploadProfile = getUploadProfile(file);
    const ext = uploadProfile.extension || "file";
    const filePath = `${activeConv.id}/${user.id}-design-v${designVersion}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("chat-images")
      .upload(filePath, file, { upsert: false });

    if (!uploadErr) {
      const { data } = supabase.storage.from("chat-images").getPublicUrl(filePath);
      let proofId = null;
      const numericVersion = Number.parseInt(designVersion, 10) || 1;
      const proofPayload = {
        conversation_id: activeConv.id,
        version_number: numericVersion,
        file_url: data?.publicUrl || null,
        file_name: file.name,
        file_size_bytes: file.size,
        file_type: uploadProfile.fileType,
        file_format: ext,
        quality_notes: uploadProfile.quality,
        status: "PENDING",
        uploaded_by: user.id,
        uploaded_role: "BUSINESS_OWNER",
      };
      let { data: proofRow, error: proofErr } = await supabase
        .from("design_proofs")
        .insert(proofPayload)
        .select("id")
        .maybeSingle();
      if (proofErr) {
        const fallbackPayload = {
          conversation_id: proofPayload.conversation_id,
          version_number: proofPayload.version_number,
          file_url: proofPayload.file_url,
          file_name: proofPayload.file_name,
          file_size_bytes: proofPayload.file_size_bytes,
          file_type: `${proofPayload.file_type} | ${proofPayload.file_format} | ${proofPayload.quality_notes}`,
          status: proofPayload.status,
          uploaded_by: proofPayload.uploaded_by,
          uploaded_role: proofPayload.uploaded_role,
        };
        const retry = await supabase
          .from("design_proofs")
          .insert(fallbackPayload)
          .select("id")
          .maybeSingle();
        proofRow = retry.data;
      }
      proofId = proofRow?.id || null;

      await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        sender_role: "BUSINESS_OWNER",
        content: `Design proof version ${designVersion} uploaded for review.`,
        message_type: 'design_version',
        metadata: {
          version: designVersion,
          proof_id: proofId,
          proof_status: "PENDING",
          is_locked: false,
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
    setShowDesign(false);
    setDesignVersion((prev) => String(Number(prev) + 1));
  };

  const updateProofStatus = async (msg, status, lockCost = false) => {
    if (!activeConv || !user) return;
    const latestQuote = [...messages].reverse().find((m) => m.message_type === "quote");
    const lockedTotal = lockCost
      ? Number(latestQuote?.metadata?.total_cost || latestQuote?.metadata?.quote_amount || 0)
      : Number(msg.metadata?.locked_total_amount || 0);
    const metadata = {
      ...(msg.metadata || {}),
      proof_status: status,
      is_locked: lockCost || msg.metadata?.is_locked || false,
      locked_total_amount: lockedTotal || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };

    setSending(true);
    await supabase.from("chat_messages").update({ metadata }).eq("id", msg.id);
    if (msg.metadata?.proof_id) {
      await supabase
        .from("design_proofs")
        .update({
          status,
          is_locked: metadata.is_locked,
          locked_total_amount: metadata.locked_total_amount,
          locked_at: lockCost ? new Date().toISOString() : null,
          reviewed_by: user.id,
          reviewed_at: metadata.reviewed_at,
        })
        .eq("id", msg.metadata.proof_id);
    }
    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "BUSINESS_OWNER",
      content: lockCost
        ? `Final design version ${msg.metadata?.version || ""} and quoted cost are locked for production.`
        : `Proof version ${msg.metadata?.version || ""} marked as ${status.replace("_", " ").toLowerCase()}.`,
      message_type: "proof_status",
      metadata,
      is_read: false,
    });
    await fetchMessages(activeConv.id, true);
    setSending(false);
  };

  const markAsDesignVersion = async (msg) => {
    if (!activeConv || !user || !msg.image_url) return;
    const version = window.prompt("Enter version number or name:", "1");
    if (!version) return;

    setSending(true);
    await supabase.from("chat_messages").update({
      message_type: 'design_version',
      metadata: { ...(msg.metadata || {}), version }
    }).eq("id", msg.id);

    fetchMessages(activeConv.id, true);
    setSending(false);
  };

  const unmarkDesignVersion = async (msg) => {
    if (!activeConv || !user) return;
    setSending(true);

    const newMetadata = { ...(msg.metadata || {}) };
    delete newMetadata.version;

    await supabase.from("chat_messages").update({
      message_type: "text",
      metadata: Object.keys(newMetadata).length > 0 ? newMetadata : null
    }).eq("id", msg.id);

    fetchMessages(activeConv.id, true);
    setSending(false);
  };

  const saveEditMessage = async (msgId) => {
    if (!editingText.trim()) return;
    await supabase
      .from("chat_messages")
      .update({ content: editingText.trim(), edited_at: new Date().toISOString() })
      .eq("id", msgId)
      .eq("sender_id", user.id);
    setEditingId(null);
    setEditingText("");
    fetchMessages(activeConv.id, true);
  };

  const deleteMessage = async (msg) => {
    setMenuMessageId(null);
    await supabase
      .from("chat_messages")
      .delete()
      .eq("id", msg.id)
      .eq("sender_id", user.id);
    fetchMessages(activeConv.id, true);
  };

  const convLabel = (conv) =>
    conv.customer_profile?.full_name || conv.customer_profile?.email || "Customer";

  /* ── UI ── */
  if (!user) {
    return (
      <div className="flex items-center justify-center h-full bg-[#1A1A1A] text-[#00FFFF] font-mono">
        <Loader2 className="animate-spin mb-4" size={48} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-[#FDFDFD] font-sans">
      <div className="border-b-8 border-[#1A1A1A] px-8 py-6 bg-white shrink-0">
        <div className="mx-auto w-full max-w-[1920px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-1">
              <div className="w-4 h-1 bg-[#00FFFF]" /><div className="w-4 h-1 bg-[#EC008C]" /><div className="w-4 h-1 bg-[#FFF200]" />
            </div>
            <span className="font-mono text-[9px] uppercase tracking-[0.5em] text-gray-400">Node_Comm_Center</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-none">
            Customer_Inbox
          </h1>
        </div>
      </div>

      <div className="flex flex-1 w-full max-w-[1920px] mx-auto overflow-hidden">
        {/* ── LEFT: CONVERSATION LIST ── */}
        <aside className={`${activeConv ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 border-r-4 border-l-4 border-b-4 border-[#1A1A1A] flex-col shrink-0 bg-white`}>
          <div className="px-6 py-4 border-b-4 border-[#1A1A1A] bg-[#1A1A1A] text-white">
            <p className="font-mono text-[10px] uppercase tracking-widest font-black text-[#00FFFF]">
              {conversations.length} Active Thread{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-[#00FFFF]" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <MessageSquare size={48} className="mb-4 text-gray-200" />
                <p className="font-black uppercase italic text-lg text-gray-400">Inbox_Empty</p>
                <p className="font-mono text-[10px] uppercase opacity-40 mt-2 leading-relaxed">
                  Customers will contact you from your shop page.
                </p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = activeConv?.id === conv.id;
                const unread = unreadByConv[conv.id] || 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full text-left px-6 py-5 border-b-2 border-[#1A1A1A]/10 transition-all flex items-center gap-4 group ${
                      isActive
                        ? "bg-[#1A1A1A] text-white"
                        : "hover:bg-[#00FFFF]/10"
                    }`}
                  >
                    <div className={`w-10 h-10 flex items-center justify-center shrink-0 border-2 ${isActive ? "bg-[#00FFFF] border-[#00FFFF]" : "bg-[#F9F9F7] border-[#1A1A1A]"}`}>
                      <User size={16} className={isActive ? "text-[#1A1A1A]" : "text-[#00FFFF]"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-black uppercase italic text-sm leading-none truncate ${isActive ? "text-white" : "text-[#1A1A1A]"}`}>
                        {convLabel(conv)}
                      </p>
                      {conv.customer_profile?.email && (
                        <p className={`font-mono text-[9px] uppercase mt-1.5 font-bold truncate ${isActive ? "text-[#00FFFF]/70" : "opacity-40"}`}>
                          {conv.customer_profile.email}
                        </p>
                      )}
                      <p className={`font-mono text-[8px] uppercase mt-1 font-black ${isActive ? "text-white/40" : "opacity-30"}`}>
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    {unread > 0 && (
                      <div className="min-w-6 h-6 px-2 bg-[#EC008C] text-white border-2 border-[#1A1A1A] flex items-center justify-center font-mono text-[9px] font-black">
                        {unread}
                      </div>
                    )}
                    <ChevronRight size={14} className={`shrink-0 ${isActive ? "text-[#00FFFF]" : "opacity-0 group-hover:opacity-100 text-[#EC008C]"} transition-opacity`} />
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── RIGHT: CHAT PANEL ── */}
        <div className={`flex-1 flex-col min-w-0 border-r-4 border-b-4 border-[#1A1A1A] ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#F9F9F7]">
              <div className="w-20 h-20 bg-[#1A1A1A] flex items-center justify-center mb-6 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
                <MessageSquare size={36} className="text-[#00FFFF]" />
              </div>
              <p className="font-black uppercase italic text-2xl tracking-tighter mb-2">Select_A_Thread</p>
              <p className="font-mono text-[10px] uppercase tracking-widest opacity-40">
                Pick a conversation to begin transmission.
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-4 md:px-8 py-5 bg-white border-b-4 border-[#1A1A1A] flex items-center gap-4 shrink-0 shadow-[0_4px_0_0_rgba(26,26,26,1)]">
                <button
                  type="button"
                  onClick={() => setActiveConv(null)}
                  className="md:hidden flex items-center justify-center w-10 h-10 bg-[#1A1A1A] text-[#00FFFF] border-2 border-[#1A1A1A] shrink-0"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="w-10 h-10 bg-[#1A1A1A] items-center justify-center border-2 border-[#1A1A1A] hidden md:flex shrink-0">
                  <User size={16} className="text-[#00FFFF]" />
                </div>
                <div>
                  <p className="font-black uppercase italic text-xl tracking-tighter leading-none">
                    {convLabel(activeConv)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Hash size={10} className="text-[#00FFFF]" />
                    <p className="font-mono text-[9px] uppercase tracking-widest opacity-40 font-black">
                      {activeConv.id.split("-")[0]}
                    </p>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-1" />
                    <p className="font-mono text-[9px] uppercase tracking-widest text-green-500 font-black">Online</p>
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F9F9F7] relative">

                {/* Video Call Request Alert Banner */}
                {videoCallRequestAlert && (
                  <div className="sticky top-0 z-30 mb-4 flex items-center justify-between gap-4 bg-[#EC008C] border-4 border-[#1A1A1A] px-5 py-4 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] animate-pulse-once">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#1A1A1A] flex items-center justify-center shrink-0">
                        <Video size={20} className="text-[#00FFFF]" />
                      </div>
                      <div>
                        <p className="font-black uppercase italic text-white text-sm leading-none">Video Call Requested!</p>
                        <p className="font-mono text-[10px] uppercase text-white/70 mt-1">A customer is requesting a video consultation. Schedule a time below.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => { setShowSchedule(true); setShowQuote(false); setShowDesign(false); }}
                        className="px-4 py-2 bg-[#FFF200] text-[#1A1A1A] font-black uppercase text-[10px] border-2 border-[#1A1A1A] hover:bg-white transition-colors"
                      >
                        Schedule Now
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoCallRequestAlert(false)}
                        className="p-1 text-white hover:text-[#FFF200] transition-colors"
                        title="Dismiss"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                )}

                {hasMoreMsgs && (
                  <div className="flex justify-center pt-2 pb-4">
                    <button
                      onClick={loadMoreMessages}
                      className="bg-white border-2 border-[#1A1A1A] font-mono text-[10px] uppercase font-black tracking-widest px-4 py-2 hover:bg-[#1A1A1A] hover:text-[#00FFFF] transition-all"
                    >
                      {loadingMsgs ? "Loading..." : "Load Previous Messages"}
                    </button>
                  </div>
                )}

                {loadingMsgs && messages.length === 0 ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-[#00FFFF]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-40 mt-20">
                    <MessageSquare size={40} className="mb-3 text-gray-400" />
                    <p className="font-mono text-[10px] uppercase font-black tracking-widest">Start the conversation.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === user.id;
                    const isEditing = editingId === msg.id;
                    const meta = msg.metadata || {};
                    const uploadName = meta.file_name || "Uploaded file";
                    const isPreviewable = Boolean(msg.image_url && (meta.file_mime?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(uploadName)));
                    return (
                      <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        {!isMine && (
                          <div className="w-8 h-8 bg-[#1A1A1A] flex items-center justify-center shrink-0 mr-3 mt-auto">
                            <User size={13} className="text-[#FFF200]" />
                          </div>
                        )}
                        <div className={`relative max-w-[65%] px-5 py-4 border-2 ${
                          isMine
                            ? "bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]"
                            : "bg-white text-[#1A1A1A] border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(236,0,140,0.3)]"
                        }`}>
                          {msg.image_url && (
                            <div className="relative group/img inline-block">
                              {isPreviewable ? (
                                <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={msg.image_url}
                                    alt={uploadName}
                                    className={`mb-3 max-h-80 w-auto rounded border-2 border-black/20 ${msg.message_type === 'design_version' ? 'border-[#FFF200]' : ''}`}
                                  />
                                </a>
                              ) : (
                                <a
                                  href={msg.image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`mb-3 flex min-w-64 items-center gap-3 border-2 p-4 font-mono text-[10px] font-black uppercase hover:bg-[#FFF200] ${msg.message_type === 'design_version' ? 'border-[#FFF200]' : 'border-[#1A1A1A]'}`}
                                >
                                  <FileText size={26} className="shrink-0" />
                                  <span className="break-all text-left">{uploadName}</span>
                                </a>
                              )}
                              
                              {/* Label if it is a design version */}
                              {msg.message_type === 'design_version' && (
                                <div className="absolute bottom-5 left-2 bg-[#1A1A1A] text-[#FFF200] font-mono text-[9px] font-black uppercase tracking-widest px-2 py-1 shadow-[2px_2px_0px_0px_rgba(255,242,0,1)]">
                                  VERSION {meta.version || "1"}
                                </div>
                              )}

                              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover/img:opacity-100 z-10 transition-opacity">
                                {msg.message_type === 'design_version' ? (
                                  <button
                                    onClick={() => unmarkDesignVersion(msg)}
                                    className="bg-[#EC008C] text-white font-black text-[9px] uppercase px-2 py-1 border-2 border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#EC008C] transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                                  >
                                    Unmark
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => markAsDesignVersion(msg)}
                                    className="bg-[#FFF200] text-[#1A1A1A] font-black text-[9px] uppercase px-2 py-1 border-2 border-[#1A1A1A] hover:bg-[#00FFFF] transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                                  >
                                    Mark as Version
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full px-3 py-2 border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] font-mono text-sm"
                              />
                              <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => saveEditMessage(msg.id)} className="p-1 border-2 border-[#1A1A1A] bg-[#00FFFF] text-[#1A1A1A]"><Check size={12} /></button>
                                <button type="button" onClick={() => { setEditingId(null); setEditingText(""); }} className="p-1 border-2 border-[#1A1A1A] bg-white text-[#1A1A1A]"><X size={12} /></button>
                              </div>
                            </div>
                          ) : msg.content === "[VIDEO_CALL_REQUEST]" ? (
                            <div className="flex flex-col items-center p-3 text-center w-48">
                              <Video size={28} className={`mb-2 ${isMine ? "text-[#00FFFF]" : "text-[#EC008C]"}`} />
                              <p className="font-black uppercase text-xs whitespace-normal">Video Call Requested</p>
                              <p className="font-mono text-[9px] uppercase mt-1 opacity-70">
                                {isMine ? "You requested a call" : "Customer is waiting..."}
                              </p>
                              {!isMine && (
                                <button
                                  type="button"
                                  onClick={() => setShowSchedule(true)}
                                  className="mt-3 px-4 py-2 w-full bg-[#EC008C] text-white font-black uppercase text-[10px] hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all"
                                >
                                  Schedule Call
                                </button>
                              )}
                            </div>
                          ) : msg.content.startsWith("[VIDEO_CALL_INVITE:") ? (
                            (() => {
                              const timeStr = msg.content.replace("[VIDEO_CALL_INVITE:", "").replace("]", "");
                              const schedTime = new Date(timeStr);
                              const isExpired = Date.now() - schedTime.getTime() > (30 * 60 * 1000);
                              const joinable = !isExpired && (schedTime.getTime() - Date.now()) <= (15 * 60 * 1000);
                              return (
                                <div className="flex flex-col items-center p-3 text-center border-t-4 border-[#00FFFF] bg-white/5 w-56">
                                  <Calendar size={28} className={`mb-2 ${isMine ? "text-[#00FFFF]" : "text-[#EC008C]"}`} />
                                  <p className="font-black uppercase text-xs text-[#00FFFF]">Video Call Scheduled</p>
                                  <p className="font-mono text-[10px] uppercase font-bold mt-1 opacity-90">{schedTime.toLocaleString()}</p>
                                  {isExpired ? (
                                    <button disabled className="mt-3 px-4 py-2 w-full bg-[#1A1A1A]/50 text-white/50 font-black uppercase text-xs border border-[#1A1A1A]/50 cursor-not-allowed">
                                      Link Expired
                                    </button>
                                  ) : joinable ? (
                                    <button
                                      type="button"
                                      onClick={() => setJitsiRoom(`print-app-call-${activeConv.id}`)}
                                      className="mt-3 px-4 py-2 w-full bg-[#EC008C] hover:bg-[#FFF200] hover:text-[#1A1A1A] text-white font-black uppercase text-xs border border-transparent hover:border-[#1A1A1A] transition-all"
                                    >
                                      Join Call
                                    </button>
                                  ) : (
                                    <button disabled className="mt-3 px-4 py-2 w-full bg-[#1A1A1A]/50 text-white/50 font-black uppercase text-xs border border-[#1A1A1A]/50 cursor-not-allowed">
                                      Not yet available
                                    </button>
                                  )}
                                </div>
                              );
                            })()
                          ) : msg.message_type === 'quote' ? (
                            <div className="flex flex-col p-4 border-2 border-[#FFF200] bg-[#1A1A1A] text-white min-w-[200px]">
                              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#FFF200] mb-2">Official Quote Sent</p>
                              <p className="text-3xl font-black italic text-[#00FFFF] mb-4">₱{Number(msg.metadata?.quote_amount).toFixed(2)}</p>
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono uppercase mb-4">
                                <span className="opacity-60">Valid Until</span>
                                <span className="text-right">{meta.valid_until ? new Date(meta.valid_until).toLocaleDateString() : "14 days"}</span>
                                <span className="opacity-60">Proof Version</span>
                                <span className="text-right">{meta.proof_version || "Not locked"}</span>
                              </div>
                              {msg.content && <p className="text-sm font-bold leading-relaxed mb-4">{msg.content}</p>}
                              <p className="font-mono text-[9px] uppercase tracking-widest text-[#FFF200]/50">Waiting for customer to finalize...</p>
                            </div>
                          ) : msg.message_type === 'design_version' ? (
                            <div className="flex flex-col min-w-64">
                              <div className="mb-3 border-2 border-[#FFF200] bg-[#FFF200]/10 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#FFF200]">Proof Version {meta.version || "1"}</p>
                                  <span className="bg-[#1A1A1A] px-2 py-1 font-mono text-[9px] font-black uppercase text-white">
                                    {meta.proof_status || "PENDING"}
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[9px] uppercase opacity-80">
                                  <span>Type: {meta.file_type || "Design proof"}</span>
                                  <span>Format: {(meta.file_format || "file").toUpperCase()}</span>
                                  <span>Size: {formatBytes(meta.file_size_bytes)}</span>
                                  <span>Quality: Print-ready review</span>
                                </div>
                                {meta.quality_notes && (
                                  <p className="mt-2 font-mono text-[9px] uppercase leading-relaxed opacity-70">{meta.quality_notes}</p>
                                )}
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateProofStatus(msg, "APPROVED")}
                                    disabled={sending || meta.proof_status === "APPROVED"}
                                    className="bg-[#00FFFF] px-3 py-2 font-black uppercase text-[9px] text-[#1A1A1A] border-2 border-[#1A1A1A] disabled:opacity-40"
                                  >
                                    Approve Proof
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateProofStatus(msg, "NEEDS_CHANGES")}
                                    disabled={sending || meta.is_locked}
                                    className="bg-white px-3 py-2 font-black uppercase text-[9px] text-[#1A1A1A] border-2 border-[#1A1A1A] disabled:opacity-40"
                                  >
                                    Needs Changes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateProofStatus(msg, "APPROVED", true)}
                                    disabled={sending || meta.is_locked}
                                    className="bg-[#EC008C] px-3 py-2 font-black uppercase text-[9px] text-white border-2 border-[#1A1A1A] disabled:opacity-40"
                                  >
                                    Lock Cost
                                  </button>
                                </div>
                              </div>
                              {msg.content && msg.content !== "[image]" && (
                                <p className="text-sm font-bold leading-relaxed mb-3">{msg.content}</p>
                              )}
                            </div>
                          ) : msg.message_type === 'proof_status' ? (
                            <div className="flex flex-col border-l-4 border-[#FFF200] pl-3">
                              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#FFF200]">Proof Update</p>
                              <p className="text-sm font-bold leading-relaxed">{msg.content}</p>
                            </div>
                          ) : msg.message_type === 'service_inquiry' ? (
                            <div className="flex flex-col p-3 border-l-4 border-[#00FFFF] bg-white/5">
                              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#00FFFF] mb-1">Service Inquiry</p>
                              {msg.metadata?.service_name && (
                                <p className="font-black uppercase text-sm mb-1">{msg.metadata.service_name}</p>
                              )}
                              <p className="text-sm font-bold italic opacity-80">{msg.content}</p>
                            </div>
                          ) : msg.message_type === 'refund_dispute' ? (
                            <div className="flex flex-col p-4 border-2 border-[#EC008C] bg-[#EC008C]/10 min-w-[220px]">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-[#EC008C] rounded-full animate-pulse" />
                                <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#EC008C]">Refund Dispute</p>
                              </div>
                              <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap mb-3">{msg.content}</p>
                              <div className="flex flex-col gap-1 border-t border-[#EC008C]/30 pt-2">
                                {msg.metadata?.receipt_url && (
                                  <button onClick={() => setViewImagePopup({ url: msg.metadata.receipt_url, label: 'Payment Receipt' })} className="font-mono text-[9px] uppercase font-black text-[#EC008C] flex items-center gap-1 hover:underline text-left">
                                    📄 View Payment Receipt
                                  </button>
                                )}
                                {msg.metadata?.refund_receipt_url && (
                                  <button onClick={() => setViewImagePopup({ url: msg.metadata.refund_receipt_url, label: 'Refund Proof You Uploaded' })} className="font-mono text-[9px] uppercase font-black text-[#EC008C] flex items-center gap-1 hover:underline text-left">
                                    🧾 View Refund Proof You Uploaded
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : msg.message_type === 'category_list' ? (
                            <div className="flex flex-col min-w-[200px]">
                              {msg.content && <p className="text-sm font-bold leading-relaxed mb-3">{msg.content}</p>}
                              {msg.metadata?.categories && msg.metadata.categories.length > 0 && (
                                <div className="flex flex-col gap-2">
                                  {msg.metadata.categories.map((cat, i) => (
                                    <button
                                      key={i}
                                      disabled
                                      className="text-left px-3 py-2 border-2 border-[#1A1A1A] bg-[#FFF200] text-[#1A1A1A] font-mono text-[10px] font-black uppercase tracking-widest cursor-default"
                                    >
                                      {cat}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            msg.content !== "[image]" && <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap word-break break-words">{msg.content}</p>
                          )}

                          {isMine && !isEditing && (
                            <>
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => setMenuMessageId((prev) => (prev === msg.id ? null : msg.id))}
                                  className={`p-1 border ${isMine ? "border-white/40" : "border-black/40"}`}
                                  aria-label="More actions"
                                >
                                  <MoreVertical size={12} />
                                </button>
                              </div>

                              {menuMessageId === msg.id && (
                                <div className="absolute right-3 top-12 z-20 w-28 border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                                  <button
                                    type="button"
                                    onClick={() => startEditMessage(msg)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[10px] font-black uppercase hover:bg-[#00FFFF]"
                                  >
                                    <Pencil size={11} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteMessage(msg)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[10px] font-black uppercase hover:bg-[#EC008C] hover:text-white"
                                  >
                                    <Trash2 size={11} /> Delete
                                  </button>
                                </div>
                              )}
                            </>
                          )}

                          <p className={`font-mono text-[8px] uppercase mt-2 font-black tracking-wider ${isMine ? "opacity-40 text-right" : "opacity-40"}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {msg.edited_at ? " • edited" : ""}
                          </p>
                        </div>
                        {isMine && (
                          <div className="w-8 h-8 bg-[#00FFFF] flex items-center justify-center shrink-0 ml-3 mt-auto">
                            <Store size={13} className="text-[#1A1A1A]" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <form onSubmit={sendMessage} className="flex gap-3 p-5 border-t-4 border-[#1A1A1A] bg-white shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Tab") {
                      e.preventDefault();
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1 px-5 py-4 border-2 border-[#1A1A1A] font-mono text-sm bg-[#F9F9F7] focus:outline-none focus:bg-white focus:ring-4 ring-[#00FFFF]/40 transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
                />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={showDesign ? DESIGN_FILE_ACCEPT : "image/*"}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (showDesign) {
                          sendDesignVersionMessage(file);
                        } else {
                          sendImageMessage(file);
                        }
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => { setShowDesign(false); fileInputRef.current?.click(); }}
                    disabled={sendingImage || sending}
                    className="w-14 h-14 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] flex items-center justify-center hover:bg-[#FFF200] transition-all disabled:opacity-40 shrink-0"
                    title="Attach Image"
                  >
                    {sendingImage && !showDesign ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
                  </button>
                  <div className="relative flex shrink-0">
                    {showDesign && (
                      <div className="absolute bottom-16 right-0 bg-white border-2 border-[#1A1A1A] p-4 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] flex flex-col gap-3 z-50 w-64">
                        <p className="font-black uppercase italic text-sm border-b-2 border-[#1A1A1A] pb-2">Upload Design Version</p>
                        <label className="flex flex-col gap-1">
                          <span className="font-mono text-[9px] uppercase font-black opacity-60">Version #</span>
                          <input
                            type="text"
                            value={designVersion}
                            onChange={(e) => setDesignVersion(e.target.value)}
                            className="border-2 border-[#1A1A1A] px-2 py-2 text-sm font-mono focus:outline-none focus:ring-2 ring-[#00FFFF]"
                          />
                        </label>
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setShowDesign(false)}
                            className="flex-1 bg-white border-2 border-[#1A1A1A] font-black uppercase text-[10px] py-2 hover:bg-[#1A1A1A] hover:text-white transition-all text-center"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!designVersion || sending}
                            className="flex-1 bg-[#FFF200] border-2 border-[#1A1A1A] font-black uppercase text-[10px] py-2 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all text-center disabled:opacity-40"
                          >
                            {sending ? "..." : "Select File"}
                          </button>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setShowDesign(!showDesign); setShowSchedule(false); setShowQuote(false); }}
                      disabled={sending}
                      className="w-14 h-14 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] flex items-center justify-center hover:bg-[#FFF200] transition-all disabled:opacity-40"
                      title="Upload Design Version"
                    >
                      <FileText size={20} />
                    </button>
                  </div>
                  <div className="relative flex shrink-0">
                    {showQuote && (
                      <div className="absolute bottom-16 right-0 bg-white border-2 border-[#1A1A1A] p-4 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] flex flex-col gap-3 z-50 w-64">
                        <p className="font-black uppercase italic text-sm border-b-2 border-[#1A1A1A] pb-2">Send Official Quote</p>
                        <label className="flex flex-col gap-1">
                          <span className="font-mono text-[9px] uppercase font-black opacity-60">Amount (₱)</span>
                          <input
                            type="number"
                            value={quoteAmount}
                            onChange={(e) => setQuoteAmount(e.target.value)}
                            placeholder="e.g. 1500"
                            className="border-2 border-[#1A1A1A] px-2 py-2 text-sm font-mono focus:outline-none focus:ring-2 ring-[#00FFFF]"
                          />
                        </label>
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setShowQuote(false)}
                            className="flex-1 bg-white border-2 border-[#1A1A1A] font-black uppercase text-[10px] py-2 hover:bg-[#1A1A1A] hover:text-white transition-all text-center"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={sendQuoteMessage}
                            disabled={!quoteAmount || sending}
                            className="flex-1 bg-[#00FFFF] border-2 border-[#1A1A1A] font-black uppercase text-[10px] py-2 hover:bg-[#EC008C] hover:text-white transition-all text-center disabled:opacity-40"
                          >
                            {sending ? "..." : "Send"}
                          </button>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setShowQuote(!showQuote); setShowSchedule(false); setShowDesign(false); }}
                      disabled={sending}
                      className="w-14 h-14 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] flex items-center justify-center hover:bg-[#00FFFF] transition-all disabled:opacity-40"
                      title="Send Quote"
                    >
                      <Banknote size={20} />
                    </button>
                  </div>
                  <div className="relative flex shrink-0">
                  {showSchedule && (
                    <div className="absolute bottom-16 right-0 bg-white border-2 border-[#1A1A1A] p-4 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] flex flex-col gap-3 z-50 w-72">
                      <p className="font-black uppercase italic text-sm border-b-2 border-[#1A1A1A] pb-2">Schedule Video Call</p>
                      <p className="font-mono text-[9px] uppercase leading-relaxed opacity-60">
                        Includes camera, microphone, screen share, chat, raise hand, tile view, video quality controls, and whiteboard.
                      </p>
                      <label className="flex flex-col gap-1">
                        <span className="font-mono text-[9px] uppercase font-black opacity-60">Select Time (Local)</span>
                        <input
                          type="datetime-local"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="border-2 border-[#1A1A1A] px-2 py-2 text-sm font-mono focus:outline-none focus:ring-2 ring-[#00FFFF]"
                        />
                      </label>
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setShowSchedule(false)}
                          className="flex-1 bg-white border-2 border-[#1A1A1A] font-black uppercase text-[10px] py-2 hover:bg-[#1A1A1A] hover:text-white transition-all text-center"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={sendVideoCallInvite}
                          disabled={!scheduleTime || sending}
                          className="flex-1 bg-[#00FFFF] border-2 border-[#1A1A1A] font-black uppercase text-[10px] py-2 hover:bg-[#EC008C] hover:text-white transition-all text-center disabled:opacity-40"
                        >
                          {sending ? "Sending..." : "Send Invite"}
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSchedule(!showSchedule)}
                    disabled={sending}
                    className="w-14 h-14 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] flex items-center justify-center hover:bg-[#00FFFF] transition-all disabled:opacity-40"
                    title="Schedule Video Call"
                  >
                    <Video size={20} />
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="w-14 h-14 bg-[#1A1A1A] text-[#00FFFF] flex items-center justify-center hover:bg-[#EC008C] hover:text-white transition-all disabled:opacity-40 shadow-[4px_4px_0px_0px_rgba(0,255,255,1)] hover:shadow-[4px_4px_0px_0px_rgba(236,0,140,0.5)] shrink-0"
                >
                  {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      {/* ── Image Popup Modal ── */}
      {viewImagePopup && (
        <div className="fixed inset-0 z-[998] flex items-center justify-center bg-[#1A1A1A]/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#FDFDFD] border-4 border-[#1A1A1A] shadow-[12px_12px_0px_0px_rgba(0,255,255,1)]">
            <div className="flex items-center justify-between px-6 py-4 border-b-4 border-[#1A1A1A] bg-[#1A1A1A] text-white">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#00FFFF]" />
                  <div className="w-2 h-2 bg-[#EC008C]" />
                  <div className="w-2 h-2 bg-[#FFF200]" />
                </div>
                <span className="font-black uppercase italic tracking-widest">{viewImagePopup.label}</span>
              </div>
              <button onClick={() => setViewImagePopup(null)} className="p-1 hover:bg-[#EC008C] transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 bg-gray-100 flex items-center justify-center min-h-[300px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={viewImagePopup.url} alt={viewImagePopup.label} className="max-w-full max-h-[70vh] object-contain border-4 border-[#1A1A1A]" />
            </div>
            <div className="p-4 border-t-4 border-[#1A1A1A] flex justify-end">
              <button onClick={() => setViewImagePopup(null)} className="bg-[#1A1A1A] text-white px-6 py-3 font-black uppercase text-[10px] hover:bg-[#EC008C] transition-all shadow-[4px_4px_0px_0px_rgba(0,255,255,1)] active:shadow-none">
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Jitsi In-App Modal ── */}
      {jitsiRoom && (
        <div className="fixed inset-0 z-[999] flex flex-col bg-[#1A1A1A]">
          <div className="flex items-center justify-between px-6 py-3 border-b-4 border-[#00FFFF] bg-[#1A1A1A] shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="font-black text-lg uppercase italic tracking-tighter leading-none text-white">
                  Press <span className="text-[#00FFFF]">&amp;</span> Present
                </span>
                <div className="flex gap-1 ml-1">
                  <div className="w-2 h-2 bg-[#00FFFF]" />
                  <div className="w-2 h-2 bg-[#EC008C]" />
                  <div className="w-2 h-2 bg-[#FFF200]" />
                </div>
              </div>
              <div className="w-px h-5 bg-white/20" />
              <Video size={16} className="text-[#00FFFF]" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#00FFFF] font-black">Live_Call</p>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            </div>
            <button
              type="button"
              onClick={() => setJitsiRoom(null)}
              className="flex items-center gap-2 px-4 py-2 bg-[#EC008C] text-white font-black uppercase text-[10px] border-2 border-[#EC008C] hover:bg-[#FFF200] hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-all"
            >
              <X size={14} /> End &amp; Close
            </button>
          </div>
          <div id="jitsi-container-owner" className="flex-1 w-full" />
        </div>
      )}
    </div>
  );
}
