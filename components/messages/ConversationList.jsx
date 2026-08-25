"use client";

import { Loader2 } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";

export default function ConversationList({
  conversations,
  loading,
  activeConversation,
  unreadByConversation,
  onSelect,
}) {
  return (
    <aside className="flex h-44 min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-auto sm:w-80">
      <div className="border-b border-slate-100 bg-[#F6F6F2] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EC008C]">Inbox</p>
            <h2 className="mt-1 text-sm font-extrabold text-slate-900">Conversations</h2>
          </div>
          <span className="text-[10px] font-bold text-slate-400">{conversations.length} shops</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="p-8 text-center text-xs font-medium text-slate-400">
            <Loader2 className="mx-auto mb-2 animate-spin text-[#EC008C]" size={24} />
            Loading conversations...
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No active conversations. Start chatting from a shop&apos;s profile page.
          </div>
        ) : (
          conversations.map((conversation) => {
            const isActive = activeConversation?.id === conversation.id;
            const business = conversation.businesses || {};
            const unread = unreadByConversation[conversation.id] || 0;

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation)}
                className={`flex w-full items-start gap-3 border-l-4 p-4 text-left transition-colors ${
                  isActive ? "border-[#00FFFF] bg-[#EFFFFF] font-semibold" : "border-transparent hover:bg-slate-50"
                }`}
              >
                <ProfileAvatar
                  src={business.owner_profile?.avatar_url || business.logo_url}
                  name={business.owner_profile?.full_name || business.name || "Print Shop"}
                  className="h-10 w-10"
                  fallbackClassName="bg-slate-100 text-slate-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-slate-900">{business.name || "Print Shop"}</span>
                    {unread > 0 && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EC008C] text-[10px] font-bold text-white">
                        {unread}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">Click to view chat history</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
