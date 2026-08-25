"use client";

import { ChevronRight, MessageSquare } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";

export default function OwnerConversationList({
  conversations,
  loading,
  activeConversation,
  unreadByConversation,
  getConversationLabel,
  onSelect,
}) {
  return (
    <aside className={`${activeConversation ? "hidden md:flex" : "flex"} flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:w-80 lg:w-96`}>
      <div className="border-b border-slate-100 bg-[#F6F6F2] px-4 py-4 text-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EC008C]">Inbox</p>
            <h2 className="mt-1 text-sm font-extrabold">Customer conversations</h2>
          </div>
          <span className="text-[10px] font-bold text-slate-400">{conversations.length} {conversations.length === 1 ? "thread" : "threads"}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
        {loading ? (
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
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <MessageSquare size={40} className="mb-4 text-slate-200" />
            <p className="text-lg font-black text-slate-400">Inbox empty</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">Customers will contact you from your shop page.</p>
          </div>
        ) : (
          conversations.map((conversation) => {
            const isActive = activeConversation?.id === conversation.id;
            const unread = unreadByConversation[conversation.id] || 0;
            const label = getConversationLabel(conversation);

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation)}
                className={`group flex w-full items-start gap-3 border-l-4 p-4 text-left transition-colors ${
                  isActive ? "border-[#00FFFF] bg-[#EFFFFF]" : "border-transparent hover:bg-slate-50"
                }`}
              >
                <ProfileAvatar
                  src={conversation.customer_profile?.avatar_url}
                  name={label}
                  className="h-10 w-10"
                  fallbackClassName="bg-slate-100 text-slate-500"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block break-words text-sm font-bold leading-snug ${isActive ? "text-slate-900" : "text-slate-800"}`}>
                    {label}
                  </span>
                  {conversation.customer_profile?.email && (
                    <span className="mt-1 block break-all text-[10px] text-slate-400">{conversation.customer_profile.email}</span>
                  )}
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {new Date(conversation.updated_at).toLocaleDateString()}
                  </span>
                </span>
                {unread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EC008C] px-1.5 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
                <ChevronRight size={14} className={`mt-1 shrink-0 ${isActive ? "text-[#00AFC0]" : "text-slate-300 group-hover:text-[#EC008C]"} transition-colors`} />
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
