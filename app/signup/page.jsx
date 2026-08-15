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
import BrandMark from "@/components/BrandMark";

const Requirement = ({ label, met }) => (
  <div className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
    <CheckCircle2 size={13} className={met ? "text-emerald-500" : "text-slate-300"} />
    <span>{label}</span>
  </div>
);

export default function SignUpPage() {
  const router = useRouter();
  const [role, setRole] = useState("CUSTOMER");
  const [ownerStep, setOwnerStep] = useState(1);

  // Step 1 Form Data
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    businessName: "",
    businessBackground: "",
    productsSummary: "",
  });
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

  const chooseRole = (nextRole) => {
    setRole(nextRole);
    setOwnerStep(1);
    setError(null);
    setEmailStatus(null);
  };

  /* Owner onboarding uses two short steps before email verification. */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (role === "BUSINESS_OWNER" && ownerStep === 1) {
      setError(null);
      setOwnerStep(2);
      return;
    }

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
      if (role === "BUSINESS_OWNER") {
        userData.business_name = formData.businessName.trim();
        userData.business_background = formData.businessBackground.trim();
        userData.products_summary = formData.productsSummary.trim();
      }

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
      <main className="signup-page relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#1A1A1A] px-4 py-12 font-sans text-slate-900 sm:px-6 lg:px-8">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full border border-white/10" />
        <div className="relative z-10 mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-3xl border border-[#D8D6CE] bg-[#F6F6F2] p-7 shadow-2xl sm:p-10">
            <div className="cmyk-bar -mt-8 -mx-8 sm:-mx-10 mb-8" />
            
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#00FFFF]/40 bg-[#00FFFF]/15 text-[#00A5A5]">
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
                  className="w-full rounded-2xl border border-[#D8D6CE] bg-white px-4 py-3.5 text-center text-3xl font-black tracking-[0.4em] outline-none transition-all focus:border-[#EC008C] focus:ring-2 focus:ring-[#EC008C]/20"
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
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#00FFFF] py-3.5 text-xs font-black uppercase tracking-wider text-[#1A1A1A] shadow-md transition-all hover:bg-[#FFF200] disabled:opacity-50"
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
    <main className="signup-page relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#1A1A1A] px-4 py-12 font-sans text-slate-900 sm:px-6 lg:px-8">
      <div className="cmyk-bar absolute left-0 right-0 top-0" />
      <div className="pointer-events-none absolute -left-24 bottom-10 h-80 w-80 rounded-full border border-[#EC008C]/20" />
      <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full border border-white/10" />
      <div className="relative z-10 mx-auto w-full max-w-xl space-y-8">

        {/* Form Container */}
        <div className="overflow-hidden rounded-3xl border border-[#D8D6CE] bg-[#F6F6F2] shadow-2xl">
          <div className="cmyk-bar" />

          <div className="p-8 sm:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <Link href="/" className="inline-flex items-center group mb-4" aria-label="Press and Present home">
                <BrandMark className="h-11 w-[78px] text-2xl transition-transform group-hover:-rotate-2" />
              </Link>
              
              <h1 className="text-3xl font-black uppercase tracking-tight text-[#1A1A1A]">
                {role === "BUSINESS_OWNER"
                  ? ownerStep === 1 ? "Tell us about your shop" : "Create your owner account"
                  : "Create your account"}
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-[#676762]">
                {role === "BUSINESS_OWNER"
                  ? ownerStep === 1
                    ? "Start with the details customers need to understand what you offer."
                    : "Add your contact details and secure login to finish registration."
                  : "Join Press & Present as a customer or register your local print shop"}
              </p>
            </div>

            {/* Account Role Selector */}
            <div className="mb-8 grid grid-cols-2 gap-3 rounded-2xl bg-[#ECECE8] p-1.5">
              <button 
                type="button" 
                onClick={() => chooseRole("CUSTOMER")}
                className={`py-3 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  role === "CUSTOMER"
                    ? "bg-[#1A1A1A] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserCheck size={16} className={role === "CUSTOMER" ? "text-[#EC008C]" : "text-slate-400"} />
                Customer Account
              </button>

              <button 
                type="button" 
                onClick={() => chooseRole("BUSINESS_OWNER")}
                className={`py-3 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  role === "BUSINESS_OWNER"
                    ? "bg-[#1A1A1A] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Store size={16} className={role === "BUSINESS_OWNER" ? "text-[#00E5FF]" : "text-slate-400"} />
                Print Shop Owner
              </button>
            </div>

            {role === "BUSINESS_OWNER" && (
              <div className="mb-7 flex items-center gap-3" aria-label={`Owner signup step ${ownerStep} of 2`}>
                {["Shop profile", "Your details"].map((label, index) => {
                  const step = index + 1;
                  const active = ownerStep === step;
                  const complete = ownerStep > step;
                  return (
                    <div key={label} className="flex min-w-0 flex-1 items-center gap-2">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                        active || complete ? "bg-[#1A1A1A] text-[#00FFFF]" : "bg-[#E3E3DE] text-slate-500"
                      }`}>
                        {complete ? <CheckCircle2 size={14} /> : step}
                      </div>
                      <span className={`truncate text-[11px] font-bold ${active ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
                      {step === 1 && <div className={`h-px flex-1 ${ownerStep === 2 ? "bg-[#00C7C7]" : "bg-[#D8D6CE]"}`} />}
                    </div>
                  );
                })}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {role === "BUSINESS_OWNER" && ownerStep === 1 && (
                <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-800">Tell customers about your shop</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                      This information appears on your public shop profile after verification. Keep it clear and customer-friendly.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                    Print Shop / Business Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      name="businessName"
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                      value={formData.businessName}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-[#FFF200]"
                      placeholder="e.g. Apex Print Studio"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Business background <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      name="businessBackground"
                      required
                      minLength={20}
                      maxLength={800}
                      rows={3}
                      value={formData.businessBackground}
                      onChange={handleChange}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-[#FFF200]"
                      placeholder="Briefly tell customers when you started, what you specialize in, and what makes your shop reliable."
                    />
                    <p className="mt-1 text-[11px] text-slate-500">20–800 characters · Avoid private contact details or payment information.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Products &amp; services offered <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      name="productsSummary"
                      required
                      minLength={10}
                      maxLength={500}
                      rows={2}
                      value={formData.productsSummary}
                      onChange={handleChange}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-[#FFF200]"
                      placeholder="e.g. Business cards, flyers, posters, tarpaulins, stickers, photo printing, and rush orders."
                    />
                    <p className="mt-1 text-[11px] text-slate-500">10–500 characters · You can add detailed items and prices later in your catalog.</p>
                  </div>

                  <p className="text-[11px] text-slate-500">After email verification, upload DTI, Mayor&apos;s Permit, BIR, and valid ID documents. Admin approval is required before seller tools unlock.</p>
                </div>
              )}

              {(role === "CUSTOMER" || ownerStep === 2) && (
                <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                </>
              )}

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              {role === "BUSINESS_OWNER" && ownerStep === 2 && (
                <button
                  type="button"
                  onClick={() => { setOwnerStep(1); setError(null); }}
                  className="w-full rounded-full border border-[#D8D6CE] bg-white px-6 py-3.5 text-xs font-black uppercase tracking-wider text-slate-700 transition-colors hover:border-[#EC008C] hover:text-[#EC008C]"
                >
                  Back to shop profile
                </button>
              )}

              <button
                type="submit"
                disabled={loading || (ownerStep === 2 && emailStatus === "taken")}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#00FFFF] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#1A1A1A] shadow-md transition-all hover:bg-[#FFF200] disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    {role === "BUSINESS_OWNER" && ownerStep === 1 ? "Continue to your details" : "Create Account"}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="mt-6 border-t border-[#D8D6CE] pt-6 text-center text-xs text-[#676762]">
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
