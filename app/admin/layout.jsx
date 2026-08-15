"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AdminSidebar from "@/components/admin/AdminSidebar";
import {
  ShieldAlert,
  Loader2,
  Activity
} from "lucide-react";

export default function AdminLayout({ children }) {
  const router = useRouter();
  const [state, setState] = useState("checking"); // checking | approved | unauthorized
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminAccount, setAdminAccount] = useState({ name: "Admin", email: "" });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);

    const run = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "ADMIN") {
        setState("unauthorized");
        return;
      }

      setAdminAccount({
        name: profile.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Admin",
        email: user.email || "",
      });
      setState("approved");
    };

    run();
  }, [router]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  /* ── Gate UI Wrapper ── */
  const GateUI = ({ icon: Icon, title, message, badge, type, action }) => (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1A1A1A] p-6 font-sans">
      <div className="cmyk-bar absolute left-0 right-0 top-0" />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white p-8 shadow-[0_18px_42px_rgba(26,26,26,0.16)]">

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div className={`rounded-2xl p-3 ${type === 'error' ? 'bg-[#EC008C] text-white' : 'bg-[#00FFFF] text-[#1A1A1A]'}`}>
              <Icon size={32} />
            </div>
            {badge && (
              <span className="rounded-full border border-[#D8D6CE] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#676762]">
                {badge}
              </span>
            )}
          </div>

          <h1 className="mb-4 text-3xl font-black tracking-tight leading-none">
            {title || "Checking access"}
          </h1>

          <p className="mb-8 border-l-2 border-[#EC008C] pl-4 text-sm leading-relaxed text-[#676762]">
            {message}
          </p>

          {action && (
            <button
              onClick={action.onClick}
              className="w-full rounded-full bg-[#1A1A1A] py-3.5 text-sm font-extrabold text-white transition-colors hover:bg-[#00FFFF] hover:text-[#1A1A1A]"
            >
              {action.label}
            </button>
          )}

          <div className="mt-8 flex justify-between border-t border-[#D8D6CE] pt-4 text-[10px] text-[#676762]">
            <span>Security layer · 00</span>
            <span>Auth check · {mounted ? new Date().toLocaleTimeString() : "Initializing..."}</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (state === "checking") {
    return (
      <GateUI
        icon={Activity}
        title="Verifying Access"
        message="Establishing secure connection to the central node registry. Checking admin authorization..."
        badge="SCANNING"
        type="loading"
      />
    );
  }

  if (state === "unauthorized") {
    return (
      <GateUI
        icon={ShieldAlert}
        title="Access Denied"
        message="Your current profile lacks the required ADMIN permissions to access this terminal."
        badge="ERR_403"
        type="error"
        action={{
          label: "Return_to_Nexus",
          onClick: () => router.push("/browse")
        }}
      />
    );
  }

  /* ── Approved Portal ── */
  return (
    <div className="flex h-screen overflow-hidden bg-[#1A1A1A]">
      <AdminSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((current) => !current)}
        adminName={adminAccount.name}
        adminEmail={adminAccount.email}
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />
      <main className="min-h-0 min-w-0 flex-1 w-full overflow-y-auto">
        <div className="relative min-h-full w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
