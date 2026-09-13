"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ArrowRight, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { getRoleHome, isValidEmail, normalizeEmail, validatePassword } from "@/lib/auth";
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
  const [resetSuccess, setResetSuccess] = useState(null);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState(null);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const getReadableError = (err) => {
    const message = err?.message?.toLowerCase() || "";
    if (message === "profile_unauthorized") {
      return "Your account is not authorized for this workspace. Please contact support.";
    }
    if (message.includes("email not confirmed") || message.includes("email not verified") || message.includes("not verified")) {
      return "Your email is not verified yet. Check your inbox or resend the verification email.";
    }
    if (message.includes("banned") || message.includes("disabled") || message.includes("suspended")) {
      return "This account is disabled or unauthorized. Please contact support.";
    }
    if (message.includes("network") || message.includes("fetch") || message.includes("timeout") || message.includes("service unavailable") || message.includes("rate limit")) {
      return "Authentication is temporarily unavailable. Please try again in a moment.";
    }
    if (message.includes("invalid login credentials")) {
      return "Invalid email or password. Please check your credentials.";
    }
    return "We could not sign you in. Please check your details and try again.";
  };

  const resolveLoginError = async (err, email) => {
    const message = err?.message?.toLowerCase() || "";
    if (!message.includes("invalid login credentials")) return getReadableError(err);

    try {
      const statusResponse = await fetch("/api/auth/account-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const statusData = await statusResponse.json().catch(() => ({}));
      // This lookup only enriches Supabase's safe invalid-credentials error.
      // If it is unavailable, do not mislabel a bad login as an auth outage.
      if (statusResponse.status === 503) return "Invalid email or password. Please check your credentials.";
      if (statusData.status === "not_found") return "This email does not exist. Please check your email address or create an account.";
      if (statusData.status === "unverified") return "Your email is not verified yet. Check your inbox or resend the verification email.";
      if (statusData.status === "disabled") return "This account is disabled or unauthorized. Please contact support.";
      if (statusData.status === "active") return "Incorrect password. Please try again or reset your password.";
    } catch {
      // Keep the provider's safe invalid-credentials message if the status
      // lookup is unavailable.
    }
    return "Invalid email or password. Please check your credentials.";
  };

  const handleResendVerification = async () => {
    if (!verificationEmail || resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    setResendMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We could not resend the verification email.");
      setResendMessage({ type: "success", text: data.message || "A new verification email has been sent." });
      setResendCooldown(60);
    } catch (err) {
      setResendMessage({ type: "error", text: err.message || "We could not resend the verification email." });
    } finally {
      setResendLoading(false);
    }
  };

  const handleSendResetOtp = async (e) => {
    e.preventDefault();
    if (loading) return;
    const email = normalizeEmail(formData.email);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    setResetSuccess(null);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "reset" })
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
    if (loading) return;
    const email = normalizeEmail(formData.email);
    const passwordError = validatePassword(newPassword);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setLoading(true);
    setError(null);
    setResetSuccess(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email,
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
      setFormData((previous) => ({ ...previous, password: "" }));
      setResetSuccess("Password updated successfully. Please log in with your new password.");
    } catch (err) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    const email = normalizeEmail(formData.email);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!formData.password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    setError(null);
    setResetSuccess(null);
    setVerificationEmail("");
    setResendMessage(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: formData.password,
      });

      if (signInError) throw signInError;

      if (!data?.user) throw new Error("Authentication service did not return a user.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = profile?.role;
      const route = getRoleHome(role);
      if (profileError || !route) {
        await supabase.auth.signOut();
        throw new Error("PROFILE_UNAUTHORIZED");
      }

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
      router.replace(route);
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("email not confirmed")) {
        setVerificationEmail(email);
      }
      const readableError = await resolveLoginError(err, email);
      if (readableError.toLowerCase().includes("not verified")) setVerificationEmail(email);
      setError(readableError);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
    setResetSuccess(null);
    if (e.target.name === "email") {
      setVerificationEmail("");
      setResendMessage(null);
    }
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
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-3" role="alert" aria-live="assertive">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {resetSuccess && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-700" role="status">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{resetSuccess}</span>
              </div>
            )}

            {verificationEmail && !resetSent && (
              <div className="mb-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900" role="alert">
                <p className="font-medium">Check your inbox to verify this email before signing in.</p>
                {resendMessage && (
                  <p className={resendMessage.type === "error" ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"} role={resendMessage.type === "error" ? "alert" : "status"}>
                    {resendMessage.text}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendLoading || resendCooldown > 0}
                  className="font-black text-[#008F8F] underline hover:text-[#00A5A5] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resendLoading ? "Sending…" : resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend verification email"}
                </button>
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
                      autoComplete="new-password"
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
                        autoComplete="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/30"
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                {!isResetMode && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Password</label>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="current-password"
                        value={formData.password}
                        onChange={handleChange}
                        className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3 pr-10 text-sm outline-none transition-all focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/30"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => { setIsResetMode(true); setError(null); }}
                        className="text-xs font-medium text-[#EC008C] hover:underline"
                      >
                        Forgot password?
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
