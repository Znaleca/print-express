"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, ArrowRight, Eye, EyeOff, CheckCircle2,
  AlertCircle, ShieldCheck, UserCheck, Store
} from "lucide-react";
import { normalizePhilippinePhone } from "@/lib/phone";
import { getPasswordRequirements, isValidEmail, normalizeEmail, validatePassword } from "@/lib/auth";
import BrandMark from "@/components/BrandMark";

const Requirement = ({ label, met }) => (
  <div className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
    <CheckCircle2 size={13} className={met ? "text-emerald-500" : "text-slate-300"} />
    <span>{label}</span>
  </div>
);

export default function SignUpPage() {
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
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [verificationState, setVerificationState] = useState(null);
  const [existingAccount, setExistingAccount] = useState(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState(null);

  const passwordRequirements = getPasswordRequirements(formData.password);
  const passwordsMatch    = formData.password === formData.confirmPassword && formData.confirmPassword !== "";

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({
      ...p,
      [name]: name === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value,
    }));
    if (name === "email") {
      setExistingAccount(null);
      setResendMessage(null);
    }
    if (name === "phone") setPhoneTouched(true);
  };

  const chooseRole = (nextRole) => {
    setRole(nextRole);
    setOwnerStep(1);
    setError(null);
    setExistingAccount(null);
  };

  const handleResendVerification = async (email) => {
    if (resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    setResendMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email) }),
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

  /* Owner onboarding uses two short steps before email verification. */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    if (role === "BUSINESS_OWNER" && ownerStep === 1) {
      const businessName = formData.businessName.trim();
      const businessBackground = formData.businessBackground.trim();
      const productsSummary = formData.productsSummary.trim();
      if (businessName.length < 2 || businessName.length > 120) {
        setError("Business name must be between 2 and 120 characters.");
        return;
      }
      if (businessBackground.length < 20 || businessBackground.length > 800) {
        setError("Business background must be between 20 and 800 characters.");
        return;
      }
      if (productsSummary.length < 10 || productsSummary.length > 500) {
        setError("Products and services summary must be between 10 and 500 characters.");
        return;
      }
      setError(null);
      setOwnerStep(2);
      return;
    }

    setLoading(true);
    setError(null);

    const email = normalizeEmail(formData.email);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      setLoading(false);
      return;
    }

    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    if (!firstName || !lastName) {
      setError("Enter your first and last name.");
      setLoading(false);
      return;
    }

    const passwordError = validatePassword(formData.password);
    if (passwordError || !passwordsMatch) {
      setError(passwordError || "Passwords do not match.");
      setLoading(false);
      return;
    }

    const normalizedPhone = normalizePhilippinePhone(formData.phone);
    if (!normalizedPhone) {
      setPhoneTouched(true);
      setError("Enter the 10 digits after +63. Example: 9123456789.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: formData.password,
          role,
          firstName,
          lastName,
          phone: normalizedPhone,
          businessName: formData.businessName.trim(),
          businessBackground: formData.businessBackground.trim(),
          productsSummary: formData.productsSummary.trim(),
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (["EMAIL_EXISTS_VERIFIED", "EMAIL_EXISTS_UNVERIFIED"].includes(data.code)) {
          setExistingAccount({ email, unverified: data.code === "EMAIL_EXISTS_UNVERIFIED" });
          setResendMessage(null);
          return;
        }
        throw new Error(data.error || "We could not create your account right now.");
      }

      setVerificationState({ email, role });
      setExistingAccount(null);
      setFormData((previous) => ({ ...previous, password: "", confirmPassword: "" }));
    } catch (err) {
      setError(err.message || "We could not create your account right now.");
    } finally {
      setLoading(false);
    }
  };

  if (verificationState) {
    return (
      <main className="signup-page relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#1A1A1A] px-4 py-12 font-sans text-slate-900 sm:px-6 lg:px-8">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full border border-white/10" />
        <div className="relative z-10 mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-3xl border border-[#D8D6CE] bg-[#F6F6F2] p-7 shadow-2xl sm:p-10">
            <div className="cmyk-bar -mt-8 -mx-8 sm:-mx-10 mb-8" />

            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#00FFFF]/40 bg-[#00FFFF]/15 text-[#00A5A5]">
              <ShieldCheck size={28} />
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Check your inbox</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                We sent a verification link to <strong className="text-slate-900">{verificationState.email}</strong>.
                Verify your email before logging in.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-[#D8D6CE] bg-white p-4 text-xs leading-relaxed text-slate-600">
              <p className="font-bold text-slate-900">Your {verificationState.role === "BUSINESS_OWNER" ? "owner" : "customer"} account is ready.</p>
              <p className="mt-1">Open the link in the email. If it is missing, check spam or request a new one below.</p>
            </div>

            {resendMessage && (
              <div className={`mt-4 rounded-xl border p-3.5 text-xs font-medium ${resendMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`} role={resendMessage.type === "error" ? "alert" : "status"}>
                {resendMessage.text}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleResendVerification(verificationState.email)}
              disabled={resendLoading || resendCooldown > 0}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-[#1A1A1A] bg-white py-3.5 text-xs font-black uppercase tracking-wider text-[#1A1A1A] transition-colors hover:border-[#EC008C] hover:text-[#EC008C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resendLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend verification email"}
            </button>

            <div className="mt-5 flex items-center justify-between gap-4 text-xs">
              <button type="button" onClick={() => { setVerificationState(null); setResendMessage(null); }} className="font-semibold text-slate-500 underline hover:text-slate-900">
                Use a different email
              </button>
              <Link href="/login" className="font-black text-[#EC008C] hover:underline">Go to Login</Link>
            </div>
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
                    autoComplete="given-name"
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
                    autoComplete="family-name"
                    value={formData.lastName} 
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all" 
                    placeholder="Doe" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile number</label>
                <div className={`flex overflow-hidden rounded-xl border bg-slate-50 transition-colors focus-within:ring-2 ${
                  phoneTouched && !normalizePhilippinePhone(formData.phone)
                    ? "border-rose-500 focus-within:border-rose-500 focus-within:ring-rose-200"
                    : "border-slate-200 focus-within:border-slate-400 focus-within:ring-[#00FFFF]/30"
                }`}>
                  <span className="flex items-center border-r border-slate-200 bg-slate-100 px-4 text-sm font-bold text-slate-700" aria-hidden="true">
                    +63
                  </span>
                  <input
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    pattern="[0-9]*"
                    required
                    value={formData.phone}
                    onBlur={() => setPhoneTouched(true)}
                    onChange={handleChange}
                    placeholder="9123456789"
                    aria-label="Mobile number without country code"
                    aria-invalid={phoneTouched && !normalizePhilippinePhone(formData.phone)}
                    aria-describedby="signup-phone-help signup-phone-error"
                    className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none"
                  />
                </div>
                <p id="signup-phone-help" className="mt-1 text-[11px] text-slate-500">Enter 10 digits after +63. We save the complete number for SMS order updates.</p>
                {phoneTouched && !normalizePhilippinePhone(formData.phone) && (
                  <p id="signup-phone-error" role="alert" className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-700">
                    <AlertCircle size={14} aria-hidden="true" />
                    {formData.phone.length === 0
                      ? "Enter your 10-digit mobile number."
                      : formData.phone.startsWith("9")
                        ? "Enter all 10 digits of your mobile number."
                        : "Your number must start with 9. Example: 9123456789."}
                  </p>
                )}
              </div>

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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-[#00FFFF]"
                    placeholder="name@example.com" 
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">We&apos;ll verify this address before creating the account.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <input 
                      name="password" 
                      type={showPassword ? "text" : "password"} 
                      required 
                      autoComplete="new-password"
                      value={formData.password} 
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#EC008C] focus:border-slate-400 transition-all pr-9" 
                      placeholder="Enter password" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
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
                      autoComplete="new-password"
                      value={formData.confirmPassword} 
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00FFFF] focus:border-slate-400 transition-all pr-9" 
                      placeholder="Enter password" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                      aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
                      aria-pressed={showConfirmPassword}
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

              {existingAccount && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900" role="alert" aria-live="assertive">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="font-medium">
                      {existingAccount.unverified
                        ? "This email is already registered but not verified. Check your inbox or resend the verification email."
                        : "An account with this email already exists. Please log in instead or reset your password."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pl-6 font-bold">
                    <Link href="/login" className="text-[#C40075] underline hover:text-[#EC008C]">Go to Login</Link>
                    {existingAccount.unverified && (
                      <button
                        type="button"
                        onClick={() => handleResendVerification(existingAccount.email)}
                        disabled={resendLoading || resendCooldown > 0}
                        className="text-left text-[#008F8F] underline hover:text-[#00A5A5] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resendLoading ? "Sending…" : resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend verification email"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {error && !existingAccount && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2" role="alert" aria-live="assertive">
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
                disabled={loading}
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
