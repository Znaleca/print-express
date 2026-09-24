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
import MeetingBookingModal from "@/components/MeetingBookingModal";
import { getVideoCallWindow, videoCallAction } from "@/lib/videoCalls";
import { formatMeetingDateTime, getMeetingStatusLabel } from "@/lib/meetingScheduling";
import { getInquiryForMessage, getProofsForInquiry } from "@/lib/designProofScope.mjs";

const DESIGN_FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,image/svg+xml,.ai,.psd,.eps,.tif,.tiff";
const DESIGN_MAX_BYTES = 10 * 1024 * 1024;
const MAX_DESIGN_VERSIONS = 10;

const normalizeDesignVersion = (value) => {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number <= MAX_DESIGN_VERSIONS ? number : null;
};

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

const getDesignProofMessages = (messages = []) => {
  const seen = new Set();
  return [...messages]
    .filter((message) => (
      message.message_type === "design_version"
      && message.metadata?.proof_id
      && message.metadata?.version
    ))
    .filter((message) => {
      const proofId = String(message.metadata.proof_id);
      if (seen.has(proofId)) return false;
      seen.add(proofId);
      return true;
    });
};

const formatCatalogPriceRange = (minimum, maximum = minimum) => {
  const lower = Number(minimum);
  const upper = Math.max(lower, Number(maximum));
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return null;
  const format = (value) => `₱${value.toFixed(2)}`;
  return upper > lower ? `${format(lower)}–${format(upper)}` : format(lower);
};

function MessagesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initBizId = searchParams.get("business");
  const initConversationId = searchParams.get("conversation");
  const openScheduleFromLink = searchParams.get("schedule") === "1";

  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [allInquiries, setAllInquiries] = useState([]);
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
  const [showMeetingBooking, setShowMeetingBooking] = useState(false);
  const [showMeetingView, setShowMeetingView] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showDesignUpload, setShowDesignUpload] = useState(false);
  const [designVersion, setDesignVersion] = useState("1");
  const [quoteDesignSelections, setQuoteDesignSelections] = useState({});
  const [realtimeStatus, setRealtimeStatus] = useState("OFFLINE");
  const [viewImagePopup, setViewImagePopup] = useState(null);
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const msgLimitRef = useRef(20);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);
  const scheduleLinkHandledRef = useRef(false);
  const scopeMessages = useMemo(() => [...new Map([...messages, ...allInquiries].map((message) => [message.id, message])).values()], [messages, allInquiries]);
  const latestInquiry = allInquiries[0] || [...messages].reverse().find((message) => message.message_type === "service_inquiry");

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
  }, [initBizId, initConversationId]);

  const loadConversations = async (currentUser = user) => {
    if (!currentUser) return;
    setLoadingConvs(true);

    const { data: convsData } = await supabase
      .from("chat_conversations")
      .select(`
        id, created_at, business_id,
        businesses (
          name, logo_url, owner_id, description, products_summary, address, is_open, chat_suggested_questions,
           services ( id, name, item_type, price, price_max, description, category, available, image_url, stock_qty, is_customizable, specs_json )
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
      const target = initConversationId
        ? hydratedConversations.find((c) => c.id === initConversationId)
        : hydratedConversations.find((c) => c.business_id === initBizId);
      if (target) setActiveConv(target);
    } else if (hydratedConversations.length > 0 && !activeConv) {
      setActiveConv(hydratedConversations[0]);
    }

    setLoadingConvs(false);
  };

  useEffect(() => {
    if (!activeConv) {
      setRealtimeStatus("OFFLINE");
      return undefined;
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    msgLimitRef.current = 20;
    setMsgLimit(20);
    setMessages([]);
    setAllInquiries([]);
    setHasMoreMsgs(false);
    setRealtimeStatus("CONNECTING");
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
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("LIVE");
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setRealtimeStatus("RECONNECTING");
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      setRealtimeStatus("OFFLINE");
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

    const [{ data, count }, { data: designRows }, { data: inquiryRows }] = await Promise.all([
      supabase
        .from("chat_messages")
        .select("*", { count: "exact" })
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(limit),
      // Design versions are selectable quote assets, so load all of them even
      // when the rest of the thread is paginated to the latest 20 messages.
      supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", convId)
        .eq("message_type", "design_version")
        .order("created_at", { ascending: false }),
      supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", convId)
        .eq("message_type", "service_inquiry")
        .order("created_at", { ascending: false }),
    ]);

    if (data) {
      setAllInquiries(inquiryRows || []);
      const messageRows = [...new Map([...(data || []), ...(designRows || [])].map((message) => [message.id, message])).values()];
      const resolvedData = await Promise.all(messageRows.map(async (message) => ({
        ...message,
        storage_ref: message.image_url || null,
        image_url: message.image_url ? await resolveStorageUrl(message.image_url) : null,
      })));
      const orderedMessages = resolvedData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      if (prepend) {
        setMessages((currentMessages) => {
          const merged = new Map([...currentMessages, ...orderedMessages].map((message) => [message.id, message]));
          return [...merged.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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
    const latestServiceInquiry = latestInquiry;
    if (file.size > DESIGN_MAX_BYTES) {
      window.alert("Design files must be 10 MB or smaller.");
      return;
    }
    const normalizedVersion = String(requestedVersion || "").trim();
    const numericVersion = normalizeDesignVersion(normalizedVersion);
    if (!numericVersion) {
      window.alert("Enter a whole-number proof version such as 1, 2, or 3.");
      return;
    }
    const versionLabel = String(numericVersion);

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
    const safeVersion = versionLabel;
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
      version_number: numericVersion,
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
      content: `Customer design proof version ${versionLabel} uploaded for review.`,
      message_type: "design_version",
      metadata: {
        version: versionLabel,
        proof_id: proofRow.id,
        inquiry_message_id: latestServiceInquiry?.id || null,
        service_id: latestServiceInquiry?.metadata?.service_id || null,
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
      setDesignVersion(numericVersion < MAX_DESIGN_VERSIONS ? String(numericVersion + 1) : "");
    }

    setSending(false);
  };

  const acceptQuote = async (quoteMessage, selectedDesign = null) => {
    if (!activeConv || !user || sending) return;

    const meta = quoteMessage.metadata || {};
    const totalCost = Number(meta.total_cost || meta.quote_amount || 0);
    const service = activeConv.businesses?.services?.find((item) => String(item.id) === String(meta.service_id));
    if (!service || !meta.service_id || !Number.isFinite(totalCost) || totalCost <= 0) {
      window.alert("This quote is missing the service details needed to add it to your cart.");
      return;
    }
    if (meta.valid_until && new Date(meta.valid_until) < new Date()) {
      window.alert("This quotation has expired. Ask the shop to send a new quote.");
      return;
    }

    const existingAcceptance = messages.find((message) => (
      message.message_type === "quote_acceptance"
      && String(message.metadata?.quote_id) === String(quoteMessage.id)
    ));
    const designReference = selectedDesign?.storage_ref || null;
    const selectedVersion = selectedDesign?.metadata?.version || meta.proof_version || null;
    const selectedSpecs = {
      ...(meta.selected_specs || {}),
      requested_quantity: Number(meta.requested_quantity || meta.quantity || 1),
    };
    const cartItemKey = `quote-${quoteMessage.id}`;
    const cartItem = {
      ...service,
      price: totalCost,
      base_price: totalCost,
      quantity: 1,
      isQuotedCheckout: true,
      sourceMessageId: quoteMessage.id,
      cart_item_id: cartItemKey,
      selected_specs: selectedSpecs,
      designUrl: designReference,
      designVersion: selectedVersion,
      designFiles: designReference
        ? [{ url: designReference, name: selectedDesign?.metadata?.file_name || `Design version ${selectedVersion || "selected"}` }]
        : [],
    };

    setSending(true);
    try {
      if (!existingAcceptance) {
        const { error } = await supabase.from("chat_messages").insert({
          conversation_id: activeConv.id,
          sender_id: user.id,
          sender_role: "CUSTOMER",
          content: `Quote accepted for ${meta.service_name || service.name}. It was added to my cart${selectedVersion ? ` with design version ${selectedVersion}` : ""}.`,
          message_type: "quote_acceptance",
          metadata: {
            quote_id: quoteMessage.id,
            service_id: meta.service_id,
            service_name: meta.service_name || service.name,
            total_cost: totalCost,
            design_version: selectedVersion,
            proof_id: selectedDesign?.metadata?.proof_id || meta.proof_id || null,
            proof_file_name: selectedDesign?.metadata?.file_name || null,
            accepted_at: new Date().toISOString(),
          },
          is_read: false,
        });
        if (error) throw error;
      }

      const businessId = activeConv.business_id;
      let cart = [];
      try {
        const storedCart = JSON.parse(localStorage.getItem(`cart_${businessId}`) || "[]");
        if (Array.isArray(storedCart)) cart = storedCart;
      } catch {
        cart = [];
      }
      const existingIndex = cart.findIndex((item) => item.sourceMessageId === quoteMessage.id || item.cart_item_id === cartItemKey);
      if (existingIndex >= 0) cart[existingIndex] = { ...cart[existingIndex], ...cartItem };
      else cart.push(cartItem);

      let checkedKeys = cart.map((item) => item.cart_item_id || item.sourceMessageId || item.id);
      try {
        const storedChecked = JSON.parse(localStorage.getItem(`cart_checked_${businessId}`) || "[]");
        if (Array.isArray(storedChecked)) checkedKeys = [...new Set([...storedChecked, cartItemKey])].filter((key) => checkedKeys.includes(key));
      } catch {
        // Select the accepted quote when the previous cart selection is unavailable.
      }
      localStorage.setItem(`cart_${businessId}`, JSON.stringify(cart));
      localStorage.setItem(`cart_checked_${businessId}`, JSON.stringify(checkedKeys));
      await fetchMessages(activeConv.id, true);
    } catch (error) {
      window.alert(error.message || "The quote could not be accepted. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const requestVideoCall = async () => {
    if (!activeConv || !user || sending) return;
    const openMeeting = videoCalls.find((call) => ["REQUESTED", "SCHEDULED", "LIVE"].includes(call.status));
    if (openMeeting) return;
    setSending(true);
    try {
      const result = await videoCallAction("request", { conversationId: activeConv.id });
      if (result.call) setVideoCalls((current) => [result.call, ...current.filter((call) => call.id !== result.call.id)]);
    } catch (error) {
      window.alert(error.message || "Could not request a video call.");
    }
    setSending(false);
  };

  const bookingDraftMeeting = videoCalls.find((call) => call.status === "REQUESTED" && !call.requested_slot_at && !call.rescheduled_from_at && Number(call.reschedule_count || 0) === 0);
  const blockingMeeting = videoCalls.find((call) => {
    if (!["REQUESTED", "SCHEDULED", "LIVE"].includes(call.status) || call.id === bookingDraftMeeting?.id) return false;
    return !(["SCHEDULED", "LIVE"].includes(call.status) && getVideoCallWindow(call).expired);
  });
  const pendingMeetingRequest = blockingMeeting?.status === "REQUESTED" ? blockingMeeting : null;
  const rescheduleRequestedMeeting = videoCalls.find((call) => call.status === "REQUESTED" && Number(call.reschedule_count || 0) > 0 && !call.requested_slot_at);
  const pendingOwnerConfirmation = videoCalls.find((call) => call.status === "REQUESTED" && call.requested_slot_at && (call.confirmation_required_by === "BUSINESS_OWNER" || (!call.confirmation_required_by && Number(call.reschedule_count || 0) > 0)));
  const pendingCustomerConfirmation = videoCalls.find((call) => call.status === "REQUESTED" && call.requested_slot_at && call.confirmation_required_by === "CUSTOMER");
  const activeMeeting = ["SCHEDULED", "LIVE"].includes(blockingMeeting?.status) ? blockingMeeting : null;
  const meetingButtonLabel = pendingMeetingRequest ? "Request pending" : activeMeeting ? "View schedule" : "Schedule meeting";
  const meetingButtonHelp = pendingMeetingRequest
    ? "This meeting request is awaiting confirmation."
    : activeMeeting
      ? "A meeting is already scheduled. View it from the chat header."
      : "Choose an available day and time.";

  useEffect(() => {
    if (!openScheduleFromLink || scheduleLinkHandledRef.current || !activeConv) return;
    scheduleLinkHandledRef.current = true;
    setShowMeetingBooking(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("schedule");
    router.replace(`/messages?${params.toString()}`, { scroll: false });
  }, [activeConv, openScheduleFromLink, router, searchParams]);

  const joinVideoCall = async (callId) => {
    try {
      const result = await videoCallAction("join", { callId });
      if (!result.call?.room_name) throw new Error("The secure call room is unavailable.");
      setVideoCallSession({ callId: result.call.id, roomName: result.call.room_name });
    } catch (error) {
      window.alert(error.message || "This call cannot be joined yet.");
    }
  };

  const cancelVideoCall = async (callId, { skipConfirm = false } = {}) => {
    if (!skipConfirm && !window.confirm("Cancel this video call? The shop will be notified in chat.")) return null;
    try {
      const result = await videoCallAction("cancel", { callId, reason: "Cancelled by customer" });
      if (result.call) {
        setVideoCalls((current) => current.map((call) => call.id === result.call.id ? result.call : call));
        return result.call;
      }
    } catch (error) {
      window.alert(error.message || "Could not cancel the video call.");
    }
    return null;
  };

  const confirmProposedMeetingTime = async (callId) => {
    if (sending) return;
    setSending(true);
    try {
      const result = await videoCallAction("confirm", { callId });
      if (result.call) setVideoCalls((current) => current.map((call) => call.id === result.call.id ? result.call : call));
    } catch (error) {
      window.alert(error.message || "Could not confirm the proposed meeting time.");
    } finally {
      setSending(false);
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
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className={`h-1.5 w-1.5 rounded-full ${realtimeStatus === "LIVE" ? "bg-emerald-500" : "bg-amber-400"}`} />
                      {realtimeStatus === "LIVE" ? "Live chat & proofing thread" : "Syncing chat updates…"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => activeMeeting ? setShowMeetingView(true) : setShowMeetingBooking(true)} disabled={sending || Boolean(pendingMeetingRequest)} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#00aeb5] bg-[#e8ffff] px-3 py-2 text-[10px] font-black uppercase text-slate-900 transition-colors hover:bg-[#c8f5f5] disabled:cursor-not-allowed disabled:opacity-50" title={meetingButtonHelp} aria-label={meetingButtonLabel}>
                    <Video size={16} className="text-[#00aeb5]" />
                    <span>{activeMeeting ? "View schedule" : meetingButtonLabel}</span>
                  </button>
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
                 {pendingMeetingRequest && (
                   <div role="status" className="sticky top-0 z-20 flex items-start gap-3 rounded-xl border-2 border-[#EC008C] bg-[#FFF0F8] px-4 py-3 text-slate-900 shadow-sm">
                     <Video size={18} className="mt-0.5 shrink-0 text-[#EC008C]" />
                     <div className="min-w-0 flex-1">
                       <p className="text-xs font-black uppercase tracking-wide">{rescheduleRequestedMeeting ? "Choose a new meeting time" : pendingCustomerConfirmation ? "Owner proposed a new meeting time" : pendingOwnerConfirmation ? "Reschedule awaiting owner confirmation" : "Online meeting requested"}</p>
                       <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{rescheduleRequestedMeeting ? "The previous meeting window ended. Choose another available time, then the shop can confirm it." : pendingCustomerConfirmation ? `The owner proposed ${formatMeetingDateTime(pendingCustomerConfirmation.requested_slot_at, pendingCustomerConfirmation.booking_timezone || "Asia/Manila")}. Accept it or choose another time.` : pendingOwnerConfirmation ? `Your requested time is ${formatMeetingDateTime(pendingOwnerConfirmation.requested_slot_at, pendingOwnerConfirmation.booking_timezone || "Asia/Manila")}. The reschedule email will be sent after the owner confirms it.` : "Your request is in the shop inbox. The owner will schedule or decline it here."}</p>
                     </div>
                     {rescheduleRequestedMeeting && <button type="button" onClick={() => setShowMeetingBooking(true)} className="shrink-0 rounded-lg bg-[#EC008C] px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-[#c90078]">Choose time</button>}
                     {pendingCustomerConfirmation && <div className="flex shrink-0 flex-col gap-2"><button type="button" onClick={() => confirmProposedMeetingTime(pendingCustomerConfirmation.id)} disabled={sending} className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-[#EC008C] disabled:opacity-40">Accept time</button><button type="button" onClick={() => setShowMeetingBooking(true)} disabled={sending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:border-[#EC008C] disabled:opacity-40">Choose another</button></div>}
                   </div>
                 )}
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
                    {messages.filter((m) => !String(m.content || "").startsWith("[VIDEO_CALL_")).map((m) => {
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
                          {m.image_url && !["design_version", "design_upload"].includes(m.message_type) && (
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
                              const isScheduled = call ? ["SCHEDULED", "LIVE"].includes(call.status) : ["scheduled", "rescheduled"].includes(meta.event);
                              const isRescheduleRequested = Boolean(call && call.status === "REQUESTED" && Number(call.reschedule_count || 0) > 0 && !call.requested_slot_at);
                              const isPendingOwnerConfirmation = Boolean(call && call.status === "REQUESTED" && call.requested_slot_at && (call.confirmation_required_by === "BUSINESS_OWNER" || (!call.confirmation_required_by && Number(call.reschedule_count || 0) > 0)));
                              const isPendingCustomerConfirmation = Boolean(call && call.status === "REQUESTED" && call.requested_slot_at && call.confirmation_required_by === "CUSTOMER");
                              const isSchedulingInvite = Boolean(call && call.status === "REQUESTED" && !call.requested_slot_at && meta.event === "scheduling_invite");
                              return (
                                <div className="w-full min-w-60 rounded-xl border border-slate-200 bg-white p-4 text-center text-slate-900 shadow-sm">
                                  <Video size={26} className={`mx-auto mb-2 ${isScheduled ? "text-[#00aeb5]" : "text-[#EC008C]"}`} />
                                   <p className="font-bold">{isScheduled ? "Video call scheduled" : isSchedulingInvite ? "Choose a meeting time" : isPendingCustomerConfirmation ? "Awaiting your confirmation" : isPendingOwnerConfirmation ? "Reschedule awaiting owner confirmation" : isRescheduleRequested || meta.event === "reschedule_requested" ? "Choose a new meeting time" : meta.event === "cancelled" ? "Video call cancelled" : "Video call requested"}</p>
                                   {isSchedulingInvite && <p className="mt-1 text-[11px] opacity-80">The shop invited you to choose any open time from its calendar.</p>}
                                   {isRescheduleRequested && <p className="mt-1 text-[11px] opacity-80">The shop asked you to choose another available time.</p>}
                                   {isPendingOwnerConfirmation && <p className="mt-1 text-[11px] opacity-80">Requested for {formatMeetingDateTime(call.requested_slot_at, call.booking_timezone || "Asia/Manila")}. Waiting for the owner to confirm.</p>}
                                    {isPendingCustomerConfirmation && <p className="mt-1 text-[11px] opacity-80">The shop confirmed this time and is waiting for you to accept it: {formatMeetingDateTime(call.requested_slot_at, call.booking_timezone || "Asia/Manila")}.</p>}
                                  {isScheduled && call?.scheduled_at && <p className="mt-1 text-[11px] opacity-80">{new Date(call.scheduled_at).toLocaleString()}</p>}
                                  {isScheduled && <p className="mt-1 text-[11px] opacity-60">Join from 15 minutes before the scheduled time. The secure room closes 30 minutes after.</p>}
                                   {isScheduled && call && (
                                    <div className="mt-3 flex w-full flex-col gap-2">
                                      <button type="button" onClick={() => joinVideoCall(call.id)} disabled={!callWindow.joinable} className="rounded-lg bg-slate-900 px-4 py-2.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:border disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100">
                                        {callWindow.expired ? "Call ended" : callWindow.joinable ? "Join secure call" : "Available 15 minutes before"}
                                      </button>
                                      {call.status === "SCHEDULED" && !callWindow.expired && <button type="button" onClick={() => cancelVideoCall(call.id)} className="rounded-lg border border-rose-200 px-4 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50">Cancel call</button>}
                                      {call.status === "SCHEDULED" && !callWindow.expired && <button type="button" onClick={() => setShowMeetingBooking(true)} className="rounded-lg border border-slate-200 px-4 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50">Reschedule</button>}
                                     </div>
                                   )}
                                   {!isScheduled && isRescheduleRequested && !isMe && (
                                     <button type="button" onClick={() => setShowMeetingBooking(true)} className="mt-3 w-full rounded-lg bg-[#EC008C] px-4 py-2 text-[11px] font-bold text-white hover:bg-[#c90078]">Choose a new time</button>
                                   )}
                                   {!isScheduled && isSchedulingInvite && !isMe && <button type="button" onClick={() => setShowMeetingBooking(true)} className="mt-3 w-full rounded-lg bg-[#EC008C] px-4 py-2 text-[11px] font-bold text-white hover:bg-[#c90078]">Choose time</button>}
                                   {!isScheduled && isPendingCustomerConfirmation && <div className="mt-3 flex w-full flex-col gap-2"><button type="button" onClick={() => confirmProposedMeetingTime(call.id)} disabled={sending} className="rounded-lg bg-slate-900 px-4 py-2 text-[11px] font-bold text-white hover:bg-[#EC008C] disabled:opacity-40">Accept proposed time</button><button type="button" onClick={() => setShowMeetingBooking(true)} disabled={sending} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[11px] font-bold text-slate-700 hover:border-[#EC008C] disabled:opacity-40">Choose another time</button></div>}
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
                                <span className="text-slate-500">Proof version</span><span className="text-right font-semibold">{meta.proof_version || "Choose below"}</span>
                              </div>
                              {meta.terms && <p className="mt-3 text-[11px] text-slate-600">{meta.terms}</p>}
                              {m.content && <p className="mt-3 whitespace-pre-wrap">{m.content}</p>}
                              {(() => {
                                const designVersions = getDesignProofMessages(getProofsForInquiry(scopeMessages, meta.inquiry_message_id || getInquiryForMessage(scopeMessages, m)?.id));
                                const quoteAcceptance = messages.find((candidate) => (
                                  candidate.message_type === "quote_acceptance"
                                  && String(candidate.metadata?.quote_id) === String(m.id)
                                ));
                                const selectedProofId = quoteDesignSelections[m.id] || "";
                                const selectedDesign = designVersions.find((candidate) => String(candidate.metadata.proof_id) === selectedProofId) || null;

                                if (meta.ordered) {
                                  return <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-[11px] font-bold text-emerald-800"><CheckCircle2 size={14} /> Order placed from this quote</div>;
                                }
                                if (meta.valid_until && new Date(meta.valid_until) < new Date()) {
                                  return <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-[11px] font-bold text-rose-700">This quotation has expired. Ask the shop for a new one.</p>;
                                }
                                if (!meta.service_id || Number(meta.total_cost || meta.quote_amount || 0) <= 0) {
                                  return <p className="mt-3 rounded-lg bg-white px-3 py-2 text-[11px] text-slate-600">This quote is missing its service reference. Ask the shop to resend it from your service request.</p>;
                                }
                                return (
                                  <>
                                    {designVersions.length > 0 && !quoteAcceptance && (
                                      <div className="mt-3 rounded-lg border border-cyan-200 bg-white p-3 text-[11px]">
                                        <div className="flex items-start justify-between gap-2">
                                          <div>
                                            <p className="font-bold text-slate-800">Choose a design version</p>
                                            <p className="mt-1 text-slate-500">Preview every version, then select the one you want included in this order.</p>
                                          </div>
                                          <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-bold text-cyan-700">{designVersions.length} available</span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                          {designVersions.map((design) => {
                                            const proofId = String(design.metadata.proof_id);
                                            const isSelected = selectedProofId === proofId;
                                            const fileName = design.metadata.file_name || "Design proof";
                                            const isImage = Boolean(design.image_url && (design.metadata.file_mime?.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(fileName)));
                                            return (
                                              <button
                                                key={proofId}
                                                type="button"
                                                onClick={() => setQuoteDesignSelections((current) => ({ ...current, [m.id]: proofId }))}
                                                aria-pressed={isSelected}
                                                className={`overflow-hidden rounded-lg border text-left transition ${isSelected ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-200" : "border-slate-200 bg-slate-50 hover:border-cyan-300"}`}
                                              >
                                                <div className="relative flex h-28 items-center justify-center overflow-hidden bg-slate-100">
                                                  {isImage ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={design.image_url} alt={`Design version ${design.metadata.version}`} className="h-full w-full object-contain" loading="lazy" />
                                                  ) : (
                                                    <div className="flex flex-col items-center gap-1 text-slate-500"><FileText size={28} /><span className="text-[10px] font-semibold">Preview unavailable</span></div>
                                                  )}
                                                  <span className="absolute left-2 top-2 rounded-full bg-slate-900/85 px-2 py-1 text-[10px] font-bold text-white">Version {design.metadata.version}</span>
                                                  {isSelected && <span className="absolute right-2 top-2 rounded-full bg-cyan-500 px-2 py-1 text-[10px] font-bold text-white">Selected</span>}
                                                </div>
                                                <div className="p-2">
                                                  <p className="truncate font-bold text-slate-800">{fileName}</p>
                                                  <p className="mt-1 text-[10px] font-semibold uppercase text-slate-500">{design.metadata.proof_status === "APPROVED" && design.metadata.reviewed_by === user.id ? "Customer approved" : design.metadata.owner_ready ? "Ready to choose" : design.metadata.proof_status || "PENDING"}</p>
                                                </div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                        {!selectedDesign && <p className="mt-2 font-semibold text-amber-700">Select a design version before accepting this quote.</p>}
                                      </div>
                                    )}
                                    {quoteAcceptance ? (
                                      <div className="mt-3 rounded-lg bg-emerald-100 p-3 text-[11px] font-bold text-emerald-800">
                                        <div className="flex items-center gap-2"><CheckCircle2 size={14} /> Quote accepted and added to your cart.</div>
                                        {quoteAcceptance.metadata?.design_version && <p className="mt-1 font-normal">Design version {quoteAcceptance.metadata.design_version} selected.</p>}
                                        <button
                                          type="button"
                                          onClick={() => router.push(`/business/${activeConv.business_id}`)}
                                          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-bold text-white hover:bg-[#EC008C]"
                                        >
                                          View in cart <ArrowRight size={13} />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => acceptQuote(m, selectedDesign)}
                                        disabled={sending || (designVersions.length > 0 && !selectedDesign)}
                                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-[#EC008C] disabled:cursor-wait disabled:opacity-50"
                                      >
                                        {sending ? "Adding to cart…" : "Accept quote & add to cart"} <CheckCircle2 size={14} />
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          ) : m.message_type === "service_inquiry" ? (
                            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-slate-900">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Quote request</p>
                              <p className="mt-1 text-sm font-extrabold">{meta.service_name || "Custom printing service"}</p>
                              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                                <dt className="text-slate-500">Quantity</dt><dd className="text-right font-semibold">{meta.quantity || 1}</dd>
                                {meta.selected_specs?.size && <><dt className="text-slate-500">Size</dt><dd className="text-right font-semibold">{meta.selected_specs.size}</dd></>}
                                {meta.selected_specs?.size_breakdown?.length > 0 && <><dt className="text-slate-500">Sizes</dt><dd className="text-right font-semibold">{meta.selected_specs.size_breakdown.map((row) => `${row.size} × ${row.quantity}`).join(", ")}</dd></>}
                                {meta.selected_specs?.material && <><dt className="text-slate-500">Material</dt><dd className="text-right font-semibold">{meta.selected_specs.material}</dd></>}
                                {meta.selected_specs?.quality && <><dt className="text-slate-500">Quality</dt><dd className="text-right font-semibold">{meta.selected_specs.quality}</dd></>}
                                <dt className="text-slate-500">Files</dt><dd className="text-right font-semibold">{meta.attachment_count || 0}</dd>
                              </dl>
                              {formatCatalogPriceRange(
                                meta.catalog_price_min_total ?? meta.catalog_estimate_total,
                                meta.catalog_price_max_total ?? meta.catalog_estimate_total
                              ) && (
                                <div className="mt-3 rounded-lg border border-cyan-200 bg-white p-2 text-[10px]">
                                  <div className="flex items-center justify-between gap-3 font-bold text-cyan-700">
                                    <span>Catalog estimate</span>
                                    <span>{formatCatalogPriceRange(meta.catalog_price_min_total ?? meta.catalog_estimate_total, meta.catalog_price_max_total ?? meta.catalog_estimate_total)} total</span>
                                  </div>
                                  <p className="mt-1 text-slate-500">Reference range only. The shop will verify your requirements and send the final quote.</p>
                                </div>
                              )}
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
                                  <span className="rounded bg-[#FFF200] px-2 py-1 text-[9px] font-black uppercase text-slate-900">{meta.proof_status === "APPROVED" && meta.reviewed_by === user.id ? "CUSTOMER APPROVED" : meta.owner_ready ? "READY TO CHOOSE" : meta.proof_status || "PENDING"}</span>
                                </div>
                                <div className="p-4">
                                  {m.image_url && (
                                    <a href={m.image_url} target="_blank" rel="noopener noreferrer" className="mb-4 block overflow-hidden rounded-xl border-2 border-cyan-200 bg-slate-50">
                                      {isPreviewable ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={m.image_url}
                                          alt={`Design proof version ${meta.version || "1"}`}
                                          className="max-h-72 w-full object-contain"
                                        />
                                      ) : (
                                        <div className="flex items-center gap-3 p-4 text-xs font-bold text-slate-800">
                                          <FileText size={24} className="shrink-0 text-[#EC008C]" />
                                          <span className="break-all">Open {meta.file_name || "design proof"}</span>
                                        </div>
                                      )}
                                    </a>
                                  )}
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
                                    <button type="button" onClick={() => updateProofStatus(m, "APPROVED")} disabled={sending || (meta.proof_status === "APPROVED" && meta.reviewed_by === user.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">Approve</button>
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
                          max={MAX_DESIGN_VERSIONS}
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
      {showMeetingBooking && activeConv && (
        <MeetingBookingModal
          businessId={activeConv.business_id}
          conversationId={activeConv.id}
          existingCall={blockingMeeting || null}
          onClose={() => setShowMeetingBooking(false)}
          onBooked={(call) => {
            if (call) setVideoCalls((current) => [call, ...current.filter((item) => item.id !== call.id)]);
            setShowMeetingBooking(false);
          }}
        />
      )}
      {showMeetingView && activeConv && activeMeeting && (
        <MeetingBookingModal
          businessId={activeConv.business_id}
          conversationId={activeConv.id}
          existingCall={activeMeeting}
          readOnly
          onClose={() => setShowMeetingView(false)}
          onCancelMeeting={() => cancelVideoCall(activeMeeting.id, { skipConfirm: true })}
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
