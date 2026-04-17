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
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "ADMIN") {
        setState("unauthorized");
        return;
      }

      setState("approved");
    };

    run();
  }, [router]);

  /* ── Gate UI Wrapper ── */
  const GateUI = ({ icon: Icon, title, message, badge, type, action }) => (
    <div className="min-h-screen bg-[#F4F4F1] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full border-4 border-black p-8 bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div className={`p-3 border-2 border-black ${type === 'error' ? 'bg-[#FF3E00] text-white' : 'bg-[#00FFFF] text-[#1A1A1A]'}`}>
              <Icon size={32} />
            </div>
            {badge && (
              <span className="font-mono text-[10px] font-black uppercase tracking-widest border-2 border-black px-2 py-1">
                {badge}
              </span>
            )}
          </div>

          <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none mb-4">
            {title ? title.replace(/\s/g, "_") : "SYSTEM_LOG"}
          </h1>

          <p className="font-mono text-xs uppercase tracking-tight leading-relaxed opacity-70 mb-8 border-l-4 border-black/10 pl-4">
            {message}
          </p>

          {action && (
            <button
              onClick={action.onClick}
              className="w-full bg-black text-white py-4 font-mono text-[10px] font-black uppercase tracking-[0.3em] hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-colors shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]"
            >
              {action.label}
            </button>
          )}

          <div className="mt-8 pt-4 border-t border-black/5 flex justify-between font-mono text-[8px] opacity-40 uppercase">
            <span>Security_Layer: 00</span>
            <span>Auth_Check: {mounted ? new Date().toLocaleTimeString() : "INITIALIZING..."}</span>
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
    <div className="flex min-h-screen bg-[#F4F4F1]">
      <AdminSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((current) => !current)}
      />
      <main className="flex-1 min-w-0 w-full">
        <div className="w-full max-w-none min-h-[calc(100vh-80px)] p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
