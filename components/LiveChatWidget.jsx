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

  // Hide on the messages page itself (no need for shortcut)
  if (pathname === "/messages") return null;

  // Hide for owners and admins (they use the sidebar)
  if (role === "BUSINESS_OWNER" || role === "SUPER_ADMIN") return null;

  // Hide if not logged in
  if (!user) return null;

  // Always show button — if not logged in, link still works (page handles redirect)
  return (
    <Link
      href="/messages"
      className="fixed bottom-8 right-8 md:bottom-10 md:right-10 z-[999] flex items-end group transition-transform hover:-translate-y-2 hover:-translate-x-0.5"
      aria-label="Open Live Chat"
    >
      <div className="flex items-center shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] group-hover:shadow-[12px_12px_0px_0px_rgba(236,0,140,1)] transition-shadow">
        {/* ICON BOX */}
        <div className="bg-[#1A1A1A] text-[#00FFFF] border-4 border-[#1A1A1A] w-14 h-14 md:w-16 md:h-16 flex items-center justify-center shrink-0 group-hover:bg-[#EC008C] group-hover:text-white transition-colors relative z-10">
          <MessageSquare size={28} strokeWidth={2.5} />
          {unread > 0 && (
            <span className="absolute -top-3 -right-3 w-6 h-6 bg-[#EC008C] text-white text-[11px] font-black flex items-center justify-center border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
        
        {/* TEXT LABEL (Hidden on tiny screens, shows on medium+) */}
        <div className="hidden sm:flex bg-[#00FFFF] border-4 border-l-0 border-[#1A1A1A] h-10 md:h-12 px-4 items-center justify-center group-hover:bg-[#FFF200] transition-colors relative -left-1">
          <span className="font-mono text-[10px] md:text-[11px] uppercase font-black tracking-[0.2em] text-[#1A1A1A] pr-1">
            System_Comms
          </span>
        </div>
      </div>
    </Link>
  );
}
