"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";

const Requirement = ({ label, met }) => (
  <div className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "font-medium text-[#008F8F]" : "text-[#999991]"}`}>
    <CheckCircle2 size={13} className={met ? "text-[#00A5A5]" : "text-[#D8D6CE]"} />
    <span>{label}</span>
  </div>
);

export default function ResetPasswordPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const passwordRequirements = {
    length: formData.password.length >= 8,
    capital: /[A-Z]/.test(formData.password),
    symbol: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
  };
  const isPasswordValid = Object.values(passwordRequirements).every(Boolean);
  const passwordsMatch = formData.password === formData.confirmPassword && formData.password !== "";

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isPasswordValid || !passwordsMatch) {
      setError("Please ensure all password requirements are satisfied.");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.password
      });

      if (error) throw error;
      
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2500);
    } catch (err) {
      setError(err.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#1A1A1A] px-4 py-12 font-sans text-[#1A1A1A] sm:px-6 lg:px-8">
      <div className="cmyk-bar absolute left-0 right-0 top-0" />
      <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full border border-white/10" />
      <div className="max-w-md w-full mx-auto space-y-8">

        {/* Card Container */}
        <div className="overflow-hidden rounded-3xl border border-[#D8D6CE] bg-[#F6F6F2] shadow-2xl">
          <div className="cmyk-bar" />

          <div className="p-8 sm:p-10">
            
            {success ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-[#1A1A1A]">Password updated</h2>
                <p className="text-xs text-[#676762]">Your password has been changed successfully.</p>
                <p className="animate-pulse pt-2 text-xs font-semibold text-[#676762]">Redirecting to sign in...</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <Link href="/" className="inline-flex items-center group mb-4" aria-label="Press and Present home">
                    <BrandMark className="h-11 w-[78px] text-2xl transition-transform group-hover:-rotate-2" />
                  </Link>

                  <h1 className="text-3xl font-black uppercase tracking-tight text-[#1A1A1A]">
                    Set new password
                  </h1>
                  <p className="mt-2 text-xs text-[#676762]">
                    Create a strong new password for your account
                  </p>
                </div>

                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                  </div>
                )}

                <form onSubmit={handleUpdatePassword} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                    <input
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#EC008C] focus:ring-2 focus:ring-[#EC008C]/30"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                    <input
                      name="confirmPassword"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#00FFFF] focus:ring-2 focus:ring-[#00FFFF]/30"
                      placeholder="••••••••"
                    />
                  </div>

                  {/* Password Checklist */}
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#D8D6CE] bg-white p-3.5">
                    <Requirement label="At least 8 characters" met={passwordRequirements.length} />
                    <Requirement label="Uppercase letter (A-Z)" met={passwordRequirements.capital} />
                    <Requirement label="Special symbol (!@#$)" met={passwordRequirements.symbol} />
                    <Requirement label="Passwords match" met={passwordsMatch} />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#EC008C] disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <>
                        Update Password
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}

            <div className="mt-8 border-t border-[#D8D6CE] pt-6 text-center">
              <Link href="/login" className="text-xs font-medium text-[#676762] hover:text-[#EC008C]">
                Return to Sign In
              </Link>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
