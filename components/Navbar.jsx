"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, User, ChevronDown, LayoutDashboard, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import BrandMark from "@/components/BrandMark";
import PillNav from "@/components/PillNav";

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

  const resolvedUserRole = useMemo(() => {
    return user?.user_metadata?.role || user?.role || "CUSTOMER";
  }, [user]);

  const isPortalRoute = pathname?.startsWith("/owner") || pathname?.startsWith("/admin");
  const isAuthRoute = [
    "/login",
    "/signup",
    "/reset-password",
    "/auth/confirm",
  ].includes(pathname);

  // Keep the public header stable while an auth form finishes its redirect.
  // Supabase can emit SIGNED_IN before the router leaves /login; using the
  // resolved user directly here would briefly turn this into a portal header.
  const headerUser = isAuthRoute ? null : user;
  const headerUserRole = useMemo(() => {
    return headerUser?.user_metadata?.role || headerUser?.role || "CUSTOMER";
  }, [headerUser]);

  const isAdminOrOwner = headerUserRole === "ADMIN" || headerUserRole === "BUSINESS_OWNER";
  const isPortalExperience = isPortalRoute || isAdminOrOwner;

  const consoleLabel = headerUserRole === "BUSINESS_OWNER" ? "Shop Dashboard" : "Admin Dashboard";
  const consoleHref = headerUserRole === "BUSINESS_OWNER" ? "/owner" : "/admin";

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
    if (!loading && resolvedUserRole === "BUSINESS_OWNER" && pathname === "/") {
      router.replace("/owner");
    }
  }, [loading, pathname, resolvedUserRole, router]);

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
    if (!headerUser) return "";
    return headerUser.user_metadata?.full_name || headerUser.email?.split("@")[0] || "Account";
  }, [headerUser]);

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

    if (target === "about") {
      const about = document.getElementById("about");
      // The public Home page currently has no inline About section, so keep
      // the normal Link navigation to /about when the anchor is unavailable.
      if (!about) return;
      event.preventDefault();
      about.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveLandingSection("about");
      return;
    }

    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setActiveLandingSection("home");
  };

  // Owner and admin routes use their dedicated portal sidebars instead of the
  // public header. Auth routes intentionally keep the public header visible,
  // but headerUser above stays null until navigation leaves the auth screen.
  if (isPortalRoute) return null;

  return (
    <header className={`sticky top-0 z-[100] w-full border-b border-stone-200/90 bg-white/98 text-slate-900 shadow-sm transition-transform duration-300 ease-in-out ${isVisible ? "translate-y-0" : "-translate-y-full"}`}>
      {/* Signature CMYK Top Accent Bar */}
      <div className="cmyk-bar" />

      <div className="public-header-layout mx-auto grid h-16 max-w-[1600px] items-center px-4 sm:h-20 sm:px-6 lg:px-8">
        <div className="justify-self-start" aria-label="Press and Present">
          {isPortalExperience ? (
            <BrandMark className="h-8 w-[60px] sm:h-9 sm:w-[64px]" />
          ) : (
            <Link href="/" className="group" aria-label="Press and Present home">
              <BrandMark className="h-8 w-[60px] transition-transform group-hover:-rotate-3 group-hover:scale-105 sm:h-9 sm:w-[64px]" />
            </Link>
          )}
        </div>

        {/* Public navigation uses the animated PillNav layout. */}
        <div className="min-w-0 justify-self-center">
          {!isPortalExperience && (
            <PillNav
              showLogo={false}
              items={[
                { href: "/", label: "Home" },
                { href: "/about", label: "About" },
                { href: "/browse", label: "Browse Services" },
                { href: "/shops", label: "Print Shops" },
                ...(headerUser ? [{ href: "/track", label: "Order Tracking" }] : []),
              ]}
              activeHref={pathname === "/" ? (activeLandingSection === "about" ? "/about" : "/") : pathname}
              onItemClick={(item, event) => {
                if (item.href === "/" && pathname === "/") handleLandingNavClick("home")(event);
                if (item.href === "/about" && pathname === "/") handleLandingNavClick("about")(event);
              }}
              onMobileMenuChange={setIsMobileMenuOpen}
            />
          )}
        </div>

        {/* Auth & User Actions */}
        <div className="hidden items-center gap-3 justify-self-end md:flex">
          {!loading && headerUser ? (
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
                  className="group flex items-center gap-2.5 rounded-xl border border-stone-300 bg-stone-100 px-3 py-1.5 transition-all hover:border-stone-400 hover:bg-stone-200/70"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="max-w-[120px] truncate text-sm font-bold text-slate-800">{displayName}</span>
                  <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white text-slate-900 rounded-2xl border border-stone-200 shadow-2xl py-2 z-50 animate-slide-up">
                    <div className="px-4 py-3 border-b border-stone-100 bg-stone-50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed in as</p>
                      <p className="font-bold text-xs text-slate-900 truncate mt-0.5">{headerUser.email}</p>
                      <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-stone-200 text-slate-700 text-[10px] font-extrabold uppercase tracking-wider">
                        {headerUserRole.replace("_", " ")}
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
                className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-stone-100 hover:text-slate-900 sm:text-sm"
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

      </div>

      {/* Mobile account actions remain separate from the PillNav links. */}
      {isMobileMenuOpen && (
        <div className="pill-nav-mobile-account lg:hidden">
          {headerUser ? (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed in as</p>
                <p className="truncate text-sm font-bold text-slate-900">{headerUser.email}</p>
              </div>
              <Link href="/account-settings" onClick={() => setIsMobileMenuOpen(false)} className="pill-nav-account-link">Account settings</Link>
              <button onClick={handleSignOut} className="pill-nav-account-link pill-nav-account-link-danger">Sign out</button>
            </>
          ) : (
            <div className="flex gap-2">
              <Link href="/login" onClick={() => setIsMobileMenuOpen(false)} className="pill-nav-account-link flex-1 text-center">Sign in</Link>
              <Link href="/signup" onClick={() => setIsMobileMenuOpen(false)} className="pill-nav-account-link pill-nav-account-link-primary flex-1 text-center">Create account</Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
