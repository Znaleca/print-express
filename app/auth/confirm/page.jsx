"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ShieldCheck } from "lucide-react";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Authenticating...");

  useEffect(() => {
    let active = true;

    const processLoginAndRedirect = async () => {
      try {
        setStatus("Verifying credentials...");
        // Wait briefly for supabase-js to parse the URL hash and save the session
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!active) return;

        if (user) {
          const role = user.user_metadata?.role || "CUSTOMER";
          setStatus("Verification complete. Redirecting...");
          
          if (role === "BUSINESS_OWNER") {
            router.replace("/owner/documents");
          } else {
            router.replace("/browse");
          }
        } else {
           setStatus("Session not found. Redirecting to login...");
           setTimeout(() => router.replace("/login"), 1500);
        }
        
      } catch (err) {
        if (!active) return;
        setStatus("Error verifying email. Redirecting to login...");
        setTimeout(() => router.replace("/login"), 1500);
      }
    };

    processLoginAndRedirect();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1A1A1A] p-6 text-[#1A1A1A] sm:p-8">
      <div className="cmyk-bar absolute left-0 right-0 top-0" />
      <div className="w-full max-w-md rounded-3xl border border-[#D8D6CE] bg-white p-8 shadow-[0_18px_42px_rgba(26,26,26,0.16)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1A1A1A] text-[#00FFFF]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Press & Present</p>
            <h1 className="text-2xl font-black tracking-tight">Connecting your account</h1>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-[#D8D6CE] bg-[#F6F6F2] p-4">
          <Loader2 className="h-5 w-5 animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold text-[#676762]">{status}</p>
        </div>
      </div>
    </main>
  );
}
