"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ArrowRight, ShieldCheck, Mail, Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";

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

      const role = profile?.role || data.user?.user_metadata?.role || "CUSTOMER";

      const routes = {
        ADMIN: "/admin",
        SUPER_ADMIN: "/admin",
        BUSINESS_OWNER: "/owner"
      };

      router.push(routes[role] || "/");
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
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-8">

        {/* Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          
          {/* Top CMYK Signature Bar */}
          <div className="cmyk-bar" />

          <div className="p-8 sm:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <Link href="/" className="inline-flex items-center gap-2.5 group mb-4">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-base shadow-md">
                  <span className="text-[#00FFFF]">P</span>
                  <span className="text-[#EC008C]">-</span>
                  <span className="text-[#FFF200]">P</span>
                </div>
                <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Press <span className="text-[#EC008C]">&</span> Present
                </span>
              </Link>
              
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {isResetMode ? "Reset your password" : "Welcome back"}
              </h1>
              <p className="mt-1 text-xs text-slate-500">
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-2xl font-bold tracking-[0.4em] outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all" 
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all"
                      placeholder="••••••••" 
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={loading || resetOtp.length !== 6 || newPassword.length < 8}
                    className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold text-xs hover:bg-slate-800 transition-all shadow-md disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Reset Password"}
                  </button>
                </form>

                <button 
                  onClick={() => { setResetSent(false); setResetOtp(""); setNewPassword(""); }}
                  className="text-xs text-slate-500 hover:text-slate-900 underline"
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all"
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
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all pr-10"
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
                  className="w-full bg-slate-900 text-white py-3.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#EC008C] transition-all shadow-md disabled:opacity-50"
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
            <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
              Don't have an account yet?{" "}
              <Link href="/signup" className="font-bold text-slate-900 hover:text-[#EC008C] transition-colors">
                Create an account
              </Link>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}