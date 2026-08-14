"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

const Requirement = ({ label, met }) => (
  <div className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
    <CheckCircle2 size={13} className={met ? "text-emerald-500" : "text-slate-300"} />
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
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-8">

        {/* Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="cmyk-bar" />

          <div className="p-8 sm:p-10">
            
            {success ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">Password Updated</h2>
                <p className="text-xs text-slate-500">Your password has been changed successfully.</p>
                <p className="text-xs font-semibold text-slate-700 animate-pulse pt-2">Redirecting to sign in...</p>
              </div>
            ) : (
              <>
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
                    Set new password
                  </h1>
                  <p className="mt-1 text-xs text-slate-500">
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#EC008C] focus:border-slate-400 transition-all"
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
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all"
                      placeholder="••••••••"
                    />
                  </div>

                  {/* Password Checklist */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2">
                    <Requirement label="At least 8 characters" met={passwordRequirements.length} />
                    <Requirement label="Uppercase letter (A-Z)" met={passwordRequirements.capital} />
                    <Requirement label="Special symbol (!@#$)" met={passwordRequirements.symbol} />
                    <Requirement label="Passwords match" met={passwordsMatch} />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-slate-900 text-white py-3.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#EC008C] transition-all shadow-md disabled:opacity-50"
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

            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <Link href="/login" className="text-xs text-slate-500 hover:text-slate-900 font-medium">
                Return to Sign In
              </Link>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
