"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ArrowRight, ShieldCheck, Mail, Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import BrandMark from "@/components/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const getReadableError = (err) => {
    const message = err?.message?.toLowerCase() || "";
    if (message.includes("invalid login credentials")) {
      return "Invalid email or password. Please check your credentials.";
    }
    return err.message || "An unexpected error occurred. Please try again.";
  };

  const handleSendResetOtp = async (e) => {
    e.preventDefault();
    if (!formData.email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email.trim().toLowerCase(), type: "reset" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send recovery code.");
      setResetSent(true);
    } catch (err) {
      setError(err.message || "Failed to send recovery code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: formData.email.trim().toLowerCase(), 
          code: resetOtp, 
          type: "reset", 
          password: newPassword 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Password reset failed.");
      
      setIsResetMode(false);
      setResetSent(false);
      setResetOtp("");
      setNewPassword("");
      setFormData({ ...formData, password: "" });
      alert("Password updated successfully. Please log in with your new password.");
    } catch (err) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      if (signInError) throw signInError;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      const role = profile?.role || "CUSTOMER";

      const routes = {
        ADMIN: "/admin",
        BUSINESS_OWNER: "/owner"
      };

      if (role === "BUSINESS_OWNER" && data.session?.access_token) {
        await fetch("/api/auth/owner-activity", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        }).catch((activityError) => {
          console.warn("Owner activity could not be recorded:", activityError);
        });
      }

      // Login is a transition into the app, so don't leave the login screen in
      // browser history when sending portal users to their workspace.
      router.replace(routes[role] || "/");
    } catch (err) {
      setError(getReadableError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <main className="login-page relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#1A1A1A] px-4 py-12 font-sans text-slate-900 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute bottom-12 left-8 hidden h-20 w-20 rotate-12 border border-[#00FFFF]/30 sm:block" />
      <div className="cmyk-bar absolute left-0 right-0 top-0" />
      <div className="relative z-10 mx-auto w-full max-w-md space-y-8">

        {/* Card Container */}
        <div className="overflow-hidden rounded-3xl border border-[#D8D6CE] bg-[#F6F6F2] shadow-2xl">
          
          {/* Top CMYK Signature Bar */}
          <div className="cmyk-bar" />

          <div className="p-7 sm:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <Link href="/" className="inline-flex items-center group mb-4" aria-label="Press and Present home">
                <BrandMark className="h-11 w-[78px] text-2xl transition-transform group-hover:-rotate-2" />
              </Link>
              
              <h1 className="text-3xl font-black uppercase tracking-tight text-[#1A1A1A]">
                {isResetMode ? "Reset your password" : "Welcome back"}
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-[#676762]">
                {isResetMode ? "Enter your email to receive a password reset code" : "Sign in to access your print orders and messages"}
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-3">
                <span className="font-bold shrink-0">Error:</span>
                <span>{error}</span>
              </div>
            )}

            {/* Reset Sent Form View */}
            {resetSent ? (
              <div className="space-y-6 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Code Sent</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    A 6-digit recovery code was sent to <strong className="text-slate-900">{formData.email}</strong>.
                  </p>
                </div>

                <form onSubmit={handleVerifyReset} className="space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">6-Digit Code</label>
                    <input 
                      type="text" 
                      required 
                      maxLength={6} 
                      value={resetOtp} 
                      onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                      className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3 text-center text-2xl font-black tracking-[0.4em] outline-none transition-all focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/30"
                      placeholder="000000" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                    <input 
                      type="password" 
                      required 
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/30"
                      placeholder="••••••••" 
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={loading || resetOtp.length !== 6 || newPassword.length < 8}
                    className="flex w-full items-center justify-center rounded-full bg-[#1A1A1A] py-3 font-black text-xs text-white shadow-md transition-all hover:bg-[#EC008C] disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Reset Password"}
                  </button>
                </form>

                <button 
                  onClick={() => { setResetSent(false); setResetOtp(""); setNewPassword(""); }}
                  className="text-xs font-semibold text-[#676762] underline hover:text-[#EC008C]"
                >
                  Cancel and start over
                </button>
              </div>
            ) : (
              <form onSubmit={isResetMode ? handleSendResetOtp : handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email address</label>
                  <div className="relative">
                    <input
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/30"
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                {!isResetMode && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-semibold text-slate-700">Password</label>
                      <button
                        type="button"
                        onClick={() => { setIsResetMode(true); setError(null); }}
                        className="text-xs font-medium text-[#EC008C] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={formData.password}
                        onChange={handleChange}
                        className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3 pr-10 text-sm outline-none transition-all focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/30"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#00FFFF] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#1A1A1A] shadow-md transition-all hover:bg-[#FFF200] disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                      {isResetMode ? "Send Recovery Code" : "Sign In"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {isResetMode && (
                  <div className="text-center pt-2">
                    <button 
                      type="button" 
                      onClick={() => { setIsResetMode(false); setError(null); }} 
                      className="text-xs text-slate-500 hover:text-slate-900 font-medium"
                    >
                      Return to Sign In
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* Footer Prompt */}
            <div className="mt-8 border-t border-[#D8D6CE] pt-6 text-center text-xs text-[#676762]">
              Don't have an account yet?{" "}
                <Link href="/signup" className="font-black text-[#1A1A1A] transition-colors hover:text-[#EC008C]">
                Create an account
              </Link>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
