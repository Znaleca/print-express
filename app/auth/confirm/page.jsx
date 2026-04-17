"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ShieldCheck } from "lucide-react";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Processing email verification...");

  useEffect(() => {
    let active = true;
    let redirectTimer;

    const clearSessionAndRedirect = async () => {
      try {
        setStatus("Clearing active session...");
        await supabase.auth.signOut({ scope: "global" });
        if (!active) return;
        setStatus("Verification complete. Redirecting to login...");
      } catch {
        if (!active) return;
        setStatus("Verification complete. Redirecting to login...");
      } finally {
        if (!active) return;
        redirectTimer = setTimeout(() => {
          router.replace("/login");
        }, 900);
      }
    };

    clearSessionAndRedirect();

    return () => {
      active = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-[#F4F4F1] text-[#1A1A1A] flex items-center justify-center p-8">
      <div className="w-full max-w-md border-4 border-[#1A1A1A] bg-white p-8 shadow-[12px_12px_0px_0px_rgba(0,255,255,1)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-[#00FFFF]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-gray-500">Email Verification</p>
            <h1 className="text-2xl font-black uppercase tracking-tighter">Session Reset</h1>
          </div>
        </div>

        <div className="flex items-center gap-3 border border-dashed border-gray-300 bg-[#F9F9F7] p-4">
          <Loader2 className="h-5 w-5 animate-spin text-[#EC008C]" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500">{status}</p>
        </div>
      </div>
    </main>
  );
}