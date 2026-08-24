"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Send, Loader2,
  ChevronRight, ChevronLeft, ImagePlus, Pencil, Trash2, Check, X, MoreVertical, Video, Calendar, Banknote, FileText,
  Sparkles, Plus, RotateCcw, Save
} from "lucide-react";
import {
  CHAT_IMAGES_BUCKET,
  getUploadExtension,
  MAX_IMAGE_BYTES,
  optimizeImageForUpload,
  resolveStorageUrl,
  toStorageRef,
} from "@/lib/imageUpload";
import {
  buildDefaultShopQuestions,
  getShopQuestions,
  MAX_QUESTION_LABEL_LENGTH,
  MAX_QUESTION_TEXT_LENGTH,
  MAX_SHOP_QUESTIONS,
  normalizeShopQuestions,
} from "@/lib/chatQuestions";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";
import ProfileAvatar from "@/components/ProfileAvatar";
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

export default function OwnerMessagesPage() {
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
  const [sendingImage, setSendingImage] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [unreadByConv, setUnreadByConv] = useState({});
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleCallId, setScheduleCallId] = useState(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [showQuote, setShowQuote] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteTax, setQuoteTax] = useState("");
  const [quoteDiscount, setQuoteDiscount] = useState("");
  const [quoteTerms, setQuoteTerms] = useState("Includes prepress review, proofing, print production, and standard finishing unless stated otherwise.");
  const [showDesign, setShowDesign] = useState(false);
  const [designVersion, setDesignVersion] = useState("1");
  const [videoCallSession, setVideoCallSession] = useState(null);
  const [videoCalls, setVideoCalls] = useState([]);
  const [videoCallRequestAlert, setVideoCallRequestAlert] = useState(false);
  const [viewImagePopup, setViewImagePopup] = useState(null); // { url, label }
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [questionDrafts, setQuestionDrafts] = useState([]);
  const [questionEditorError, setQuestionEditorError] = useState("");
  const [savingQuestions, setSavingQuestions] = useState(false);
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);

  const openProtectedImage = async (value, label) => {
    const url = await resolveStorageUrl(value);
    if (url) setViewImagePopup({ url, label });
    else window.alert("This attachment is unavailable or access was denied.");
  };

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
      .select("id, name, chat_suggested_questions")
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
          .select("id, full_name, email, avatar_url")
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
        _biz_questions: bizMap[c.business_id]?.chat_suggested_questions || [],
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
      // The open thread is marked read immediately. Keep its badge cleared if
      // a realtime refresh races with that update.
      if (activeConv?.id) unreadMap[activeConv.id] = 0;
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
    void markConversationRead(conv.id);
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
          filter: `conversation_id=eq.${activeConv.id}`,
        },
        async (payload) => {
          const row = payload.new || payload.old;
          if (!row?.conversation_id) return;

          await fetchMessages(activeConv.id, true);
          await markConversationRead(activeConv.id);

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
      .channel(`video-calls-owner:${activeConv.id}`)
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

  useEffect(() => {
    setVideoCallRequestAlert(videoCalls.some((call) => call.status === "REQUESTED" && call.customer_id !== user?.id));
  }, [videoCalls, user]);

  const fetchMessages = async (convId, isBg = false, limit = 20, prepend = false) => {
    const previousHeight = scrollContainerRef.current?.scrollHeight || 0;
    const previousTop = scrollContainerRef.current?.scrollTop || 0;

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
        setTimeout(() => {
          const container = scrollContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight - previousHeight + previousTop;
          }
        }, 50);
      } else if (limit === 20 || isBg) {
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
    if (prepend) setLoadingOlderMsgs(false);
    else if (!isBg) setLoadingMsgs(false);
  };

  const loadMoreMessages = async () => {
    if (!activeConv || !hasMoreMsgs || loadingOlderMsgs) return;
    const nextLimit = msgLimit + 20;
    setMsgLimit(nextLimit);
    await fetchMessages(activeConv.id, false, nextLimit, true);
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

    const { error: messageError } = await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "BUSINESS_OWNER",
      content: input.trim(),
      is_read: false,
    });

    if (messageError) {
      window.alert(messageError.message || "Could not send your message.");
      setSending(false);
      return;
    }

    setInput("");
    setSending(false);
  };

  const sendImageMessage = async (file) => {
    if (!file || !activeConv || !user) return;
    if (!file.type?.startsWith("image/")) {
      window.alert("Please upload an image file.");
      return;
    }
    setSendingImage(true);

    const optimized = await optimizeImageForUpload(file).catch((error) => {
      window.alert(error.message || `Images must be ${MAX_IMAGE_BYTES / (1024 * 1024)} MB or smaller.`);
      return null;
    });
    if (!optimized) {
      setSendingImage(false);
      return;
    }

    const ext = getUploadExtension(optimized);
    const filePath = `${activeConv.id}/${user.id}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .upload(filePath, optimized, {
        upsert: false,
        cacheControl: "31536000",
        contentType: optimized.type,
      });

    if (!uploadErr) {
      const storageRef = toStorageRef(CHAT_IMAGES_BUCKET, filePath);
      await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        sender_role: "BUSINESS_OWNER",
        content: "[image]",
        image_url: storageRef,
        metadata: {
          file_name: file.name,
          file_size_bytes: optimized.size,
          file_type: optimized.type || "image",
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
    if (!scheduleTime || !scheduleCallId || !activeConv || !user) return;
    setSending(true);
    try {
      const result = await videoCallAction("schedule", {
        callId: scheduleCallId,
        scheduledAt: new Date(scheduleTime).toISOString(),
      });
      if (result.call) setVideoCalls((current) => [result.call, ...current.filter((call) => call.id !== result.call.id)]);
    } catch (error) {
      window.alert(error.message || "Could not send the video call invite.");
      setSending(false);
      return;
    }
    setSending(false);
    setShowSchedule(false);
    setScheduleTime("");
    setScheduleCallId(null);
  };

  const openScheduleForCall = (callId) => {
    setScheduleCallId(callId);
    setShowSchedule(true);
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
    if (!window.confirm("Cancel this video call? The customer will see the update in chat.")) return;
    try {
      const result = await videoCallAction("cancel", { callId, reason: "Cancelled by shop" });
      if (result.call) setVideoCalls((current) => current.map((call) => call.id === result.call.id ? result.call : call));
    } catch (error) {
      window.alert(error.message || "Could not cancel the video call.");
    }
  };

  const sendQuoteMessage = async () => {
    if (!quoteAmount || isNaN(quoteAmount) || !activeConv || !user) return;
    setSending(true);
    
    const latestServiceInquiry = [...messages].reverse().find(m => m.message_type === 'service_inquiry');
    const serviceId = latestServiceInquiry?.metadata?.service_id || "";
    const serviceName = latestServiceInquiry?.metadata?.service_name || "";
    if (!serviceId) {
      setSending(false);
      window.alert("A customer service request is required before sending a checkout quotation.");
      return;
    }
    const latestApprovedProof = [...messages].reverse().find(
      (m) => m.message_type === "design_version" && m.metadata?.proof_status === "APPROVED"
    );
    const subtotal = parseFloat(quoteAmount);
    const taxes = Math.max(0, parseFloat(quoteTax) || 0);
    const discount = Math.max(0, parseFloat(quoteDiscount) || 0);
    const amount = subtotal + taxes - discount;
    if (!Number.isFinite(amount) || subtotal <= 0 || amount < 0) {
      setSending(false);
      window.alert("Enter a valid subtotal. Tax and discount cannot make the total negative.");
      return;
    }
    const validUntil = new Date(Date.now() + 14 * 86400000).toISOString();

    const { error: quoteError } = await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "BUSINESS_OWNER",
      content: `Formal quotation prepared. Subtotal PHP ${subtotal.toFixed(2)} + tax/VAT PHP ${taxes.toFixed(2)} − discount PHP ${discount.toFixed(2)} = total PHP ${amount.toFixed(2)}. Final cost can be locked after proof approval.`,
      message_type: 'quote',
      metadata: {
        quote_amount: amount,
        subtotal,
        taxes,
        discount,
        total_cost: amount,
        currency: "PHP",
        valid_until: validUntil,
        service_id: serviceId,
        proof_id: latestApprovedProof?.metadata?.proof_id || null,
        proof_version: latestApprovedProof?.metadata?.version || null,
        quotation_format: "formal_print_market",
        service_name: serviceName,
        inquiry_message_id: latestServiceInquiry.id,
        requested_quantity: Number(latestServiceInquiry.metadata?.quantity || 1),
        selected_specs: latestServiceInquiry.metadata?.selected_specs || {},
        terms: quoteTerms.trim() || "Includes prepress review, proofing, print production, and standard finishing unless stated otherwise.",
      },
      is_read: false,
    });
    if (quoteError) {
      window.alert(quoteError.message || "Could not send the quotation.");
      setSending(false);
      return;
    }
    setSending(false);
    setShowQuote(false);
    setQuoteAmount("");
    setQuoteTax("");
    setQuoteDiscount("");
  };

  const sendDesignVersionMessage = async (file) => {
    if (!file || !activeConv || !user) return;
    if (file.size > DESIGN_MAX_BYTES) {
      window.alert("Design proof files must be 10 MB or smaller.");
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
    const filePath = `${activeConv.id}/${user.id}-design-v${designVersion}-${Date.now()}.${ext}`;
    const storageBucket = CHAT_IMAGES_BUCKET;

    const { error: uploadErr } = await supabase.storage
      .from(storageBucket)
      .upload(filePath, uploadFile, {
        upsert: false,
        cacheControl: "31536000",
        contentType: uploadFile.type,
      });

    if (!uploadErr) {
      const storageRef = toStorageRef(storageBucket, filePath);
      let proofId = null;
      const numericVersion = Number.parseInt(designVersion, 10) || 1;
      const proofPayload = {
        conversation_id: activeConv.id,
        version_number: numericVersion,
        file_url: storageRef,
        file_name: file.name,
        file_size_bytes: uploadFile.size,
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
          file_size_bytes: uploadFile.size,
          file_type: uploadProfile.fileType,
          file_format: ext,
          file_mime: uploadProfile.mime,
          quality_notes: uploadProfile.quality,
        },
        image_url: storageRef,
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
    if (lockCost && (status !== "APPROVED" || !latestQuote)) {
      window.alert("Approve a proof and send a formal quotation before locking the final cost.");
      return;
    }
    if (lockCost && latestQuote?.metadata?.valid_until && new Date(latestQuote.metadata.valid_until) < new Date()) {
      window.alert("This quotation has expired. Send a new quotation before locking the final cost.");
      return;
    }
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

  const openQuestionEditor = () => {
    if (!activeConv) return;
    const questions = getShopQuestions({
      name: activeConv._biz_name,
      chat_suggested_questions: activeConv._biz_questions,
    });
    setQuestionDrafts(questions.map((question) => ({ ...question })));
    setQuestionEditorError("");
    setShowQuestionEditor(true);
  };

  const updateQuestionDraft = (index, field, value) => {
    setQuestionDrafts((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, [field]: value } : question
    )));
    setQuestionEditorError("");
  };

  const addQuestionDraft = () => {
    if (questionDrafts.length >= MAX_SHOP_QUESTIONS) return;
    setQuestionDrafts((current) => [
      ...current,
      {
        key: `custom-${Date.now()}`,
        label: "New question",
        customerText: "Type the complete question customers will send to your shop.",
      },
    ]);
  };

  const restoreDefaultQuestions = () => {
    setQuestionDrafts(buildDefaultShopQuestions({ name: activeConv?._biz_name }).map((question) => ({ ...question })));
    setQuestionEditorError("");
  };

  const saveShopQuestions = async (event) => {
    event.preventDefault();
    if (!activeConv || !user || savingQuestions) return;

    const hasIncompleteQuestion = questionDrafts.some((question) => (
      !String(question.label || "").trim() || !String(question.customerText || "").trim()
    ));
    if (hasIncompleteQuestion || questionDrafts.length === 0) {
      setQuestionEditorError("Keep at least one question and complete both fields for every question.");
      return;
    }

    const normalizedQuestions = normalizeShopQuestions(questionDrafts);
    if (normalizedQuestions.length !== questionDrafts.length) {
      setQuestionEditorError("One or more questions could not be saved. Check every label and full question.");
      return;
    }

    setSavingQuestions(true);
    setQuestionEditorError("");
    const { data: updatedBusiness, error } = await supabase
      .from("businesses")
      .update({ chat_suggested_questions: normalizedQuestions })
      .eq("id", activeConv.business_id)
      .eq("owner_id", user.id)
      .select("chat_suggested_questions")
      .single();

    if (error) {
      setQuestionEditorError(error.message || "Could not save these customer questions.");
      setSavingQuestions(false);
      return;
    }

    const savedQuestions = updatedBusiness?.chat_suggested_questions || normalizedQuestions;
    setConversations((current) => current.map((conversation) => (
      conversation.business_id === activeConv.business_id
        ? { ...conversation, _biz_questions: savedQuestions }
        : conversation
    )));
    setActiveConv((current) => current ? { ...current, _biz_questions: savedQuestions } : current);
    setSavingQuestions(false);
    setShowQuestionEditor(false);
  };

  /* ── UI ── */
  if (!user) {
    return <OwnerPageSkeleton rows={2} />;
  }

  return (
    <div data-tour="owner-messages" className="owner-messages-page flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden bg-[#F6F6F2] font-sans text-slate-900 md:h-[100dvh]">
      <div className="relative shrink-0 border-b border-slate-200 bg-white px-4 pb-6 pt-8 sm:px-8 sm:pb-7">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="mx-auto w-full max-w-[1920px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#EC008C]">Customer communication</p>
          <h1 className="mt-2 text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">
            Shop <span className="text-[#00AFC0]">messages.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
            Reply to customer questions, review files, send quotes, and keep every print conversation together.
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 w-full max-w-[1920px] gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
        {/* ── LEFT: CONVERSATION LIST ── */}
        <aside className={`${activeConv ? 'hidden md:flex' : 'flex'} w-full min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:w-80 lg:w-96`}>
          <div className="border-b border-slate-100 bg-[#F6F6F2] px-4 py-4 text-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EC008C]">Inbox</p>
                <h2 className="mt-1 text-sm font-extrabold">Customer conversations</h2>
              </div>
              <span className="text-[10px] font-bold text-slate-400">{conversations.length} {conversations.length === 1 ? "thread" : "threads"}</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100">
            {loadingConvs ? (
              <div className="space-y-3 p-4" aria-label="Loading conversations">
                {[1, 2, 3, 4].map((row) => (
                  <div key={row} className="flex animate-pulse items-center gap-3 rounded-xl bg-[#F6F6F2] p-4">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-[#D8D6CE]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-3/5 rounded-full bg-[#D8D6CE]" />
                      <div className="h-2 w-4/5 rounded-full bg-[#ECECE8]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <MessageSquare size={40} className="mb-4 text-slate-200" />
                <p className="text-lg font-black text-slate-400">Inbox empty</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">Customers will contact you from your shop page.</p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = activeConv?.id === conv.id;
                const unread = unreadByConv[conv.id] || 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`group flex w-full items-start gap-3 border-l-4 p-4 text-left transition-colors ${
                      isActive
                        ? "border-[#00FFFF] bg-[#EFFFFF]"
                        : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <ProfileAvatar
                      src={conv.customer_profile?.avatar_url}
                      name={convLabel(conv)}
                      className="h-10 w-10"
                      fallbackClassName="bg-slate-100 text-slate-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`break-words text-sm font-bold leading-snug ${isActive ? "text-slate-900" : "text-slate-800"}`}>
                        {convLabel(conv)}
                      </p>
                      {conv.customer_profile?.email && (
                        <p className="mt-1 break-all text-[10px] text-slate-400">
                          {conv.customer_profile.email}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    {unread > 0 && (
                      <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EC008C] px-1.5 text-[10px] font-bold text-white">
                        {unread}
                      </div>
                    )}
                    <ChevronRight size={14} className={`mt-1 shrink-0 ${isActive ? "text-[#00AFC0]" : "text-slate-300 group-hover:text-[#EC008C]"} transition-colors`} />
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── RIGHT: CHAT PANEL ── */}
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
          {!activeConv ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#F6F6F2] px-6 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-[#00FFFF] shadow-lg">
                <MessageSquare size={28} />
              </div>
              <p className="mb-2 text-2xl font-black tracking-tight text-slate-900">Select a conversation</p>
              <p className="max-w-sm text-sm text-slate-500">Choose a customer thread to reply, review files, or send a quote.</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
                <button
                  type="button"
                  onClick={() => setActiveConv(null)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-400 md:hidden"
                >
                  <ChevronLeft size={20} />
                </button>
                <ProfileAvatar
                  src={activeConv.customer_profile?.avatar_url}
                  name={convLabel(activeConv)}
                  className="h-10 w-10 max-md:hidden"
                  fallbackClassName="bg-slate-900 text-[#00FFFF]"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
                    {convLabel(activeConv)}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{activeConv._biz_name} · Reply from your shop</p>
                </div>
                <button
                  type="button"
                  onClick={openQuestionEditor}
                  className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-[#F6F6F2] px-3 py-2 text-[10px] font-bold text-slate-700 transition-colors hover:border-[#EC008C] hover:text-[#EC008C]"
                >
                  <Sparkles size={14} /> <span className="hidden sm:inline">Customer questions</span><span className="sm:hidden">Questions</span>
                </button>
              </div>

              {/* Messages area */}
              <div data-chat-scroll-area="true" ref={scrollContainerRef} className="relative min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-[#F6F6F2] p-4 sm:p-6">

                {/* Video Call Request Alert Banner */}
                {videoCallRequestAlert && (
                  <div className="sticky top-0 z-30 mb-4 flex items-center justify-between gap-4 rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EC008C] text-white">
                        <Video size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold leading-none text-slate-900">Video call requested</p>
                        <p className="mt-1 text-[11px] text-slate-500">Schedule a time for this customer’s consultation.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const pendingCall = videoCalls.find((call) => call.status === "REQUESTED");
                          if (!pendingCall) {
                            window.alert("The customer request is no longer active. Ask them to request another call.");
                            return;
                          }
                          openScheduleForCall(pendingCall.id);
                          setShowQuote(false);
                          setShowDesign(false);
                        }}
                        className="rounded-lg bg-[#EC008C] px-3 py-2 text-[10px] font-bold text-white transition-colors hover:bg-[#c90078]"
                      >
                        Schedule Now
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoCallRequestAlert(false)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-900 transition-colors"
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
                      type="button"
                      onClick={loadMoreMessages}
                      disabled={loadingOlderMsgs}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 shadow-sm transition-colors hover:border-slate-400 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60"
                    >
                      {loadingOlderMsgs ? "Loading older messages…" : "Load previous messages"}
                    </button>
                  </div>
                )}

                {loadingMsgs && messages.length === 0 ? (
                  <div className="space-y-4 py-10" aria-label="Loading messages">
                    {[1, 2, 3].map((row) => (
                      <div key={row} className={`flex animate-pulse ${row % 2 ? "justify-start" : "justify-end"}`}>
                        <div className={`h-14 rounded-2xl bg-[#D8D6CE] ${row % 2 ? "w-2/3" : "w-1/2"}`} />
                      </div>
                    ))}
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
                      <div key={msg.id} className={`flex items-end gap-3 ${isMine ? "justify-end" : "justify-start"}`}>
                        {!isMine && (
                          <ProfileAvatar
                            src={activeConv.customer_profile?.avatar_url}
                            name={convLabel(activeConv)}
                            className="h-8 w-8"
                            fallbackClassName="bg-[#1A1A1A] text-[#FFF200]"
                            sizes="32px"
                          />
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
                          ) : msg.message_type === "video_call" ? (
                            (() => {
                              const call = videoCalls.find((item) => item.id === meta.video_call_id);
                              const callWindow = getVideoCallWindow(call);
                              const isScheduled = meta.event === "scheduled";
                              return (
                                <div className="flex w-56 flex-col items-center border-t-4 border-[#00FFFF] bg-white/5 p-3 text-center">
                                  <Video size={28} className={`mb-2 ${isScheduled ? "text-[#00FFFF]" : "text-[#EC008C]"}`} />
                                  <p className="font-black uppercase text-xs">{isScheduled ? "Video Call Scheduled" : meta.event === "cancelled" ? "Video Call Cancelled" : "Video Call Requested"}</p>
                                  {isScheduled && call?.scheduled_at && <p className="mt-1 font-mono text-[10px] font-bold uppercase opacity-90">{new Date(call.scheduled_at).toLocaleString()}</p>}
                                  {!isScheduled && meta.event !== "cancelled" && !isMine && (
                                    <button type="button" onClick={() => call && openScheduleForCall(call.id)} disabled={!call} className="mt-3 w-full bg-[#EC008C] px-4 py-2 font-black uppercase text-[10px] text-white transition-all hover:bg-[#00FFFF] hover:text-[#1A1A1A] disabled:opacity-40">Schedule Call</button>
                                  )}
                                  {isScheduled && call && (
                                    <div className="mt-3 flex w-full flex-col gap-2">
                                      <button type="button" onClick={() => joinVideoCall(call.id)} disabled={!callWindow.joinable} className="w-full bg-[#EC008C] px-4 py-2 font-black uppercase text-[10px] text-white transition-all hover:bg-[#FFF200] hover:text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-40">
                                        {callWindow.expired ? "Call ended" : callWindow.joinable ? "Join secure call" : "Not yet available"}
                                      </button>
                                      {!callWindow.expired && <div className="flex gap-2">{isMine && <button type="button" onClick={() => openScheduleForCall(call.id)} className="flex-1 border border-cyan-300/40 px-2 py-1.5 font-mono text-[9px] font-bold uppercase text-cyan-200 hover:bg-cyan-300/10">Reschedule</button>}<button type="button" onClick={() => cancelVideoCall(call.id)} className="flex-1 border border-rose-200/30 px-2 py-1.5 font-mono text-[9px] font-bold uppercase text-rose-200 hover:bg-rose-200/10">Cancel</button></div>}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : msg.content === "[VIDEO_CALL_REQUEST]" ? (
                            <div className="flex flex-col items-center p-3 text-center w-48">
                              <Video size={28} className="mb-2 text-[#EC008C]" />
                              <p className="font-black uppercase text-xs whitespace-normal">Older call request</p>
                              <p className="font-mono text-[9px] uppercase mt-1 opacity-70">Schedule a new secure call.</p>
                            </div>
                          ) : msg.content?.startsWith("[VIDEO_CALL_INVITE:") ? (
                            (() => {
                              const timeStr = msg.content.replace("[VIDEO_CALL_INVITE:", "").replace("]", "");
                              const schedTime = new Date(timeStr);
                              return (
                                <div className="flex flex-col items-center p-3 text-center border-t-4 border-[#00FFFF] bg-white/5 w-56">
                                  <Calendar size={28} className={`mb-2 ${isMine ? "text-[#00FFFF]" : "text-[#EC008C]"}`} />
                                  <p className="font-black uppercase text-xs text-[#00FFFF]">Video Call Scheduled</p>
                                  <p className="font-mono text-[10px] uppercase font-bold mt-1 opacity-90">{schedTime.toLocaleString()}</p>
                                  <p className="mt-3 w-full border border-amber-200/30 bg-amber-200/10 px-3 py-2 font-mono text-[9px] uppercase text-amber-100">Older invite. Reschedule to create a secure room.</p>
                                </div>
                              );
                            })()
                          ) : msg.message_type === 'quote' ? (
                            <div className="flex flex-col p-4 border-2 border-[#FFF200] bg-[#1A1A1A] text-white min-w-[200px]">
                              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#FFF200] mb-2">Official Quote Sent</p>
                              <p className="text-3xl font-black italic text-[#00FFFF] mb-4">₱{Number(msg.metadata?.quote_amount).toFixed(2)}</p>
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono uppercase mb-4">
                                <span className="opacity-60">Subtotal</span>
                                <span className="text-right">₱{Number(meta.subtotal || meta.quote_amount || 0).toFixed(2)}</span>
                                <span className="opacity-60">Tax / VAT</span>
                                <span className="text-right">₱{Number(meta.taxes || 0).toFixed(2)}</span>
                                <span className="opacity-60">Discount</span>
                                <span className="text-right">−₱{Number(meta.discount || 0).toFixed(2)}</span>
                                <span className="font-black text-[#FFF200]">Total</span>
                                <span className="text-right font-black text-[#FFF200]">₱{Number(meta.total_cost || meta.quote_amount || 0).toFixed(2)}</span>
                                <span className="opacity-60">Valid Until</span>
                                <span className="text-right">{meta.valid_until ? new Date(meta.valid_until).toLocaleDateString() : "14 days"}</span>
                                <span className="opacity-60">Proof Version</span>
                                <span className="text-right">{meta.proof_version || "Not locked"}</span>
                              </div>
                              {meta.terms && <p className="mb-3 text-[10px] font-mono uppercase leading-relaxed opacity-70">{meta.terms}</p>}
                              {msg.content && <p className="text-sm font-bold leading-relaxed mb-4">{msg.content}</p>}
                              <p className="font-mono text-[9px] uppercase tracking-widest text-[#FFF200]/50">Waiting for customer to finalize...</p>
                            </div>
                          ) : msg.message_type === 'design_version' ? (
                            <div className="flex w-full max-w-md flex-col">
                              <div className="mb-3 overflow-hidden rounded-2xl border-2 border-[#FFF200] bg-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(255,242,0,1)]">
                                <div className="flex items-start justify-between gap-3 bg-[#FFF200] px-4 py-3 text-[#1A1A1A]">
                                  <div>
                                    <p className="font-mono text-[10px] font-black uppercase tracking-widest">Design proof</p>
                                    <p className="mt-1 text-sm font-black">Version {meta.version || "1"}</p>
                                  </div>
                                  <span className="bg-[#1A1A1A] px-2 py-1 font-mono text-[9px] font-black uppercase text-white">
                                    {meta.proof_status || "PENDING"}
                                  </span>
                                </div>
                                <div className="p-4">
                                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2">
                                    <FileText size={15} className="shrink-0 text-[#00FFFF]" />
                                    <span className="min-w-0 break-all text-[11px] font-bold">{meta.file_name || "Uploaded design proof"}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[9px] uppercase text-white/75">
                                    <span>Type: {meta.file_type || "Design proof"}</span>
                                    <span>Format: {(meta.file_format || "file").toUpperCase()}</span>
                                    <span>Size: {formatBytes(meta.file_size_bytes)}</span>
                                    <span>Quality: Print-ready review</span>
                                  </div>
                                  {meta.quality_notes && (
                                    <p className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2 font-mono text-[9px] uppercase leading-relaxed text-white/70">{meta.quality_notes}</p>
                                  )}
                                  <div className="mt-4 flex flex-wrap gap-2">
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
                                    disabled={sending || meta.is_locked || meta.proof_status !== "APPROVED" || !messages.some((candidate) => candidate.message_type === "quote")}
                                    className="bg-[#EC008C] px-3 py-2 font-black uppercase text-[9px] text-white border-2 border-[#1A1A1A] disabled:opacity-40"
                                  >
                                    Lock Cost
                                  </button>
                                  </div>
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
                              <div className="my-2 grid grid-cols-2 gap-x-4 gap-y-1 border-y border-white/15 py-2 font-mono text-[9px] uppercase">
                                <span className="opacity-60">Quantity</span><span className="text-right font-black">{msg.metadata?.quantity || 1}</span>
                                {msg.metadata?.selected_specs?.size && <><span className="opacity-60">Size</span><span className="text-right font-black">{msg.metadata.selected_specs.size}</span></>}
                                {msg.metadata?.selected_specs?.material && <><span className="opacity-60">Material</span><span className="text-right font-black">{msg.metadata.selected_specs.material}</span></>}
                                {msg.metadata?.selected_specs?.quality && <><span className="opacity-60">Quality</span><span className="text-right font-black">{msg.metadata.selected_specs.quality}</span></>}
                                <span className="opacity-60">Attachments</span><span className="text-right font-black">{msg.metadata?.attachment_count || 0}</span>
                              </div>
                              {msg.metadata?.selected_specs?.notes && <p className="mb-2 border border-white/15 bg-white/5 p-2 text-xs font-bold">{msg.metadata.selected_specs.notes}</p>}
                              <p className="whitespace-pre-wrap text-sm font-bold italic opacity-80">{msg.content}</p>
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
                                  <button onClick={() => openProtectedImage(msg.metadata.receipt_url, 'Payment Receipt')} className="font-mono text-[9px] uppercase font-black text-[#EC008C] flex items-center gap-1 hover:underline text-left">
                                    📄 View Payment Receipt
                                  </button>
                                )}
                                {msg.metadata?.refund_receipt_url && (
                                  <button onClick={() => openProtectedImage(msg.metadata.refund_receipt_url, 'Refund Proof You Uploaded')} className="font-mono text-[9px] uppercase font-black text-[#EC008C] flex items-center gap-1 hover:underline text-left">
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
                          <ProfileAvatar
                            src={user?.user_metadata?.avatar_url}
                            name={user?.user_metadata?.full_name || user?.email || "You"}
                            className="h-8 w-8"
                            fallbackClassName="bg-[#00AFC0] text-white"
                            sizes="32px"
                          />
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <form data-chat-composer="true" onSubmit={sendMessage} className="flex shrink-0 gap-3 border-t-4 border-[#1A1A1A] bg-white p-5">
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
                          <span className="font-mono text-[9px] uppercase font-black opacity-60">Subtotal (₱)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={quoteAmount}
                            onChange={(e) => setQuoteAmount(e.target.value)}
                            placeholder="e.g. 1500"
                            className="border-2 border-[#1A1A1A] px-2 py-2 text-sm font-mono focus:outline-none focus:ring-2 ring-[#00FFFF]"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="font-mono text-[9px] uppercase font-black opacity-60">Tax / VAT</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={quoteTax}
                              onChange={(e) => setQuoteTax(e.target.value)}
                              placeholder="0.00"
                              className="border-2 border-[#1A1A1A] px-2 py-2 text-sm font-mono focus:outline-none focus:ring-2 ring-[#00FFFF]"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="font-mono text-[9px] uppercase font-black opacity-60">Discount</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={quoteDiscount}
                              onChange={(e) => setQuoteDiscount(e.target.value)}
                              placeholder="0.00"
                              className="border-2 border-[#1A1A1A] px-2 py-2 text-sm font-mono focus:outline-none focus:ring-2 ring-[#00FFFF]"
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-1">
                          <span className="font-mono text-[9px] uppercase font-black opacity-60">Terms &amp; inclusions</span>
                          <textarea
                            value={quoteTerms}
                            onChange={(e) => setQuoteTerms(e.target.value)}
                            rows={3}
                            maxLength={500}
                            className="resize-none border-2 border-[#1A1A1A] px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 ring-[#00FFFF]"
                          />
                        </label>
                        <p className="font-mono text-[9px] uppercase opacity-60">Valid for 14 days · currency PHP · total = subtotal + tax − discount</p>
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
                    onClick={() => {
                      const pendingCall = videoCalls.find((call) => call.status === "REQUESTED");
                      if (!pendingCall) {
                        window.alert("A customer must request a video call before you schedule one.");
                        return;
                      }
                      if (showSchedule) {
                        setShowSchedule(false);
                        setScheduleCallId(null);
                      } else {
                        openScheduleForCall(pendingCall.id);
                      }
                    }}
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
      {showQuestionEditor && activeConv && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="question-editor-title" onClick={() => !savingQuestions && setShowQuestionEditor(false)}>
          <form onSubmit={saveShopQuestions} className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="cmyk-bar shrink-0" />
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EC008C]">Ask the shop settings</p>
                <h2 id="question-editor-title" className="mt-1 text-xl font-black text-slate-900">Customer questions for {activeConv._biz_name}</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Edit the button label and the complete message customers send. These are questions only—the shop still writes every answer.</p>
              </div>
              <button type="button" onClick={() => setShowQuestionEditor(false)} disabled={savingQuestions} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40" aria-label="Close question editor">
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#F6F6F2] p-4 sm:p-6">
              {questionDrafts.map((question, index) => (
                <section key={question.key || index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-[#00FFFF]">{index + 1}</span>
                      <p className="text-xs font-extrabold text-slate-900">Customer shortcut</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuestionDrafts((current) => current.filter((_, questionIndex) => questionIndex !== index))}
                      disabled={questionDrafts.length <= 1}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Remove question ${index + 1}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Button label</span>
                      <input
                        value={question.label}
                        onChange={(event) => updateQuestionDraft(index, "label", event.target.value)}
                        maxLength={MAX_QUESTION_LABEL_LENGTH}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none focus:border-[#EC008C] focus:ring-2 focus:ring-[#EC008C]/15"
                        placeholder="e.g. Ask about rush printing"
                      />
                      <span className="mt-1 block text-right text-[9px] text-slate-400">{question.label.length}/{MAX_QUESTION_LABEL_LENGTH}</span>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Question sent to the shop</span>
                      <textarea
                        value={question.customerText}
                        onChange={(event) => updateQuestionDraft(index, "customerText", event.target.value)}
                        maxLength={MAX_QUESTION_TEXT_LENGTH}
                        rows={2}
                        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed outline-none focus:border-[#00AFC0] focus:ring-2 focus:ring-[#00FFFF]/20"
                        placeholder="Write the complete question customers will send."
                      />
                      <span className="mt-1 block text-right text-[9px] text-slate-400">{question.customerText.length}/{MAX_QUESTION_TEXT_LENGTH}</span>
                    </label>
                  </div>
                </section>
              ))}

              {questionEditorError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{questionEditorError}</p>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={addQuestionDraft} disabled={questionDrafts.length >= MAX_SHOP_QUESTIONS || savingQuestions} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-700 hover:border-[#00AFC0] hover:text-[#008C99] disabled:opacity-40">
                  <Plus size={14} /> Add question
                </button>
                <button type="button" onClick={restoreDefaultQuestions} disabled={savingQuestions} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40">
                  <RotateCcw size={14} /> Restore defaults
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowQuestionEditor(false)} disabled={savingQuestions} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Cancel</button>
                <button type="submit" disabled={savingQuestions} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-[#EC008C] disabled:cursor-wait disabled:opacity-50">
                  {savingQuestions ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {savingQuestions ? "Saving…" : "Save questions"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      {/* ── Image Popup Modal ── */}
      {viewImagePopup && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog-surface w-full max-w-2xl overflow-hidden border-4 border-[#1A1A1A] shadow-[12px_12px_0px_0px_rgba(0,255,255,1)]">
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

      {videoCallSession && (
        <VideoCallModal
          callSession={videoCallSession}
          participantLabel={activeConv?._biz_name || "Your print shop"}
          isOwner
          onClose={() => setVideoCallSession(null)}
        />
      )}
    </div>
  );
}
