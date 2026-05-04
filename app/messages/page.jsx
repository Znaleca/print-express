"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Send, Loader2, User, Store,
  ChevronRight, Hash, ImagePlus, Pencil, Trash2, Check, X, MoreVertical, Video, Calendar, MapPin
} from "lucide-react";

function MessagesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initBizId = searchParams.get("business"); // auto-open if ?business=...
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
  const [sendingImage, setSendingImage] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [unreadByConv, setUnreadByConv] = useState({});
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [quoteCheckoutPending, setQuoteCheckoutPending] = useState(null);
  const [jitsiRoom, setJitsiRoom] = useState(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [viewImagePopup, setViewImagePopup] = useState(null); // { url, label }
  const bottomRef = useRef(null);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingDesignUpload = useRef(false);
  const jitsiApiRef = useRef(null);
  const jitsiScriptRef = useRef(null);

  /* ── 0. Jitsi External API (no-logo) ── */
  useEffect(() => {
    if (!jitsiRoom) {
      // Dispose existing API instance if room closed
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
      if (!user) { router.push("/login"); return; }
      setUser(user);
    });
  }, [router]);

  /* ── 2. Load conversations ── */
  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user]);

  const loadConversations = async (isBg = false) => {
    if (!isBg) setLoadingConvs(true);
    let data, error;

    ({ data, error } = await supabase
      .from("chat_conversations")
      .select("*, businesses(id, name, address)")
      .eq("customer_id", user.id)
      .order("updated_at", { ascending: false }));

    if (!error && data) {
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

      // Auto-open conversation if ?business= param present
      if (initBizId) {
        const existing = data.find((c) => c.business_id === initBizId);
        if (existing) {
          openConversation(existing);
        } else {
          // Create new conversation
          await startNewConversation(initBizId);
        }
      }
    }
    if (!isBg) setLoadingConvs(false);
  };

  /* ── 3. Start a new conversation with a business ── */
  const startNewConversation = async (businessId) => {
    const { data, error } = await supabase
      .from("chat_conversations")
      .upsert(
        { business_id: businessId, customer_id: user.id },
        { onConflict: "business_id,customer_id" }
      )
      .select("*, businesses(id, name, address)")
      .single();

    if (!error && data) {
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === data.id);
        return exists ? prev : [data, ...prev];
      });
      openConversation(data);
    }
  };

  /* ── 4. Open a conversation ── */
  const openConversation = (conv) => {
    setActiveConv(conv);
    setMessages([]);
    setMsgLimit(20);
    setHasMoreMsgs(false);
    setUnreadByConv((prev) => ({ ...prev, [conv.id]: 0 }));
  };

  /* ── 5. Load messages + subscribe realtime + poll fallback ── */
  useEffect(() => {
    if (!activeConv) return;

    // Unsubscribe previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    fetchMessages(activeConv.id, false, msgLimit);

    // Subscribe to ALL new chat_messages (no filter — filter client-side)
    const channel = supabase
      .channel(`chat_all:${activeConv.id}`)
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
      
      // Scroll to bottom if it's the initial load or a background (new message) load
      if (limit === 20 || isBg) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: isBg ? "smooth" : "auto" }), 50);
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

  // Handle greet=1
  useEffect(() => {
    if (activeConv && initBizId && activeConv.business_id === initBizId) {
      if (searchParams.get("greet") === "1") {
        setShowQuickReplies(true);
        // Clear param without reloading
        const params = new URLSearchParams(searchParams.toString());
        params.delete("greet");
        router.replace(`/messages?${params.toString()}`);
      }
    }
  }, [activeConv, initBizId, searchParams, router]);

  // Auto-send service inquiry
  useEffect(() => {
    if (!activeConv || !initServiceId || !user) return;
    
    const sendInquiry = async () => {
      const actionParam = searchParams.get("action");
      
      // Remove query params to prevent loop
      const params = new URLSearchParams(searchParams.toString());
      params.delete("service");
      params.delete("action");
      router.replace(`/messages?${params.toString()}`);

      // Fetch service name to include in metadata
      const { data: serviceData } = await supabase.from('services').select('name').eq('id', initServiceId).single();
      const serviceName = serviceData?.name || "a custom service";

      let initialContent = "I would like to inquire about this service.";
      if (actionParam === "upload_design") {
        initialContent = "I want to inquire about your services with this design.";
      } else if (actionParam === "video_call") {
        initialContent = "I would like to request a video call to discuss this service.";
      }

      await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        sender_role: "CUSTOMER",
        content: initialContent,
        message_type: 'service_inquiry',
        metadata: { service_id: initServiceId, service_name: serviceName },
        is_read: false,
      });
      
      // Handle follow-up actions based on modal choice
      if (actionParam === "upload_design") {
        // Trigger file picker after a short delay so chat is visible first
        pendingDesignUpload.current = true;
        setTimeout(() => {
          fileInputRef.current?.click();
        }, 600);
      } else if (actionParam === "video_call") {
        // Send immediately in the same async chain — reliable, no setTimeout race condition
        await supabase.from("chat_messages").insert({
          conversation_id: activeConv.id,
          sender_id: user.id,
          sender_role: "CUSTOMER",
          content: "[VIDEO_CALL_REQUEST]",
          is_read: false,
        });
      } else if (actionParam === "chat") {
        setShowQuickReplies(true);
      }
    };

    sendInquiry();
  }, [activeConv, initServiceId, user, router, searchParams]);

  const sendQuickReply = async (action) => {
    if (!activeConv || !user) return;
    setSending(true);
    setShowQuickReplies(false);

    let customerText = "";
    if (action === "hi") customerText = "Hi";
    else if (action === "offer") customerText = "What do you offer?";
    else if (action === "location") customerText = "Where are you located?";

    // 1. Send customer message
    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content: customerText,
      is_read: false,
    });

    // 2. Bot reply logic
    let botReplyText = "";
    let messageType = 'text';
    let meta = {};

    const { data: biz } = await supabase.from('businesses').select('owner_id, name, address, lat, lng').eq('id', activeConv.business_id).single();

    if (action === "hi") {
      botReplyText = `Welcome to ${biz?.name || 'our shop'} and we are pleased to serve you!`;
    } else if (action === "offer") {
      const { data: items } = await supabase.from('services').select('name, price, price_max, item_type').eq('business_id', activeConv.business_id).eq('available', true);
      let listText = "";
      
      if (items && items.length > 0) {
        const products = items.filter(i => i.item_type === 'product');
        const services = items.filter(i => i.item_type !== 'product');
        
        if (products.length > 0) {
          listText += "📦 PRODUCTS\n";
          listText += products.map(p => `• ${p.name} - ₱${Number(p.price).toFixed(2)}`).join('\n') + "\n\n";
        }
        if (services.length > 0) {
          listText += "🛠️ SERVICES\n";
          listText += services.map(s => {
            const p1 = Number(s.price).toFixed(2);
            if (s.price_max && Number(s.price_max) > Number(s.price)) {
              return `• ${s.name} - ₱${p1} to ₱${Number(s.price_max).toFixed(2)}`;
            }
            return `• ${s.name} - ₱${p1}`;
          }).join('\n');
        }
      } else {
        listText = "We currently have no available services or products.";
      }
      botReplyText = `Here is a preview of our offerings:\n\n${listText.trim()}`;
    } else if (action === "location") {
      botReplyText = `We are located at:\n${biz?.address || 'our address'}`;
      if (biz?.lat && biz?.lng) {
        messageType = 'location_pin';
        meta = { lat: biz.lat, lng: biz.lng, address: biz.address };
      }
    }

    if (biz?.owner_id && botReplyText) {
      await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: biz.owner_id,
        sender_role: "BUSINESS_OWNER",
        content: botReplyText,
        message_type: messageType,
        metadata: meta,
        is_read: false,
      });
    }

    setSending(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activeConv) return;
    setSending(true);

    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content: input.trim(),
      is_read: false,
    });

    setInput("");
    setSending(false);
  };

  const sendImageMessage = async (file) => {
    if (!file || !activeConv || !user) return;
    setSendingImage(true);

    const isDesignUpload = pendingDesignUpload.current;
    pendingDesignUpload.current = false;

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const filePath = `${activeConv.id}/${user.id}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("chat-images")
      .upload(filePath, file, { upsert: false });

    if (!uploadErr) {
      const { data } = supabase.storage.from("chat-images").getPublicUrl(filePath);
      if (isDesignUpload) {
        // Scope the version number to the current service inquiry session
        const { data: inquiries } = await supabase
          .from("chat_messages")
          .select("created_at")
          .eq("conversation_id", activeConv.id)
          .eq("message_type", "service_inquiry")
          .order("created_at", { ascending: false })
          .limit(1);
        
        const sessionStart = inquiries?.[0]?.created_at || '1970-01-01T00:00:00Z';

        // Count existing design versions for this session to get next version number
        const { data: existingDesigns } = await supabase
          .from("chat_messages")
          .select("id")
          .eq("conversation_id", activeConv.id)
          .eq("message_type", "design_version")
          .gte("created_at", sessionStart);
          
        const nextVersion = ((existingDesigns?.length) || 0) + 1;
        await supabase.from("chat_messages").insert({
          conversation_id: activeConv.id,
          sender_id: user.id,
          sender_role: "CUSTOMER",
          content: "I want to inquire about your services with this design.",
          message_type: "design_version",
          image_url: data?.publicUrl || null,
          metadata: { version: String(nextVersion) },
          is_read: false,
        });
      } else {
        await supabase.from("chat_messages").insert({
          conversation_id: activeConv.id,
          sender_id: user.id,
          sender_role: "CUSTOMER",
          content: "[image]",
          image_url: data?.publicUrl || null,
          is_read: false,
        });
      }
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

  const sendVideoCallRequest = async () => {
    if (!activeConv || !user) return;
    setSending(true);
    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "CUSTOMER",
      content: "[VIDEO_CALL_REQUEST]",
      is_read: false,
    });
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

  const convLabel = (conv) => conv.businesses?.name || "Unknown Shop";

  /* ── UI ── */
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-[#1A1A1A] text-[#00FFFF] font-mono">
        <Loader2 className="animate-spin mb-4" size={48} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-80px)] overflow-hidden bg-[#FDFDFD] font-sans flex flex-col">
      {/* PAGE HEADER */}
      <div className="border-b-8 border-[#1A1A1A] px-8 py-6 bg-white shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-1">
              <div className="w-4 h-1 bg-[#00FFFF]" /><div className="w-4 h-1 bg-[#EC008C]" /><div className="w-4 h-1 bg-[#FFF200]" />
            </div>
            <span className="font-mono text-[9px] uppercase tracking-[0.5em] text-gray-400">Comms_Terminal // v1.0</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter leading-none">
            Live_Chat
          </h1>
        </div>
      </div>

      <div className="flex flex-1 max-w-7xl w-full mx-auto overflow-hidden">

        {/* ── LEFT: CONVERSATION LIST ── */}
        <aside className="w-full md:w-80 lg:w-96 border-r-4 border-[#1A1A1A] flex flex-col shrink-0 bg-white">
          <div className="px-6 py-4 border-b-4 border-[#1A1A1A] bg-[#F9F9F7]">
            <p className="font-mono text-[9px] uppercase tracking-widest font-black opacity-50">
              {conversations.length} Active Thread{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>
          {/* QUOTE CHECKOUT VERSION SELECTOR */}
          {quoteCheckoutPending && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <div className="w-full max-w-lg bg-white border-4 border-[#1A1A1A] p-6 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black uppercase italic tracking-widest text-[#1A1A1A]">Select Approved Design</h3>
                  <button
                    type="button"
                    onClick={() => setQuoteCheckoutPending(null)}
                    className="p-1 hover:bg-[#EC008C] hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <p className="text-sm font-bold mb-6 text-gray-600">
                  Please select the design version you want to proceed with for this order.
                </p>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  {(() => {
                    // Find the most recent service_inquiry before this quote to scope designs to this session
                    const inquiryMessages = messages.filter(m => m.message_type === 'service_inquiry' && m.created_at <= quoteCheckoutPending.created_at);
                    const lastInquiry = inquiryMessages.length > 0 ? inquiryMessages[inquiryMessages.length - 1] : null;
                    const sessionStart = lastInquiry?.created_at || '1970-01-01';

                    const allVersions = messages.filter(m =>
                      m.message_type === 'design_version' &&
                      m.created_at >= sessionStart &&
                      m.created_at <= quoteCheckoutPending.created_at
                    );
                    // Keep only the latest upload per version number
                    const latestByVersion = Object.values(
                      allVersions.reduce((acc, m) => {
                        const v = m.metadata?.version || '1';
                        if (!acc[v] || m.created_at > acc[v].created_at) acc[v] = m;
                        return acc;
                      }, {})
                    );
                    if (latestByVersion.length === 0) return (
                      <p className="col-span-2 text-center font-mono text-[10px] uppercase opacity-50 py-4">No design versions uploaded yet.</p>
                    );
                    return latestByVersion.map(versionMsg => (
                      <button
                        key={versionMsg.id}
                        onClick={() => {
                          const checkoutUrl = `/business/${activeConv.business_id}?checkout_service=${quoteCheckoutPending.metadata?.service_id || ''}&quote=${quoteCheckoutPending.metadata?.quote_amount}&design_url=${encodeURIComponent(versionMsg.image_url)}&design_version=${versionMsg.metadata?.version || '1'}&quote_id=${quoteCheckoutPending.id}`;
                          router.push(checkoutUrl);
                        }}
                        className="flex flex-col items-center border-2 border-[#1A1A1A] hover:bg-[#FFF200] transition-colors p-2 cursor-pointer group text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={versionMsg.image_url} alt="Design Version" className="w-full h-32 object-contain bg-[#1A1A1A]/5 mb-2" />
                        <span className="font-mono text-[10px] font-black uppercase tracking-widest bg-[#1A1A1A] text-white px-2 py-1 w-full text-center group-hover:bg-[#00FFFF] group-hover:text-[#1A1A1A] transition-colors">
                          Version {versionMsg.metadata?.version || "1"}
                        </span>
                      </button>
                    ));
                  })()}
                </div>
                
                <button
                  onClick={() => {
                      const checkoutUrl = `/business/${activeConv.business_id}?checkout_service=${quoteCheckoutPending.metadata?.service_id || ''}&quote=${quoteCheckoutPending.metadata?.quote_amount}&quote_id=${quoteCheckoutPending.id}`;
                      router.push(checkoutUrl);
                  }}
                  className="w-full border-2 border-[#1A1A1A] py-3 font-black uppercase text-xs hover:bg-[#1A1A1A] hover:text-white transition-colors"
                >
                  Skip / No Design
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-[#00FFFF]" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <MessageSquare size={48} className="mb-4 text-gray-200" />
                <p className="font-black uppercase italic text-lg text-gray-300">No_Threads</p>
                <p className="font-mono text-[10px] uppercase opacity-40 mt-2 leading-relaxed">
                  Visit a business page and press Message to start.
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
                      <Store size={16} className={isActive ? "text-[#1A1A1A]" : "text-[#EC008C]"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-black uppercase italic text-sm leading-none truncate ${isActive ? "text-white" : "text-[#1A1A1A]"}`}>
                        {convLabel(conv)}
                      </p>
                      {conv.businesses?.address && (
                        <p className={`font-mono text-[9px] uppercase mt-1.5 font-bold truncate ${isActive ? "text-white/50" : "opacity-40"}`}>
                          {conv.businesses.address}
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
        <div className="flex-1 flex flex-col min-w-0">
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
              <div className="px-8 py-5 bg-white border-b-4 border-[#1A1A1A] flex items-center gap-4 shrink-0 shadow-[0_4px_0_0_rgba(26,26,26,1)]">
                <div className="w-10 h-10 bg-[#1A1A1A] flex items-center justify-center border-2 border-[#1A1A1A]">
                  <Store size={16} className="text-[#EC008C]" />
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
              <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-gray-50/50">
                    
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
                    return (
                      <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} relative`}>
                        {!isMine && (
                          <div className="w-8 h-8 bg-[#1A1A1A] flex items-center justify-center shrink-0 mr-3 mt-auto">
                            <Store size={13} className="text-[#00FFFF]" />
                          </div>
                        )}

                        {/* moved More (three-dot) button outside the bubble on the left */}
                        {isMine && (
                          <div className="relative flex flex-col items-center mr-3">
                            <button
                              type="button"
                              onClick={() => setMenuMessageId((prev) => (prev === msg.id ? null : msg.id))}
                              className="w-8 h-8 bg-[#00FFFF] flex items-center justify-center border-2 border-[#1A1A1A] text-[#1A1A1A]"
                              aria-label="More actions"
                            >
                              <MoreVertical size={14} />
                            </button>

                            {menuMessageId === msg.id && (
                              <div className="absolute left-0 bottom-full mb-2 z-30 w-40 rounded-lg bg-[#2a2a2a] text-white shadow-lg">
                                <div className="absolute -bottom-2 left-5 w-3 h-3 bg-[#2a2a2a] rotate-45 shadow-sm" />
                                <div className="flex flex-col py-1">
                                  <button
                                    type="button"
                                    onClick={() => startEditMessage(msg)}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left font-mono text-sm font-black uppercase hover:bg-white/10"
                                  >
                                    <Pencil size={14} className="text-white" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteMessage(msg)}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left font-mono text-sm font-black uppercase hover:bg-white/10"
                                  >
                                    <Trash2 size={14} className="text-white" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className={`relative max-w-[65%] px-5 py-4 border-2 ${
                          isMine
                            ? "bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]"
                            : "bg-white text-[#1A1A1A] border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(236,0,140,0.3)]"
                        }`}>
                          {msg.image_url && (
                            <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={msg.image_url}
                                alt="Chat upload"
                                className="mb-3 max-h-64 w-auto rounded border-2 border-black/20"
                              />
                            </a>
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
                              <p className="font-mono text-[9px] uppercase mt-1 opacity-70">Awaiting owner's invite</p>
                            </div>
                          ) : msg.content.startsWith("[VIDEO_CALL_INVITE:") ? (
                            (() => {
                              const timeStr = msg.content.replace("[VIDEO_CALL_INVITE:", "").replace("]", "");
                              const schedTime = new Date(timeStr);
                              // We can update the state to re-render, but usually polling/realtime makes changing components remount enough.
                              // Check if time is past, or at least if it's within 15 minutes before the time
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
                              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#FFF200] mb-2">Official Quote</p>
                              <p className="text-3xl font-black italic text-[#00FFFF] mb-4">₱{Number(msg.metadata?.quote_amount).toFixed(2)}</p>
                              {msg.content && <p className="text-sm font-bold leading-relaxed mb-4">{msg.content}</p>}
                              {msg.metadata?.is_checkout_completed ? (
                                <button
                                  type="button"
                                  disabled
                                  className="w-full bg-[#1A1A1A] text-white/50 font-black uppercase italic text-sm py-3 border-2 border-[#1A1A1A] cursor-not-allowed"
                                >
                                  Order Placed
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Determine if there are previous designs
                                    const previousDesigns = messages.filter(m => m.message_type === 'design_version' && m.created_at <= msg.created_at);
                                    if (previousDesigns.length > 0) {
                                      setQuoteCheckoutPending(msg);
                                    } else {
                                      const checkoutUrl = `/business/${activeConv.business_id}?checkout_service=${msg.metadata?.service_id || ''}&quote=${msg.metadata?.quote_amount}&quote_id=${msg.id}`;
                                      router.push(checkoutUrl);
                                    }
                                  }}
                                  className="w-full bg-[#00FFFF] text-[#1A1A1A] font-black uppercase italic text-sm py-3 hover:bg-[#FFF200] transition-colors border-2 border-[#00FFFF]"
                                >
                                  Finalize & Checkout
                                </button>
                              )}
                            </div>
                          ) : msg.message_type === 'design_version' ? (
                            <div className="flex flex-col">
                              <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#FFF200] mb-2 px-2 py-1 bg-[#1A1A1A] self-start">
                                Version {msg.metadata?.version || "1"}
                              </span>
                              {msg.content && msg.content !== "[image]" && (
                                <p className="text-sm font-bold leading-relaxed mb-3">{msg.content}</p>
                              )}
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
                                <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#EC008C]">Refund Dispute Sent</p>
                              </div>
                              <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap mb-3">{msg.content}</p>
                              <div className="flex flex-col gap-1 border-t border-[#EC008C]/30 pt-2">
                                {msg.metadata?.receipt_url && (
                                  <button onClick={() => setViewImagePopup({ url: msg.metadata.receipt_url, label: 'Payment Receipt' })} className="font-mono text-[9px] uppercase font-black text-[#EC008C] flex items-center gap-1 hover:underline text-left">
                                    📄 View Payment Receipt
                                  </button>
                                )}
                                {msg.metadata?.refund_receipt_url && (
                                  <button onClick={() => setViewImagePopup({ url: msg.metadata.refund_receipt_url, label: "Seller's Refund Proof" })} className="font-mono text-[9px] uppercase font-black text-[#EC008C] flex items-center gap-1 hover:underline text-left">
                                    🧾 View Seller's Refund Proof
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : msg.message_type === 'location_pin' ? (
                            <div className="flex flex-col p-3 border-2 border-[#00FFFF] bg-[#00FFFF]/5 min-w-[220px]">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin size={14} className="text-[#00FFFF]" />
                                <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#00FFFF]">Shop Location</p>
                              </div>
                              <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap mb-3">{msg.content}</p>
                              {msg.metadata?.lat && msg.metadata?.lng && (
                                <a 
                                  href={`https://maps.google.com/?q=${msg.metadata.lat},${msg.metadata.lng}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="font-mono text-[9px] uppercase font-black text-[#1A1A1A] bg-[#00FFFF] px-3 py-2 text-center hover:bg-white transition-colors"
                                >
                                  Open in Google Maps
                                </a>
                              )}
                            </div>
                          ) : (
                            msg.content !== "[image]" && <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap word-break break-words">{msg.content}</p>
                          )}

                          

                          <p className={`font-mono text-[8px] uppercase mt-2 font-black tracking-wider ${isMine ? "opacity-40 text-right" : "opacity-40"}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {msg.edited_at ? " • edited" : ""}
                          </p>
                        </div>
                        {isMine && (
                          <div className="w-8 h-8 bg-[#00FFFF] flex items-center justify-center shrink-0 ml-3 mt-auto">
                            <User size={13} className="text-[#1A1A1A]" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick Replies */}
              {showQuickReplies && (
                <div className="flex flex-col gap-2 p-3 bg-[#F9F9F7] border-t-4 border-[#1A1A1A] shrink-0">
                  <p className="font-mono text-[9px] uppercase tracking-widest font-black opacity-50">Quick Replies — what do you want to ask?</p>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => sendQuickReply("hi")}
                    className="whitespace-nowrap px-4 py-2 border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] font-mono text-[10px] font-black uppercase hover:bg-[#00FFFF] transition-colors"
                  >
                    Hi
                  </button>
                  <button
                    onClick={() => sendQuickReply("offer")}
                    className="whitespace-nowrap px-4 py-2 border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] font-mono text-[10px] font-black uppercase hover:bg-[#FFF200] transition-colors"
                  >
                    What do you offer?
                  </button>
                  <button
                    onClick={() => sendQuickReply("location")}
                    className="whitespace-nowrap px-4 py-2 border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] font-mono text-[10px] font-black uppercase hover:bg-[#EC008C] hover:text-white transition-colors"
                  >
                    Where are you located?
                  </button>
                  <button
                    onClick={() => setShowQuickReplies(false)}
                    className="whitespace-nowrap px-2 py-2 ml-auto text-gray-500 hover:text-[#1A1A1A] transition-colors shrink-0"
                    title="Dismiss"
                  >
                    <X size={16} />
                  </button>
                </div>
                </div>
              )}

              {/* Input */}
              <form onSubmit={sendMessage} className="flex gap-3 p-5 border-t-4 border-[#1A1A1A] bg-white shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-5 py-4 border-2 border-[#1A1A1A] font-mono text-sm bg-[#F9F9F7] focus:outline-none focus:bg-white focus:ring-4 ring-[#00FFFF]/40 transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) sendImageMessage(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingImage}
                  className="w-14 h-14 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] flex items-center justify-center hover:bg-[#FFF200] transition-all disabled:opacity-40 shrink-0"
                  title="Attach Image"
                >
                  {sendingImage ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
                </button>
                <button
                  type="button"
                  onClick={sendVideoCallRequest}
                  disabled={sending}
                  className="w-14 h-14 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] flex items-center justify-center hover:bg-[#00FFFF] transition-all disabled:opacity-40 shrink-0"
                  title="Request Video Call"
                >
                  <Video size={20} />
                </button>
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
          <div id="jitsi-container-customer" className="flex-1 w-full" />
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-[#1A1A1A] text-[#00FFFF] font-mono">
        <Loader2 className="animate-spin" size={48} />
      </div>
    }>
      <MessagesInner />
    </Suspense>
  );
}
