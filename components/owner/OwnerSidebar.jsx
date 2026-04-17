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
  Printer
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/owner",          label: "Overview",   icon: BarChart2,     color: "hover:bg-[#00FFFF]" }, // Cyan
  { href: "/owner/shop",     label: "My Shop",    icon: Store,         color: "hover:bg-[#EC008C]" }, // Magenta
  { href: "/owner/services", label: "Services",   icon: Layers,        color: "hover:bg-[#FFF200]" }, // Yellow
  { href: "/owner/orders",   label: "Orders",     icon: ShoppingBag,   color: "hover:bg-[#00FFFF]" }, // Cyan
  { href: "/owner/messages", label: "Messages",   icon: MessageSquare, color: "hover:bg-[#EC008C]" }, // Magenta
];

export default function OwnerSidebar({ businessName, isOpen, onToggle }) {
  const pathname = usePathname();

  return (
    <aside
      className={`relative h-screen bg-[#FDFDFD] border-r-8 border-[#1A1A1A] transition-all duration-300 ease-in-out flex flex-col z-50
        ${isOpen ? "w-72" : "w-24"}`}
    >
      {/* Neo-Brutalist Arrow Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-7 top-12 z-50 flex h-12 w-12 items-center justify-center border-4 border-[#1A1A1A] bg-white text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
      >
        {isOpen ? <ChevronLeft size={24} strokeWidth={3} /> : <ChevronRight size={24} strokeWidth={3} />}
      </button>

      {/* Brand Section */}
      <div className="p-6 mb-8">
        <div className="flex items-center gap-4">
          {/* Logo Box with Cyan shadow */}
          <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center border-4 border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
            <Printer size={24} />
          </div>
          {isOpen && (
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#EC008C]">Console_v1.0</p>
              <p className="truncate font-black text-xl uppercase tracking-tighter text-[#1A1A1A] italic">
                {businessName || "My Business"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon, color }) => {
          const isActive = href === "/owner" ? pathname === "/owner" : pathname.startsWith(href);
          
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-4 p-3 border-4 transition-all group min-w-0
                ${isActive 
                  ? "border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-[6px_6px_0px_0px_rgba(236,0,140,1)] translate-x-[-2px] translate-y-[-2px]" 
                  : `border-transparent text-[#1A1A1A] ${color} hover:border-[#1A1A1A] hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]`
                }`}
            >
              <Icon size={24} strokeWidth={isActive ? 3 : 2} className="flex-shrink-0" />
              <span
                className={`font-black uppercase tracking-tighter text-lg whitespace-nowrap overflow-hidden transition-all duration-200 ${
                  isOpen ? "max-w-[180px] opacity-100" : "max-w-0 opacity-0"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom CMYK Decorative Strip */}
      <div className="flex h-4 w-full border-t-4 border-[#1A1A1A]">
        <div className="flex-1 bg-[#00FFFF]" />
        <div className="flex-1 bg-[#EC008C]" />
        <div className="flex-1 bg-[#FFF200]" />
        <div className="flex-1 bg-[#1A1A1A]" />
      </div>
    </aside>
  );
}