"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, User, ChevronDown, ShieldCheck, Home, Terminal, Activity } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const userRole = useMemo(() => {
    return user?.user_metadata?.role || user?.role || "CUSTOMER";
  }, [user]);

  const isAdminOrOwner = userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userRole === "BUSINESS_OWNER";

  const consoleLabel = userRole === "BUSINESS_OWNER" ? "Business Terminal" : "System Admin";
  const consoleHref = userRole === "BUSINESS_OWNER" ? "/owner" : "/admin";

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(currentUser || null);
      setLoading(false);
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.user_metadata?.full_name?.toUpperCase() || user.email?.split("@")[0].toUpperCase() || "ACCOUNT";
  }, [user]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setIsDropdownOpen(false);
      router.push("/");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-[100] bg-[#F4F4F1] border-b-4 border-[#1A1A1A] w-full">
      <div className="w-full px-8 h-20 flex items-center justify-between">

        {/* Brand - Clickable for Customers, Static for Admins/Owners */}
        {isAdminOrOwner ? (
          <div className="flex items-center gap-3 shrink-0 cursor-default select-none">
            <div className="w-10 h-10 bg-[#1A1A1A] flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(255,62,0,1)]">
              <div className="w-4 h-4 bg-[#FF3E00] rounded-full" />
            </div>
            <span className="font-mono text-2xl font-black tracking-tighter uppercase italic">
              Print<span className="text-[#FF3E00]">.</span>Studio
            </span>
          </div>
        ) : (
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-10 h-10 bg-[#1A1A1A] flex items-center justify-center transition-transform group-hover:rotate-90 shadow-[3px_3px_0px_0px_rgba(255,62,0,1)]">
              <div className="w-4 h-4 bg-[#FF3E00] rounded-full" />
            </div>
            <span className="font-mono text-2xl font-black tracking-tighter uppercase italic">
              Print<span className="text-[#FF3E00]">.</span>Studio
            </span>
          </Link>
        )}

        {/* Navigation - Conditional Rendering */}
        <nav className="hidden md:flex items-center h-full">
          {!isAdminOrOwner ? (
            <>
              <NavLink href="/" active={pathname === "/"}>
                <Home size={14} className="mr-2" /> Home
              </NavLink>
              <NavLink href="/browse" active={pathname === "/browse"}>Browse Catalog</NavLink>

              {/* Only show Track Order if user is logged in */}
              {user && (
                <NavLink href="/track" active={pathname === "/track"}>Track Order</NavLink>
              )}
            </>
          ) : (
            <div className="px-8 flex items-center gap-2 opacity-30 select-none">
              <Terminal size={12} />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Restricted_Console_View</span>
            </div>
          )}
        </nav>

        {/* Auth Actions */}
        <div className="flex items-center gap-4 shrink-0">
          {!loading && user ? (
            <div className="flex items-center gap-3">
              {isAdminOrOwner && (
                <Link
                  href={consoleHref}
                  className="hidden sm:flex items-center gap-2 bg-[#FFF200] border-2 border-[#1A1A1A] px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest hover:bg-[#1A1A1A] hover:text-[#FFF200] transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none relative group"
                >
                  <Terminal size={12} />
                  {consoleLabel}
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3E00]"></span>
                  </span>
                </Link>
              )}

              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`flex items-center gap-3 px-4 py-2 border-2 transition-all ${isDropdownOpen ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-transparent border-transparent hover:border-[#1A1A1A]"
                    }`}
                >
                  <div className="flex flex-col items-end text-right">
                    <span className="font-mono text-[8px] uppercase opacity-50 tracking-[0.2em]">Node_Connected</span>
                    <span className="font-bold text-xs uppercase tracking-tight">{displayName}</span>
                  </div>
                  <ChevronDown size={16} className={`transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border-4 border-[#1A1A1A] shadow-[10px_10px_0px_0px_rgba(26,26,26,1)] animate-in fade-in zoom-in-95 duration-100 z-[9999]">
                    <div className="p-4 border-b-2 border-[#1A1A1A] bg-[#F4F4F1]">
                      <p className="font-mono text-[10px] uppercase text-gray-400">Registry_ID</p>
                      <p className="font-bold text-sm truncate">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Activity size={10} className="text-[#FF3E00]" />
                        <p className="font-mono text-[9px] text-[#FF3E00] font-black uppercase tracking-tighter">Permission: {userRole}</p>
                      </div>
                    </div>

                    <Link
                      href="/dashboard"
                      className="flex items-center gap-3 w-full px-4 py-4 text-left font-mono text-[11px] uppercase font-black hover:bg-[#1A1A1A] hover:text-white transition-colors border-b-2 border-[#1A1A1A]"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <User size={14} /> View_Profile
                    </Link>

                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 w-full px-4 py-4 text-left font-mono text-[11px] uppercase font-black text-[#FF3E00] hover:bg-[#FF3E00] hover:text-white transition-colors"
                    >
                      <LogOut size={14} /> Terminate_Session
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <Link href="/login" className="px-6 py-2 text-xs font-mono font-black uppercase hover:bg-gray-200 transition-colors border-r-2 border-[#1A1A1A] bg-white">Login</Link>
              <Link href="/signup" className="px-6 py-2 text-xs font-mono font-black uppercase bg-[#1A1A1A] text-white hover:bg-[#FF3E00] transition-colors">Register</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children, active }) {
  return (
    <Link
      href={href}
      className={`px-6 h-20 flex items-center font-mono text-xs font-bold uppercase tracking-widest transition-all relative group ${active ? "text-[#1A1A1A] bg-white" : "text-gray-500 hover:text-[#1A1A1A] hover:bg-white"
        }`}
    >
      {children}
      <span className={`absolute bottom-0 left-0 h-1 bg-[#FF3E00] transition-all ${active ? "w-full" : "w-0 group-hover:w-full"}`} />
    </Link>
  );
}