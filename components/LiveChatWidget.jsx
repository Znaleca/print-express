"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { MessageSquare } from "lucide-react";

export default function LiveChatWidget() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user || null);
      setRole(user?.user_metadata?.role || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
      setRole(session?.user?.user_metadata?.role || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || role === "BUSINESS_OWNER" || role === "ADMIN") return;

    const fetchUnread = async () => {
      const { data: convs } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("customer_id", user.id);
      
      const convIds = (convs || []).map(c => c.id);
      if (convIds.length > 0) {
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .eq("is_read", false)
          .neq("sender_id", user.id);
        setUnread(count || 0);
      } else {
        setUnread(0);
      }
    };

    fetchUnread();

    const channel = supabase.channel(`customer_badge:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  if (pathname === "/messages" || role === "BUSINESS_OWNER" || role === "ADMIN" || !user) return null;

  return (
    <Link
      href="/messages"
      className="fixed bottom-6 right-6 z-[999] group transition-transform hover:scale-105"
      aria-label="Open Messages"
    >
      <div className="relative flex items-center gap-2.5 rounded-full border border-white/15 bg-[#1A1A1A] py-3 pl-4 pr-5 text-white shadow-lg transition-colors hover:bg-[#EC008C]">
        <MessageSquare size={20} className="text-[#00FFFF] group-hover:text-white transition-colors" />
        <span className="text-xs font-bold tracking-wide">Messages</span>
        {unread > 0 && (
          <span className="w-5 h-5 rounded-full bg-[#EC008C] text-white text-[10px] font-bold flex items-center justify-center border border-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>
    </Link>
  );
}
