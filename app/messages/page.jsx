"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Send, Loader2, User, Store,
  ChevronRight, Hash, ImagePlus, Pencil, Trash2, Check, X, MoreVertical, Video, Calendar
} from "lucide-react";

function MessagesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initBizId = searchParams.get("business"); // auto-open if ?business=...

  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [unreadByConv, setUnreadByConv] = useState({});
  const [menuMessageId, setMenuMessageId] = useState(null);
  const bottomRef = useRef(null);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);

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

    fetchMessages(activeConv.id);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async (convId, isBg = false) => {
    if (!isBg) setLoadingMsgs(true);
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
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
        sender_role: "CUSTOMER",
        content: "[image]",
        image_url: data?.publicUrl || null,
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
    <div className="min-h-[calc(100vh-80px)] bg-[#FDFDFD] font-sans flex flex-col">
      {/* PAGE HEADER */}
      <div className="border-b-8 border-[#1A1A1A] px-8 py-8 bg-white">
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

      <div className="flex flex-1 max-w-7xl w-full mx-auto overflow-hidden" style={{ height: "calc(100vh - 80px - 120px)" }}>

        {/* ── LEFT: CONVERSATION LIST ── */}
        <aside className="w-full md:w-80 lg:w-96 border-r-4 border-[#1A1A1A] flex flex-col shrink-0 bg-white">
          <div className="px-6 py-4 border-b-4 border-[#1A1A1A] bg-[#F9F9F7]">
            <p className="font-mono text-[9px] uppercase tracking-widest font-black opacity-50">
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
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F9F9F7]">
                {loadingMsgs ? (
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
                      <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        {!isMine && (
                          <div className="w-8 h-8 bg-[#1A1A1A] flex items-center justify-center shrink-0 mr-3 mt-auto">
                            <Store size={13} className="text-[#00FFFF]" />
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
                                    <a
                                      href={`https://meet.jit.si/print-app-call-${activeConv.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-3 px-4 py-2 w-full bg-[#EC008C] hover:bg-[#FFF200] hover:text-[#1A1A1A] text-white font-black uppercase text-xs border border-transparent hover:border-[#1A1A1A] transition-all"
                                    >
                                      Join Call
                                    </a>
                                  ) : (
                                    <button disabled className="mt-3 px-4 py-2 w-full bg-[#1A1A1A]/50 text-white/50 font-black uppercase text-xs border border-[#1A1A1A]/50 cursor-not-allowed">
                                      Not yet available
                                    </button>
                                  )}
                                </div>
                              );
                            })()
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
                            <User size={13} className="text-[#1A1A1A]" />
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
