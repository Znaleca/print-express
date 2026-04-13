"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Users,
  MessageSquare,
  LogOut,
  ChevronRight,
  Terminal
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin",          label: "Dashboard",  icon: BarChart2 },
  { href: "/admin/accounts", label: "Accounts",   icon: Users     },
  { href: "/admin/reviews",  label: "Reviews",    icon: MessageSquare },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <aside className="owner-sidebar">
      {/* Brand block - Reusing owner-sidebar classes for consistency */}
      <div className="owner-sidebar__brand">
        <div className="owner-sidebar__brand-icon" style={{ background: '#00FFFF' }}>
          <Terminal size={16} className="text-[#1A1A1A]" />
        </div>
        <div>
          <p className="owner-sidebar__brand-label">Admin Console</p>
          <p className="owner-sidebar__brand-name">Super User</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="owner-sidebar__nav">
        <p className="owner-sidebar__nav-heading">Navigation</p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`owner-sidebar__nav-link ${isActive ? "owner-sidebar__nav-link--active" : ""}`}
              style={isActive ? { color: '#00FFFF', borderLeftColor: '#00FFFF' } : {}}
            >
              <Icon size={16} />
              <span>{label}</span>
              {isActive && <ChevronRight size={14} className="owner-sidebar__nav-chevron" style={{ color: '#00FFFF' }} />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="owner-sidebar__footer">
        <button
          onClick={handleSignOut}
          className="owner-sidebar__signout"
          style={{ color: '#EC008C', borderColor: '#333' }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#EC008C';
            e.currentTarget.style.color = '#FFF';
            e.currentTarget.style.borderColor = '#EC008C';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#EC008C';
            e.currentTarget.style.borderColor = '#333';
          }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
