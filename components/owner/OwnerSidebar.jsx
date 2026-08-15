"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import {
  BarChart2,
  Store,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  MessageSquare,
  Printer,
  Star,
  FileText,
  Lock,
  Settings,
  LogOut,
  Loader2
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/owner",           label: "Overview",   icon: BarChart2,     badge: null },
  { href: "/owner/shop",      label: "My Shop",    icon: Store,         badge: null },
  { href: "/owner/services",  label: "Services",   icon: Layers,        badge: null },
  { href: "/owner/orders",    label: "Orders",     icon: ShoppingBag,   badge: "orders" },
  { href: "/owner/messages",  label: "Messages",   icon: MessageSquare, badge: "messages" },
  { href: "/owner/reviews",   label: "Reviews",    icon: Star,          badge: null },
  { href: "/owner/documents", label: "Documents",  icon: FileText,      badge: null },
];

export default function OwnerSidebar({
  businessName,
  ownerDisplayName,
  ownerEmail,
  isOpen,
  onToggle,
  onSignOut,
  signingOut = false,
  isVerified = true,
  pendingOrders = 0,
  unreadMessages = 0,
}) {
  const pathname = usePathname();

  const getBadgeCount = (key) => {
    if (key === "orders")   return pendingOrders;
    if (key === "messages") return unreadMessages;
    return 0;
  };

  return (
    <aside
      className={`relative z-50 h-screen shrink-0 overflow-visible bg-[#1A1A1A] text-white border-r border-[#2D2D2D] transition-all duration-300 ease-in-out flex flex-col
        ${isOpen ? "w-72" : "w-20"}`}
    >
      <div className="cmyk-bar" />

      {/* Toggle Arrow */}
      <button
        onClick={onToggle}
        className="absolute -right-3.5 top-1/2 z-50 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#55554F] bg-[#2A2A2A] text-white opacity-100 shadow-md backdrop-blur-none transition-all hover:bg-[#00FFFF] hover:text-[#1A1A1A]"
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Brand Header */}
      <div className="mb-4 overflow-hidden border-b border-[#2D2D2D] p-5">
        <div className="flex items-center gap-3">
          <BrandMark className={`h-10 max-w-full shrink-0 ${isOpen ? "w-[72px]" : "w-10 text-sm"}`} />
          {isOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00FFFF]">Owner workspace</p>
              <p className="whitespace-normal break-words text-sm font-black leading-tight text-white">
                {businessName || "My Shop"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, badge: badgeKey }) => {
          const isLocked = !isVerified && href !== "/owner" && href !== "/owner/documents";
          const isActive = href === "/owner" ? pathname === "/owner" : pathname.startsWith(href);
          const count = badgeKey ? getBadgeCount(badgeKey) : 0;

          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center justify-between rounded-2xl px-3.5 py-3 transition-all group text-xs font-semibold
                ${isActive
                  ? "bg-[#00FFFF] text-[#1A1A1A] font-black"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
                }
                ${isLocked ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <Icon size={18} className={isActive ? "text-[#1A1A1A]" : ""} />
                  {count > 0 && !isOpen && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#EC008C] text-white text-[9px] font-bold">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </div>

                {isOpen && (
                  <span className="truncate">
                    {label}
                  </span>
                )}
              </div>

              {isOpen && count > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#EC008C] text-white text-[10px] font-bold">
                  {count}
                </span>
              )}

              {isLocked && isOpen && (
                <Lock size={14} className="text-amber-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Owner account actions */}
      <div className="mt-auto border-t border-[#2D2D2D] p-3">
        {isOpen && (
          <div className="mb-3 rounded-2xl bg-white/5 px-3 py-3">
            <p className="truncate text-xs font-black text-white">{ownerDisplayName || "Shop owner"}</p>
            <p className="mt-1 truncate text-[10px] text-white/45">{ownerEmail || "Owner account"}</p>
          </div>
        )}

        <Link
          href="/owner/account-settings"
          title="Account settings"
          className={`mb-1 flex items-center gap-3 rounded-2xl px-3.5 py-3 text-xs font-semibold text-white/55 transition-colors hover:bg-white/5 hover:text-white ${!isOpen ? "justify-center" : ""}`}
        >
          <Settings size={18} />
          {isOpen && <span>Account settings</span>}
        </Link>

        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          title="Sign out"
          className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-xs font-black text-[#EC008C] transition-colors hover:bg-[#EC008C]/10 disabled:cursor-not-allowed disabled:opacity-60 ${!isOpen ? "justify-center" : ""}`}
        >
          {signingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
          {isOpen && <span>{signingOut ? "Signing out..." : "Sign out"}</span>}
        </button>
      </div>
    </aside>
  );
}
