"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, User, ChevronDown, LayoutDashboard, Menu, X, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeLandingSection, setActiveLandingSection] = useState("home");
  const dropdownRef = useRef(null);

  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= 20 || isMobileMenuOpen) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 60) {
        // Scrolling DOWN -> hide header smoothly
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling UP -> show header smoothly
        setIsVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY, isMobileMenuOpen]);

  const userRole = useMemo(() => {
    return user?.user_metadata?.role || user?.role || "CUSTOMER";
  }, [user]);

  const isAdminOrOwner = userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userRole === "BUSINESS_OWNER";

  const consoleLabel = userRole === "BUSINESS_OWNER" ? "Shop Dashboard" : "Admin Dashboard";
  const consoleHref = userRole === "BUSINESS_OWNER" ? "/owner" : "/admin";

  useEffect(() => {
    let mounted = true;

    if (typeof window !== "undefined" && window.location.hash.includes("type=signup")) {
      if (!window.location.pathname.includes("/auth/confirm")) {
        router.push("/auth/confirm" + window.location.hash);
        return;
      }
    }

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
    return user.user_metadata?.full_name || user.email?.split("@")[0] || "Account";
  }, [user]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setIsDropdownOpen(false);
      setIsMobileMenuOpen(false);
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
    <header className={`sticky top-0 z-[100] bg-white/98 backdrop-blur-md border-b border-stone-200/90 shadow-sm w-full text-slate-900 transition-transform duration-300 ease-in-out ${isVisible ? "translate-y-0" : "-translate-y-full"}`}>
      {/* Signature CMYK Top Accent Bar */}
      <div className="cmyk-bar" />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-20 sm:h-24 flex items-center justify-between">

        {/* Big Prominent Editorial Serif Wordmark - Uppercase with Magenta & */}
        <Link href="/" className="group shrink-0 flex items-center">
          <span className="font-serif-brand text-3xl sm:text-4xl md:text-5xl lg:text-[44px] font-black text-slate-900 group-hover:text-[#EC008C] transition-colors tracking-tight select-none uppercase leading-none">
            PRESS <span className="text-[#EC008C] font-serif italic font-normal text-4xl sm:text-5xl md:text-6xl lg:text-[52px]">&</span> PRESENT
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-stone-100/80 p-1.5 rounded-full border border-stone-200">
          {!isAdminOrOwner ? (
            <>
              <NavLink href="/" active={pathname === "/" && activeLandingSection === "home"} onClick={handleLandingNavClick("home")}>Home</NavLink>
              <NavLink href="/#about" active={pathname === "/" && activeLandingSection === "about"} onClick={handleLandingNavClick("about")}>About</NavLink>
              <NavLink href="/browse" active={pathname === "/browse"}>Browse Services</NavLink>
              <NavLink href="/shops" active={pathname === "/shops"}>Print Shops</NavLink>
              {user && <NavLink href="/track" active={pathname === "/track"}>Order Tracking</NavLink>}
              {user && <NavLink href="/messages" active={pathname === "/messages"}>Messages</NavLink>}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href={consoleHref}
                className="px-5 py-2 rounded-full bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                <LayoutDashboard size={16} className="text-[#00FFFF]" />
                {consoleLabel}
              </Link>
            </div>
          )}
        </nav>

        {/* Auth & User Actions */}
        <div className="hidden md:flex items-center gap-3">
          {!loading && user ? (
            <div className="flex items-center gap-3">
              {isAdminOrOwner && (
                <Link
                  href={consoleHref}
                  className="bg-[#EC008C] text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-[#d0007b] transition-all shadow-xs flex items-center gap-2"
                >
                  <LayoutDashboard size={16} /> {consoleLabel}
                </Link>
              )}

              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-3 px-4 py-2 rounded-full border border-stone-300 hover:border-stone-400 bg-stone-100 hover:bg-stone-200/70 transition-all group"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-sm text-slate-800 truncate max-w-[120px]">{displayName}</span>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white text-slate-900 rounded-2xl border border-stone-200 shadow-2xl py-2 z-50 animate-slide-up">
                    <div className="px-4 py-3 border-b border-stone-100 bg-stone-50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed in as</p>
                      <p className="font-bold text-xs text-slate-900 truncate mt-0.5">{user.email}</p>
                      <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-stone-200 text-slate-700 text-[10px] font-extrabold uppercase tracking-wider">
                        {userRole.replace("_", " ")}
                      </span>
                    </div>

                    <Link
                      href="/account-settings"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-stone-100 hover:text-slate-900 transition-colors"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <User size={16} className="text-slate-400" /> Account Settings
                    </Link>

                    {!isAdminOrOwner && (
                      <Link
                        href="/track"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-stone-100 hover:text-slate-900 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <ShoppingBag size={16} className="text-slate-400" /> My Orders
                      </Link>
                    )}

                    <div className="border-t border-stone-100 my-1" />

                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="px-5 py-2.5 text-sm sm:text-base font-bold text-slate-700 hover:text-slate-900 hover:bg-stone-100 rounded-full transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="px-5 py-2.5 text-sm sm:text-base font-bold text-white bg-[#EC008C] hover:bg-[#d0007b] rounded-full shadow-sm transition-all"
              >
                Create account
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2.5 rounded-xl text-slate-800 hover:text-slate-900 hover:bg-stone-100 transition-colors"
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-stone-200 bg-white px-5 py-5 space-y-4 shadow-2xl animate-slide-up text-slate-900">
          <nav className="flex flex-col space-y-1.5">
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-4 py-3 text-base font-bold text-slate-800 hover:bg-stone-100 rounded-xl"
            >
              Home
            </Link>
            <Link
              href="/browse"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-4 py-3 text-base font-bold text-slate-800 hover:bg-stone-100 rounded-xl"
            >
              Browse Services
            </Link>
            <Link
              href="/shops"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-4 py-3 text-base font-bold text-slate-800 hover:bg-stone-100 rounded-xl"
            >
              Print Shops
            </Link>
            {user && (
              <>
                <Link
                  href="/track"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 text-base font-bold text-slate-800 hover:bg-stone-100 rounded-xl"
                >
                  Order Tracking
                </Link>
                <Link
                  href="/messages"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 text-base font-bold text-slate-800 hover:bg-stone-100 rounded-xl"
                >
                  Messages
                </Link>
              </>
            )}
            {isAdminOrOwner && (
              <Link
                href={consoleHref}
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-4 py-3 text-base font-bold text-[#EC008C] hover:bg-pink-50 rounded-xl flex items-center gap-2"
              >
                <LayoutDashboard size={18} /> {consoleLabel}
              </Link>
            )}
          </nav>

          <div className="pt-4 border-t border-stone-200 flex flex-col gap-3">
            {user ? (
              <>
                <div className="px-4 py-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed in as</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{user.email}</p>
                </div>
                <Link
                  href="/account-settings"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full text-center py-3 text-sm font-bold border border-stone-300 rounded-full text-slate-800 hover:bg-stone-100"
                >
                  Account Settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full text-center py-3 text-sm font-bold bg-rose-50 text-rose-600 rounded-full"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex gap-3 pt-1">
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex-1 text-center py-3 text-sm font-bold border border-stone-300 rounded-full text-slate-800 hover:bg-stone-100"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex-1 text-center py-3 text-sm font-bold bg-[#EC008C] text-white rounded-full hover:bg-[#d0007b]"
                >
                  Create account
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, children, active, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm sm:text-base transition-all relative ${active
          ? "text-slate-900 bg-white font-extrabold shadow-xs"
          : "text-slate-600 hover:text-slate-900 hover:bg-stone-200/60 font-bold"
        }`}
    >
      {children}
    </Link>
  );
}


