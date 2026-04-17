"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Users,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Terminal,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin",          label: "Dashboard",  icon: BarChart2,    color: "group-hover:bg-[#00FFFF]" }, // Cyan
  { href: "/admin/accounts", label: "Accounts",   icon: Users,        color: "group-hover:bg-[#EC008C]" }, // Magenta
  { href: "/admin/reviews",  label: "Reviews",    icon: MessageSquare, color: "group-hover:bg-[#FFF200]" }, // Yellow
];

export default function AdminSidebar({ isOpen, onToggle }) {
  const pathname = usePathname();

  return (
    <aside
      className={`relative h-screen bg-[#FDFDFD] border-r-8 border-[#1A1A1A] transition-all duration-300 ease-in-out flex flex-col z-50 sticky top-0 overflow-visible
        ${isOpen ? "w-72" : "w-24"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="absolute -right-7 top-12 z-50 flex h-12 w-12 items-center justify-center border-4 border-[#1A1A1A] bg-white text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        aria-label={isOpen ? "Collapse admin sidebar" : "Expand admin sidebar"}
        title={isOpen ? "Collapse admin sidebar" : "Expand admin sidebar"}
      >
        {isOpen ? <ChevronLeft size={24} strokeWidth={3} /> : <ChevronRight size={24} strokeWidth={3} />}
      </button>
      
      {/* BRAND BLOCK */}
      <div className={`p-6 mb-4 ${isOpen ? "" : "px-4"}`}>
        <div className={`flex items-center gap-4 overflow-hidden p-4 border-4 border-[#1A1A1A] bg-white shadow-[6px_6px_0px_0px_rgba(236,0,140,1)] ${isOpen ? "" : "justify-center"}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#1A1A1A] text-[#00FFFF]">
            <Terminal size={20} strokeWidth={3} />
          </div>
          <div className={`min-w-0 ${isOpen ? "block" : "hidden"}`}>
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/40">
              Root_Access
            </p>
            <p className="truncate font-black text-xl uppercase tracking-tighter italic leading-none">
              Admin
            </p>
          </div>
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 px-4 space-y-4">
        <p className={`px-2 font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[#1A1A1A]/30 mb-2 ${isOpen ? "" : "hidden"}`}>
          // Main_Directives
        </p>
        
        {NAV_ITEMS.map(({ href, label, icon: Icon, color }) => {
          const isActive = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`group flex items-center gap-4 p-3 border-4 transition-all min-w-0
                ${isActive 
                  ? "border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-[6px_6px_0px_0px_rgba(0,255,255,1)] translate-x-[-2px] translate-y-[-2px]" 
                  : `border-transparent text-[#1A1A1A] hover:border-[#1A1A1A] hover:bg-white hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]`
                }`}
            >
              <div className={`shrink-0 p-1 transition-colors ${isActive ? "text-[#00FFFF]" : color}`}>
                <Icon size={22} strokeWidth={isActive ? 3 : 2} />
              </div>
              <span className={`min-w-0 truncate font-black uppercase tracking-tighter text-lg ${isOpen ? "block" : "hidden"}`}>
                {label}
              </span>
              {isActive && isOpen && <ChevronRight size={18} className="ml-auto shrink-0 animate-pulse" />}
            </Link>
          );
        })}
      </nav>

      {/* CMYK ACCENT STRIP */}
      <div className="flex h-3 w-full border-t-2 border-[#1A1A1A]">
        <div className="flex-1 bg-[#00FFFF]" />
        <div className="flex-1 bg-[#EC008C]" />
        <div className="flex-1 bg-[#FFF200]" />
      </div>
    </aside>
  );
}