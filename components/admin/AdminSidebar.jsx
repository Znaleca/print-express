"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Users,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin",          label: "Verifications", icon: BarChart2 },
  { href: "/admin/accounts", label: "Accounts",      icon: Users },
  { href: "/admin/reviews",  label: "Reviews",       icon: MessageSquare },
];

export default function AdminSidebar({ isOpen, onToggle }) {
  const pathname = usePathname();

  return (
    <aside
      className={`relative h-screen bg-slate-900 text-white border-r border-slate-800 transition-all duration-300 ease-in-out flex flex-col z-50 sticky top-0 overflow-visible
        ${isOpen ? "w-64" : "w-20"}`}
    >
      <div className="cmyk-bar" />

      <button
        type="button"
        onClick={onToggle}
        className="absolute -right-3.5 top-12 z-50 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-white shadow-md hover:bg-slate-700 transition-all"
        aria-label={isOpen ? "Collapse admin sidebar" : "Expand admin sidebar"}
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
      
      {/* BRAND BLOCK */}
      <div className="p-5 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-950 font-black text-sm">
            <ShieldCheck size={20} className="text-[#EC008C]" />
          </div>
          {isOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400">System Admin</p>
              <p className="truncate font-bold text-sm text-white">
                Super Admin Console
              </p>
            </div>
          )}
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-xs font-semibold
                ${isActive 
                  ? "bg-slate-800 text-white font-bold" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`}
            >
              <Icon size={18} className={isActive ? "text-[#00FFFF]" : ""} />
              {isOpen && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}