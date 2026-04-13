"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import OwnerSidebar from "@/components/owner/OwnerSidebar";
import {
  ShieldAlert,
  Loader2,
  Lock,
  Construction,
  XCircle,
  Activity
} from "lucide-react";

export default function OwnerLayout({ children }) {
  const router = useRouter();
  const [state, setState] = useState("checking"); // checking | approved | pending | rejected | unauthorized
  const [businessName, setBusinessName] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Kill hydration mismatch by tracking mount status
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

      if (!profile || profile.role !== "BUSINESS_OWNER") {
        setState("unauthorized");
        return;
      }

      const { data: business } = await supabase
        .from("businesses")
        .select("id, name, status")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!business) {
        const requestedName =
          (user.user_metadata?.business_name || "").trim() ||
          (user.user_metadata?.full_name || "").trim() + "'s Business" ||
          "Pending Business";

        const { data: created } = await supabase
          .from("businesses")
          .insert({ owner_id: user.id, name: requestedName, status: "PENDING" })
          .select("name, status")
          .single();

        setBusinessName(created?.name || "");
        setState("pending");
        return;
      }

      setBusinessName(business.name || "");

      if (business.status === "APPROVED") {
        setState("approved");
      } else if (business.status === "REJECTED") {
        setState("rejected");
      } else {
        setState("pending");
      }
    };

    run();
  }, [router]);

  /* ── Gate UI Wrapper ── */
  const GateUI = ({ icon: Icon, title, message, badge, type, action }) => (
    <div className="min-h-screen bg-[#F4F4F1] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full border-4 border-black p-8 bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden">
        {/* Decorative Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div className={`p-3 border-2 border-black ${type === 'error' ? 'bg-[#FF3E00] text-white' : 'bg-[#FFF200] text-black'}`}>
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
              className="w-full bg-black text-white py-4 font-mono text-[10px] font-black uppercase tracking-[0.3em] hover:bg-[#FF3E00] transition-colors shadow-[4px_4px_0px_0px_rgba(255,62,0,1)]"
            >
              {action.label}
            </button>
          )}

          <div className="mt-8 pt-4 border-t border-black/5 flex justify-between font-mono text-[8px] opacity-40 uppercase">
            <span>Security_Layer: 04</span>
            {/* The mounted check prevents the hydration error by ensuring server and client initially render the same text */}
            <span>Auth_Check: {mounted ? new Date().toLocaleTimeString() : "INITIALIZING..."}</span>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── State Handlers ── */
  if (state === "checking") {
    return (
      <GateUI
        icon={Activity}
        title="Syncing Credentials"
        message="Establishing secure connection to the central node registry. Checking authorization packets..."
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
        message="Your current profile lacks the required BUSINESS_OWNER permissions to access this terminal."
        badge="ERR_403"
        type="error"
        action={{
          label: "Return_to_Nexus",
          onClick: () => router.push("/browse")
        }}
      />
    );
  }

  if (state === "pending") {
    return (
      <GateUI
        icon={Construction}
        title="Awaiting Validation"
        message={`Node [${businessName}] is currently in the verification queue. Operations will resume once an admin validates your credentials.`}
        badge="LOCKED"
        type="pending"
      />
    );
  }

  if (state === "rejected") {
    return (
      <GateUI
        icon={XCircle}
        title="Node Deactivated"
        message={`Verification for [${businessName}] was unsuccessful. The data stream has been terminated by system administration.`}
        badge="REJECTED"
        type="error"
        action={{
          label: "Contact_Support",
          onClick: () => window.location.href = "mailto:support@yourdomain.com"
        }}
      />
    );
  }

  /* ── Approved Portal ── */
  return (
    <div className="flex min-h-screen bg-[#F4F4F1]">
      <OwnerSidebar businessName={businessName} />
      <main className="flex-1">
        <div className="max-w-[1600px] mx-auto min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}