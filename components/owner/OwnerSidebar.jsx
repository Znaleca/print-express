"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Store,
  Layers,
  LogOut,
  ChevronRight,
  ShoppingBag
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/owner",          label: "Overview",  icon: BarChart2 },
  { href: "/owner/shop",     label: "My Shop",   icon: Store     },
  { href: "/owner/services", label: "Services",  icon: Layers    },
  { href: "/owner/orders",   label: "Orders",    icon: ShoppingBag },
];

export default function OwnerSidebar({ businessName }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <aside className="owner-sidebar">
      {/* Brand block */}
      <div className="owner-sidebar__brand">
        <div className="owner-sidebar__brand-icon">
          <div className="owner-sidebar__brand-dot" />
        </div>
        <div>
          <p className="owner-sidebar__brand-label">Owner Console</p>
          <p className="owner-sidebar__brand-name">{businessName || "My Business"}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="owner-sidebar__nav">
        <p className="owner-sidebar__nav-heading">Navigation</p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/owner" ? pathname === "/owner" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`owner-sidebar__nav-link ${isActive ? "owner-sidebar__nav-link--active" : ""}`}
            >
              <Icon size={16} />
              <span>{label}</span>
              {isActive && <ChevronRight size={14} className="owner-sidebar__nav-chevron" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="owner-sidebar__footer">
        <button
          onClick={handleSignOut}
          className="owner-sidebar__signout"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
