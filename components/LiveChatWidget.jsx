"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { MessageSquare } from "lucide-react";

async function getProfileRole(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role || null;
}

export default function LiveChatWidget() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const loadUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!active) return;
      setUser(currentUser || null);
      const nextRole = currentUser ? await getProfileRole(currentUser.id) : null;
      if (!active) return;
      setRole(nextRole);
    };
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      setRole(null);
      window.setTimeout(async () => {
        if (!active || !nextUser) return;
        setRole(await getProfileRole(nextUser.id));
      }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !role || role === "BUSINESS_OWNER" || role === "ADMIN") return;

    let active = true;
    let channel = null;

    const fetchUnread = async () => {
      const { data: convs } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("customer_id", user.id)
        .range(0, 99);
      
      const convIds = (convs || []).map(c => c.id);
      if (convIds.length > 0) {
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .eq("is_read", false)
          .neq("sender_id", user.id);
        if (active) setUnread(count || 0);
      } else {
        if (active) setUnread(0);
      }

      return convIds;
    };

    const setupRealtime = async () => {
      const convIds = await fetchUnread();
      if (!active) return;

      channel = supabase.channel(`customer_badge:${user.id}`);
      convIds.slice(0, 100).forEach((conversationId) => {
        channel = channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          fetchUnread
        );
      });
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_conversations",
          filter: `customer_id=eq.${user.id}`,
        },
        fetchUnread
      ).subscribe();
    };

    setupRealtime();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
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
