"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import {
  BarChart2,
  Users,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Loader2,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin",          label: "Verifications", icon: BarChart2 },
  { href: "/admin/accounts", label: "Accounts",      icon: Users },
  { href: "/admin/reviews",  label: "Reviews",       icon: MessageSquare },
];

export default function AdminSidebar({ isOpen, onToggle, adminName, adminEmail, onSignOut, signingOut = false }) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 h-screen shrink-0 bg-[#1A1A1A] text-white border-r border-[#2D2D2D] transition-all duration-300 ease-in-out flex flex-col overflow-visible md:relative md:inset-auto md:translate-x-0
        ${isOpen ? "w-72 translate-x-0" : "w-20 -translate-x-full md:translate-x-0"} max-md:w-72`}
    >
      <div className="cmyk-bar" />

      <button
        type="button"
        onClick={onToggle}
        className="absolute -right-3.5 top-1/2 z-50 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#55554F] bg-[#2A2A2A] text-white shadow-md transition-all hover:bg-[#00FFFF] hover:text-[#1A1A1A]"
        aria-label={isOpen ? "Collapse admin sidebar" : "Expand admin sidebar"}
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
      
      <div className="mb-4 border-b border-[#2D2D2D] p-5">
        <div className="flex items-center gap-3">
          <BrandMark className={`h-10 max-w-full shrink-0 ${isOpen ? "w-[72px]" : "w-10 text-sm"}`} />
          {isOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00FFFF]">Admin workspace</p>
              <p className="truncate font-bold text-sm text-white">
                Platform control
              </p>
            </div>
          )}
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`relative flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-all text-xs font-semibold
                ${isActive
                  ? "bg-[#00FFFF] text-[#1A1A1A] font-black"
                  : "text-white/55 hover:text-white hover:bg-white/5"
                }`}
            >
              <Icon size={18} className={isActive ? "text-[#1A1A1A]" : ""} />
              {isOpen && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[#2D2D2D] p-3">
        {isOpen && (
          <div className="mb-3 rounded-2xl bg-white/5 px-3 py-3">
            <p className="truncate text-xs font-black text-white">{adminName || "Admin"}</p>
            <p className="mt-1 truncate text-[10px] text-white/45">{adminEmail || "Admin account"}</p>
          </div>
        )}

        <Link
          href="/admin/account-settings"
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
