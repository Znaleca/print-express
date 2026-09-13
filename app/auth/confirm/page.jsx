"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getRoleHome } from "@/lib/auth";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Preparing email verification…");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    let redirectTimer;

    const getSessionWithRetry = async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) return data.session;
        await wait(250);
      }
      return null;
    };

    const getProfileWithRetry = async (userId) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        if (!error && profile) return profile;
        await wait(250);
      }
      return null;
    };

    const processVerification = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");

        setStatus("Verifying your email…");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: url.searchParams.get("type") || "signup",
            token_hash: tokenHash,
          });
          if (error) throw error;
        }

        const session = await getSessionWithRetry();
        if (!session?.user) throw new Error("Verification session was not found.");

        const profile = await getProfileWithRetry(session.user.id);
        const destination = getRoleHome(profile?.role);
        if (!destination) throw new Error("The verified account is not authorized.");

        if (!active) return;
        setStatus("Email verified. Redirecting to your workspace…");
        redirectTimer = window.setTimeout(() => router.replace(destination), 900);
      } catch {
        if (!active) return;
        setIsError(true);
        setStatus("We could not complete email verification. The link may be expired or already used.");
        redirectTimer = window.setTimeout(() => router.replace("/login"), 3500);
      }
    };

    processVerification();
    return () => {
      active = false;
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1A1A1A] p-6 text-[#1A1A1A] sm:p-8">
      <div className="cmyk-bar absolute left-0 right-0 top-0" />
      <div className="w-full max-w-md rounded-3xl border border-[#D8D6CE] bg-white p-8 shadow-[0_18px_42px_rgba(26,26,26,0.16)]">
        <div className="mb-6 flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isError ? "bg-rose-100 text-rose-600" : "bg-[#1A1A1A] text-[#00FFFF]"}`}>
            {isError ? <AlertCircle className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#EC008C]">Press &amp; Present</p>
            <h1 className="text-2xl font-black tracking-tight">{isError ? "Verification issue" : "Verify your account"}</h1>
          </div>
        </div>

        <div className={`flex items-start gap-3 rounded-2xl border p-4 ${isError ? "border-rose-200 bg-rose-50 text-rose-700" : "border-[#D8D6CE] bg-[#F6F6F2] text-[#676762]"}`} role={isError ? "alert" : "status"} aria-live="polite">
          {!isError && <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[#EC008C]" />}
          <p className="text-xs font-semibold leading-relaxed">{status}</p>
        </div>

        {isError && (
          <p className="mt-5 text-center text-xs text-[#676762]">
            Returning to <Link href="/login" className="font-black text-[#EC008C] underline">Login</Link> shortly.
          </p>
        )}
      </div>
    </main>
  );
}
