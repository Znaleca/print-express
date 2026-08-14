"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Loader2, ArrowRight, Mail, Eye, EyeOff, CheckCircle2,
  AlertCircle, ShieldCheck, UserCheck, Store
} from "lucide-react";
import { normalizePhilippinePhone } from "@/lib/phone";

const Requirement = ({ label, met }) => (
  <div className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
    <CheckCircle2 size={13} className={met ? "text-emerald-500" : "text-slate-300"} />
    <span>{label}</span>
  </div>
);

export default function SignUpPage() {
  const router = useRouter();
  const [role, setRole] = useState("CUSTOMER");

  // Step 1 Form Data
  const [formData, setFormData] = useState({ firstName: "", lastName: "", phone: "", email: "", password: "", confirmPassword: "", businessName: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP State
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);

  // Live Email Validation State
  const [emailStatus, setEmailStatus] = useState(null); // 'taken', 'available', 'unknown', null
  const [emailCheckLoading, setEmailCheckLoading] = useState(false);

  useEffect(() => {
    const email = formData.email.trim();
    if (!email || !email.includes("@") || !email.includes(".")) {
      setEmailStatus(null);
      return;
    }

    setEmailCheckLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (!res.ok || data.checkUnavailable) {
          setEmailStatus("unknown");
        } else if (data.exists) {
          setEmailStatus("taken");
        } else {
          setEmailStatus("available");
        }
      } catch (err) {
        setEmailStatus("unknown");
      } finally {
        setEmailCheckLoading(false);
      }
    }, 600);

    return () => clearTimeout(timeoutId);
  }, [formData.email]);

  const passwordRequirements = {
    length:  formData.password.length >= 8,
    capital: /[A-Z]/.test(formData.password),
    symbol:  /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
  };
  const isPasswordValid   = Object.values(passwordRequirements).every(Boolean);
  const passwordsMatch    = formData.password === formData.confirmPassword && formData.confirmPassword !== "";

  const handleChange = (e) => setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));

  /* STEP 1 SUBMIT (SEND OTP) */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (emailStatus === "taken") return;
    
    setLoading(true);
    setError(null);

    if (!isPasswordValid || !passwordsMatch) {
      setError("Please ensure all password requirements are satisfied.");
      setLoading(false);
      return;
    }

    const normalizedPhone = normalizePhilippinePhone(formData.phone);
    if (!normalizedPhone) {
      setError("Enter a valid Philippine mobile number. Example: 09171234567 or +639171234567.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          type: "signup",
          fullName: `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim()
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send verification code.");

      setShowOtp(true);
    } catch (err) {
      setError(err.message || "Failed to initiate verification.");
    } finally {
      setLoading(false);
    }
  };

  /* VERIFY OTP & REGISTER */
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError(null);

    try {
      const normalizedPhone = normalizePhilippinePhone(formData.phone);
      if (!normalizedPhone) throw new Error("Enter a valid Philippine mobile number.");

      const userData = {
        full_name: `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim(),
        phone: normalizedPhone,
        role
      };
      if (role === "BUSINESS_OWNER") userData.business_name = formData.businessName;

      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          code: otpCode,
          type: "signup",
          password: formData.password,
          userData
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");

      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      if (signInError) throw signInError;

      if (role === "BUSINESS_OWNER") {
        router.push("/owner/documents");
      } else {
        router.push("/browse");
      }

    } catch (err) {
      setOtpError(err.message || "Invalid code. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  /* OTP SCREEN */
  if (showOtp) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full mx-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden p-8 sm:p-10">
            <div className="cmyk-bar -mt-8 -mx-8 sm:-mx-10 mb-8" />
            
            <div className="w-12 h-12 rounded-2xl bg-cyan-50 text-[#00E5FF] border border-cyan-200 flex items-center justify-center mx-auto mb-6">
              <Mail size={24} />
            </div>

            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">Verify your email</h2>
              <p className="mt-1 text-xs text-slate-500">
                A 6-digit verification code was sent to:{" "}
                <strong className="text-slate-900">{formData.email}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <input 
                  type="text" 
                  required 
                  maxLength={6} 
                  value={otpCode} 
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-3xl font-bold tracking-[0.4em] outline-none focus:ring-2 focus:ring-[#EC008C] focus:border-slate-400 transition-all" 
                  placeholder="000000" 
                />
              </div>

              {otpError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={16} /> {otpError}
                </div>
              )}

              <button 
                type="submit" 
                disabled={otpLoading || otpCode.length !== 6}
                className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-[#EC008C] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {otpLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>Verify Code <ArrowRight size={16} /></>
                )}
              </button>
              
              <div className="text-center pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowOtp(false)} 
                  className="text-xs text-slate-500 hover:text-slate-900 font-medium"
                >
                  Incorrect email? Go back
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl w-full mx-auto space-y-8">

        {/* Form Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
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
                Create your account
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Join Press & Present as a customer or register your local print shop
              </p>
            </div>

            {/* Account Role Selector */}
            <div className="grid grid-cols-2 gap-3 mb-8 p-1.5 bg-slate-100 rounded-xl">
              <button 
                type="button" 
                onClick={() => setRole("CUSTOMER")}
                className={`py-3 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  role === "CUSTOMER" 
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserCheck size={16} className={role === "CUSTOMER" ? "text-[#EC008C]" : "text-slate-400"} />
                Customer Account
              </button>

              <button 
                type="button" 
                onClick={() => setRole("BUSINESS_OWNER")}
                className={`py-3 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  role === "BUSINESS_OWNER" 
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Store size={16} className={role === "BUSINESS_OWNER" ? "text-[#00E5FF]" : "text-slate-400"} />
                Print Shop Owner
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {role === "BUSINESS_OWNER" && (
                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Print Shop / Business Name <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    name="businessName" 
                    type="text" 
                    required 
                    value={formData.businessName} 
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-[#FFF200] focus:border-slate-400 transition-all"
                    placeholder="e.g. Apex Print Studio" 
                  />
                  <p className="mt-1 text-[11px] text-slate-500">After email verification, upload DTI, Mayor's Permit, BIR, and valid ID documents. Admin approval is required before seller tools unlock.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                  <input 
                    name="firstName" 
                    type="text" 
                    required 
                    value={formData.firstName} 
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all" 
                    placeholder="John" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                  <input 
                    name="lastName" 
                    type="text" 
                    required 
                    value={formData.lastName} 
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all" 
                    placeholder="Doe" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile number</label>
                <input
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all"
                  placeholder="0917 123 4567"
                />
                <p className="mt-1 text-[11px] text-slate-500">Saved as +63 format for order SMS updates.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email address</label>
                <div className="relative">
                  <input 
                    name="email" 
                    type="email" 
                    required 
                    value={formData.email} 
                    onChange={handleChange}
                    className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm outline-none transition-all ${
                      emailStatus === "taken" 
                        ? "border-rose-400 focus:ring-2 focus:ring-rose-400" 
                        : emailStatus === "available" 
                        ? "border-emerald-400 focus:ring-2 focus:ring-emerald-400" 
                        : "border-slate-200 focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400"
                    }`} 
                    placeholder="name@example.com" 
                  />
                </div>
                
                {/* Live validation feedback */}
                <div className="mt-1 text-xs">
                  {emailCheckLoading && <span className="text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Checking availability...</span>}
                  {emailStatus === "taken" && !emailCheckLoading && <span className="text-rose-600 font-medium">Email is already registered. Please sign in instead.</span>}
                  {emailStatus === "available" && !emailCheckLoading && <span className="text-emerald-600 font-medium">Email is available</span>}
                  {emailStatus === "unknown" && !emailCheckLoading && <span className="text-slate-500 font-medium">Could not check availability now. You can still continue; signup will verify the email before creating the account.</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <input 
                      name="password" 
                      type={showPassword ? "text" : "password"} 
                      required 
                      value={formData.password} 
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#EC008C] focus:border-slate-400 transition-all pr-9" 
                      placeholder="Enter password" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
                  <div className="relative">
                    <input 
                      name="confirmPassword" 
                      type={showConfirmPassword ? "text" : "password"} 
                      required 
                      value={formData.confirmPassword} 
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all pr-9" 
                      placeholder="Enter password" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Requirements Checklist */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2">
                <Requirement label="At least 8 characters" met={passwordRequirements.length} />
                <Requirement label="Uppercase letter (A-Z)" met={passwordRequirements.capital} />
                <Requirement label="Special symbol (!@#$)" met={passwordRequirements.symbol} />
                <Requirement label="Passwords match" met={passwordsMatch} />
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading || emailStatus === "taken"}
                className="w-full bg-slate-900 text-white py-3.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#EC008C] transition-all shadow-md disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="mt-6 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
                Already have an account?{" "}
                <Link href="/login" className="font-bold text-slate-900 hover:text-[#EC008C] transition-colors">
                  Sign in
                </Link>
              </div>
            </form>
          </div>
        </div>

      </div>
    </main>
  );
}
