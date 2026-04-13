"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare, Send, Loader2, User, Store,
  ChevronRight, Hash, AlertTriangle
} from "lucide-react";

export default function OwnerMessagesPage() {
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const channelRef = useRef(null);

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

  const loadConversations = async () => {
    setLoadingConvs(true);
    let data = [];

    // Business owner — fetch ALL their businesses
    const { data: bizList, error: bizErr } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("owner_id", user.id);

    if (bizErr) {
      console.error("[Messages] Failed to load businesses:", bizErr.message);
      setLoadingConvs(false);
      return;
    }
    if (!bizList || bizList.length === 0) {
      console.warn("[Messages] No businesses found for owner:", user.id);
      setLoadingConvs(false);
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
      setLoadingConvs(false);
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
    setLoadingConvs(false);
  };

  /* ── 3. Open a conversation ── */
  const openConversation = (conv) => {
    setActiveConv(conv);
    setMessages([]);
  };

  /* ── 4. Load messages + subscribe realtime + poll fallback ── */
  useEffect(() => {
    if (!activeConv) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    fetchMessages(activeConv.id);

    const channel = supabase
      .channel(`chat_owner:${activeConv.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          if (payload.new.conversation_id !== activeConv.id) return;
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    const pollInterval = setInterval(() => {
      fetchMessages(activeConv.id);
    }, 5000);

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      clearInterval(pollInterval);
    };
  }, [activeConv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async (convId) => {
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    setLoadingMsgs(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activeConv) return;
    setSending(true);

    await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      sender_role: "BUSINESS_OWNER",
      content: input.trim(),
    });

    setInput("");
    setSending(false);
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
        <div className="max-w-7xl mx-auto">
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

      <div className="flex flex-1 max-w-7xl w-full mx-auto overflow-hidden">
        {/* ── LEFT: CONVERSATION LIST ── */}
        <aside className="w-full md:w-80 lg:w-96 border-r-4 border-l-4 border-b-4 border-[#1A1A1A] flex flex-col shrink-0 bg-white">
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
                    <ChevronRight size={14} className={`shrink-0 ${isActive ? "text-[#00FFFF]" : "opacity-0 group-hover:opacity-100 text-[#EC008C]"} transition-opacity`} />
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── RIGHT: CHAT PANEL ── */}
        <div className="flex-1 flex flex-col min-w-0 border-r-4 border-b-4 border-[#1A1A1A]">
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
                    return (
                      <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        {!isMine && (
                          <div className="w-8 h-8 bg-[#1A1A1A] flex items-center justify-center shrink-0 mr-3 mt-auto">
                            <User size={13} className="text-[#FFF200]" />
                          </div>
                        )}
                        <div className={`max-w-[65%] px-5 py-4 border-2 ${
                          isMine
                            ? "bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(0,255,255,1)]"
                            : "bg-white text-[#1A1A1A] border-[#1A1A1A] shadow-[6px_6px_0px_0px_rgba(236,0,140,0.3)]"
                        }`}>
                          <p className="text-sm font-bold leading-relaxed">{msg.content}</p>
                          <p className={`font-mono text-[8px] uppercase mt-2 font-black tracking-wider ${isMine ? "opacity-40 text-right" : "opacity-40"}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                  placeholder="Type a message..."
                  className="flex-1 px-5 py-4 border-2 border-[#1A1A1A] font-mono text-sm bg-[#F9F9F7] focus:outline-none focus:bg-white focus:ring-4 ring-[#00FFFF]/40 transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
                />
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
