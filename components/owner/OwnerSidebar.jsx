"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Lock
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

export default function OwnerSidebar({ businessName, isOpen, onToggle, isVerified = true, pendingOrders = 0, unreadMessages = 0 }) {
  const pathname = usePathname();

  const getBadgeCount = (key) => {
    if (key === "orders")   return pendingOrders;
    if (key === "messages") return unreadMessages;
    return 0;
  };

  return (
    <aside
      className={`relative h-screen bg-slate-900 text-white border-r border-slate-800 transition-all duration-300 ease-in-out flex flex-col z-50
        ${isOpen ? "w-64" : "w-20"}`}
    >
      <div className="cmyk-bar" />

      {/* Toggle Arrow */}
      <button
        onClick={onToggle}
        className="absolute -right-3.5 top-12 z-50 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-white shadow-md hover:bg-slate-700 transition-all"
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Brand Header */}
      <div className="p-5 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-950 font-black text-sm">
            <span className="text-[#00E5FF]">P</span>
            <span className="text-[#EC008C]">-</span>
            <span className="text-[#EAB308]">P</span>
          </div>
          {isOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400">Shop Dashboard</p>
              <p className="truncate font-bold text-sm text-white">
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
              className={`relative flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all group text-xs font-semibold
                ${isActive
                  ? "bg-slate-800 text-white font-bold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }
                ${isLocked ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <Icon size={18} className={isActive ? "text-[#00FFFF]" : ""} />
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
    </aside>
  );
}