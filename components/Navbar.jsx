"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, User, ChevronDown, Terminal, Printer, LayoutDashboard } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeLandingSection, setActiveLandingSection] = useState("home");
  const dropdownRef = useRef(null);

  const userRole = useMemo(() => {
    return user?.user_metadata?.role || user?.role || "CUSTOMER";
  }, [user]);

  const isAdminOrOwner = userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userRole === "BUSINESS_OWNER";
  
  // Updated console labels
  const consoleLabel = userRole === "BUSINESS_OWNER" ? "Shop_Console" : "Admin_Console";
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

  useEffect(() => {
    if (pathname !== "/") {
      setActiveLandingSection("home");
      return;
    }

    const updateActiveSection = () => {
      const about = document.getElementById("about");
      if (!about) {
        setActiveLandingSection("home");
        return;
      }

      const triggerY = about.offsetTop - 140;
      setActiveLandingSection(window.scrollY >= triggerY ? "about" : "home");
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [pathname]);

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

  const handleLandingNavClick = (target) => (event) => {
    if (pathname !== "/") return;

    event.preventDefault();
    if (target === "about") {
      const about = document.getElementById("about");
      if (about) {
        about.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveLandingSection("about");
      }
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    setActiveLandingSection("home");
  };

  return (
    <header className="sticky top-0 z-[100] bg-[#1A1A1A] text-white border-b-4 border-[#1A1A1A] w-full shadow-xl">
      <div className="w-full px-8 h-20 flex items-center justify-between">

        {/* Brand */}
        <Link href="/" className="flex flex-col group shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-black text-2xl uppercase italic tracking-tighter leading-none">
              Press <span className="text-[#00FFFF]">&</span> Present
            </span>
            <div className="flex gap-1 ml-2">
              <div className="w-2 h-2 bg-[#00FFFF]" />
              <div className="w-2 h-2 bg-[#EC008C]" />
              <div className="w-2 h-2 bg-[#FFF200]" />
            </div>
          </div>
          <span className="font-mono text-[8px] tracking-[0.3em] opacity-40 uppercase">
            Production Grade Portal // 2026
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center h-full">
          {!isAdminOrOwner ? (
            <>
              <NavLink href="/" active={pathname === "/" && activeLandingSection === "home"} onClick={handleLandingNavClick("home")}>Home</NavLink>
              <NavLink href="/#about" active={pathname === "/" && activeLandingSection === "about"} onClick={handleLandingNavClick("about")}>About</NavLink>
              <NavLink href="/browse" active={pathname === "/browse"}>Browse</NavLink>
              <NavLink href="/shops" active={pathname === "/shops"}>Shops</NavLink>
              {user && <NavLink href="/track" active={pathname === "/track"}>Tracking</NavLink>}
            </>
          ) : (
            <div className="px-8 flex items-center gap-2 opacity-30 select-none">
              <Terminal size={12} />
              <span className="font-mono text-[9px] uppercase tracking-[0.2em]">System_Interface_Active</span>
            </div>
          )}
        </nav>

        {/* Auth Actions */}
        <div className="flex items-center gap-6">
          {!loading && user ? (
            <div className="flex items-center gap-4">
              {isAdminOrOwner && (
                <Link
                  href={consoleHref}
                  className="bg-[#FFF200] text-[#1A1A1A] px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest hover:invert transition-all flex items-center gap-2"
                >
                  <LayoutDashboard size={12} /> {consoleLabel}
                </Link>
              )}

              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-3 group"
                >
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-[8px] uppercase opacity-40 tracking-[0.2em]">User_Active</span>
                    <span className="font-bold text-xs uppercase tracking-widest group-hover:text-[#00FFFF]">{displayName}</span>
                  </div>
                  <ChevronDown size={16} className={`text-[#EC008C] transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-4 w-64 bg-white text-[#1A1A1A] border-4 border-[#1A1A1A] shadow-[10px_10px_0px_0px_rgba(0,255,255,1)] animate-in fade-in slide-in-from-top-2">
                    <div className="p-4 border-b-2 border-[#1A1A1A] bg-[#F9F9F9]">
                      <p className="font-mono text-[9px] uppercase opacity-40">Identity_Registry</p>
                      <p className="font-bold text-xs truncate">{user.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <p className="font-mono text-[9px] font-black uppercase tracking-widest">{userRole}</p>
                      </div>
                    </div>

                    <Link
                      href="/account-settings"
                      className="flex items-center gap-3 w-full px-4 py-4 font-mono text-[10px] uppercase font-black hover:bg-[#00FFFF] transition-colors border-b-2 border-[#1A1A1A]"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <User size={14} /> Account_Settings
                    </Link>

                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 w-full px-4 py-4 font-mono text-[10px] uppercase font-black text-[#EC008C] hover:bg-[#EC008C] hover:text-white transition-colors"
                    >
                      <LogOut size={14} /> Sign_Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center border-2 border-white">
              <Link href="/login" className="px-5 py-2 text-[10px] font-mono font-black uppercase hover:bg-white hover:text-[#1A1A1A] transition-colors border-r-2 border-white">Login</Link>
              <Link href="/signup" className="px-5 py-2 text-[10px] font-mono font-black uppercase bg-[#00FFFF] text-[#1A1A1A] hover:bg-[#EC008C] hover:text-white transition-colors">Join</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children, active, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`px-8 h-20 flex flex-col items-center justify-center font-mono text-[10px] font-black uppercase tracking-[0.2em] transition-all relative group ${
        active ? "text-[#00FFFF]" : "text-white/60 hover:text-white"
      }`}
    >
      {children}
      <span className={`absolute bottom-0 left-0 h-1 bg-[#00FFFF] transition-all duration-300 ${active ? "w-full" : "w-0 group-hover:w-full"}`} />
      {active && <span className="absolute bottom-0 left-0 h-1 w-full shadow-[0_0_15px_rgba(0,255,255,0.8)]" />}
    </Link>
  );
}