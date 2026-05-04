"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Loader2, ArrowRight, Mail, Scan, Cpu,
  Eye, EyeOff, Upload, FileText, CheckCircle,
  AlertCircle, Hash
} from "lucide-react";

const Requirement = ({ label, met }) => (
  <div className={`flex items-center gap-2 font-mono text-[9px] uppercase tracking-tighter transition-colors ${met ? "text-[#EC008C]" : "text-gray-400"}`}>
    <div className={`w-2 h-2 border ${met ? "bg-[#EC008C] border-[#EC008C]" : "border-gray-400"}`} />
    <span className={met ? "font-bold text-[#1A1A1A]" : ""}>{label}</span>
  </div>
);

const DOC_TYPES = [
  { key: "DTI",           label: "DTI Certificate",   desc: "Dept. of Trade & Industry registration", color: "#00FFFF",  textColor: "#1A1A1A", type: "file" },
  { key: "MAYORS_PERMIT", label: "Mayor's Permit",     desc: "Local government business permit",        color: "#EC008C",  textColor: "#ffffff", type: "file" },
  { key: "BIR",           label: "BIR Certificate",    desc: "Bureau of Internal Revenue registration", color: "#FFF200",  textColor: "#1A1A1A", type: "file" },
  { key: "VALID_ID",      label: "Valid ID (Owner)",   desc: "Government-issued ID of business owner",  color: "#1A1A1A",  textColor: "#ffffff", type: "file" },
];

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("CUSTOMER");

  // Step 1
  const [formData, setFormData] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "", businessName: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP State
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);

  // Live Email Validation State
  const [emailStatus, setEmailStatus] = useState(null); // 'checking', 'taken', 'available', null
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
        if (data.exists) {
          setEmailStatus("taken");
        } else {
          setEmailStatus("available");
        }
      } catch (err) {
        setEmailStatus(null);
      } finally {
        setEmailCheckLoading(false);
      }
    }, 600); // 600ms debounce

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

  /* ── STEP 1 SUBMIT (SEND OTP) ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (emailStatus === "taken") return; // Prevent submission if email is taken
    
    setLoading(true);
    setError(null);

    if (!isPasswordValid || !passwordsMatch) {
      setError("Security validation failed. Check password requirements.");
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
      if (!res.ok) throw new Error(data.error || "Failed to send code.");

      setShowOtp(true);
    } catch (err) {
      setError(err.message || "Protocol Error.");
    } finally {
      setLoading(false);
    }
  };

  /* ── VERIFY OTP & REGISTER ── */
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError(null);

    try {
      const userData = { full_name: `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim(), role };
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

      // Automatically sign them in now that they exist
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      if (signInError) throw signInError;

      // Redirect based on role
      if (role === "BUSINESS_OWNER") {
        router.push("/owner/documents");
      } else {
        router.push("/browse");
      }

    } catch (err) {
      setOtpError(err.message || "Invalid code.");
    } finally {
      setOtpLoading(false);
    }
  };

  /* ── OTP SCREEN ── */
  if (showOtp) {
    return (
      <main className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A] font-sans flex items-center justify-center p-8">
        <div className="w-full max-w-lg p-10 border-8 border-[#1A1A1A] bg-white shadow-[20px_20px_0px_0px_rgba(0,255,255,1)]">
          <div className="w-16 h-16 bg-[#1A1A1A] mb-8 flex items-center justify-center">
            <Mail className="text-[#00FFFF] w-8 h-8" />
          </div>
          <div className="w-12 h-1 mb-6 flex gap-1">
            <div className="flex-1 bg-[#00FFFF]" /><div className="flex-1 bg-[#EC008C]" /><div className="flex-1 bg-[#FFF200]" />
          </div>
          <h2 className="text-5xl font-black uppercase tracking-tighter mb-4 leading-none">
            ENTER_CODE
          </h2>
          <p className="font-mono text-[11px] uppercase mb-10 leading-relaxed text-gray-500">
            A 6-digit verification code has been dispatched to:{" "}
            <span className="text-[#1A1A1A] font-bold border-b-2 border-[#EC008C]">{formData.email}</span>
          </p>

          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <input type="text" required maxLength={6} value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-transparent border-b-4 border-[#1A1A1A] py-4 text-center text-4xl font-black tracking-[0.5em] outline-none focus:border-[#EC008C] transition-colors" 
                placeholder="000000" />
            </div>

            {otpError && (
              <div className="p-4 border-2 border-[#EC008C] font-mono text-[10px] text-[#EC008C] uppercase font-bold flex items-center gap-2">
                <AlertCircle size={14} /> {otpError}
              </div>
            )}

            <button type="submit" disabled={otpLoading || otpCode.length !== 6}
              className="w-full bg-[#1A1A1A] text-white py-5 font-black text-lg flex items-center justify-center gap-4 hover:bg-[#00FFFF] hover:text-black transition-all disabled:opacity-50 shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none">
              {otpLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>VERIFY CODE <ArrowRight className="w-6 h-6" /></>
              )}
            </button>
            
            <div className="text-center mt-6">
              <button type="button" onClick={() => setShowOtp(false)} className="font-mono text-[10px] uppercase underline opacity-50 hover:opacity-100">
                Wrong email? Go back
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[#FDFDFD] text-[#1A1A1A] font-sans overflow-hidden">
      <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
      <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
      <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />
      <div className="flex min-h-screen w-full flex-col lg:flex-row border-x-4 border-[#1A1A1A]">

      {/* ── VISUAL SIDEBAR ── */}
      <div className="lg:w-5/12 bg-[#1A1A1A] p-12 flex flex-col justify-between text-[#F4F4F1] relative overflow-hidden border-b-8 lg:border-b-0 lg:border-r-8 border-[#1A1A1A]">
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(#EC008C 1px, transparent 1px)", backgroundSize: "30px 30px" }} />

        <div className="relative z-10">
          <div className="flex items-start gap-4 mb-16">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-[#EC008C] flex items-center justify-center">
                <div className="w-8 h-8 bg-[#EC008C] rotate-45" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-[#00FFFF] mix-blend-screen opacity-50" />
            </div>
            <div className="font-mono text-[10px] tracking-[0.3em] leading-tight opacity-40">
              SYSTEM_TYPE: CREATIVE_CONSOLE<br />ENCRYPTION: AES_256<br />STATUS: ACTIVE
            </div>
          </div>

          <h1 className="text-8xl font-black leading-[0.85] tracking-tighter uppercase italic mb-8">
            CREATE<br /><span className="text-[#EC008C]">_</span>USER
          </h1>

          <div className="flex gap-4 items-center mt-10">
            <div className="h-[2px] w-20 bg-[#00FFFF]" />
            <span className="font-mono text-xs tracking-widest uppercase opacity-60">Identity Management</span>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-4">
          <div className="border border-white/20 p-4 font-mono">
            <Scan size={18} className="text-[#EC008C] mb-2" />
            <p className="text-[9px] uppercase opacity-40">Identity_Protocol</p>
            <p className="text-[11px] font-bold">EMAIL_AUTH_ACTIVE</p>
          </div>
          <div className="border border-white/20 p-4 font-mono">
            <Cpu size={18} className="text-[#00FFFF] mb-2" />
            <p className="text-[9px] uppercase opacity-40">Processing_Core</p>
            <p className="text-[11px] font-bold">STABLE_V2.4</p>
          </div>
        </div>
      </div>

      {/* ── FORM SECTION ── */}
      <div className="flex-1 flex items-start justify-center p-8 md:p-16 relative bg-[#FDFDFD] overflow-y-auto min-h-screen">
        <div className="absolute top-0 right-0 w-32 h-32 border-t-8 border-r-8 border-[#1A1A1A] opacity-5 pointer-events-none" />

        <div className="w-full max-w-md relative z-10 my-8">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(0,255,255,1)] mb-8">
            <span className="flex gap-1">
              <span className="w-2 h-2 bg-[#00FFFF]" />
              <span className="w-2 h-2 bg-[#EC008C]" />
              <span className="w-2 h-2 bg-[#FFF200]" />
            </span>
            Registration // Identity_Setup
          </div>

          {/* ══ CREDENTIALS ══ */}
          <div className="mb-12">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-[#EC008C]" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.4em]">Initialize_Profile</span>
                </div>
                <h2 className="text-5xl md:text-6xl font-black tracking-tighter uppercase italic leading-none">Join_<span className="bg-[#1A1A1A] px-2 py-1 text-white not-italic">Us</span></h2>
              </div>

              {/* Role Selector */}
              <div className="flex gap-2 mb-10">
                <button type="button" onClick={() => setRole("CUSTOMER")}
                  className={`flex-1 py-4 border-2 border-[#1A1A1A] font-mono text-[10px] uppercase font-black transition-all ${role === "CUSTOMER" ? "bg-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(236,0,140,1)]" : "bg-white text-[#1A1A1A] hover:bg-gray-100"}`}>
                  [ Customer ]
                </button>
                <button type="button" onClick={() => setRole("BUSINESS_OWNER")}
                  className={`flex-1 py-4 border-2 border-[#1A1A1A] font-mono text-[10px] uppercase font-black transition-all ${role === "BUSINESS_OWNER" ? "bg-[#1A1A1A] text-white shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]" : "bg-white text-[#1A1A1A] hover:bg-gray-100"}`}>
                  [ Business Owner ]
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {role === "BUSINESS_OWNER" && (
                  <div className="p-6 border-2 border-[#1A1A1A] bg-[#FFF200] shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
                    <label className="block font-mono text-[9px] uppercase font-black mb-2 text-[#1A1A1A]">Business Name</label>
                    <input name="businessName" type="text" required value={formData.businessName} onChange={handleChange}
                      className="w-full bg-transparent border-b-2 border-[#1A1A1A] py-1 text-xl font-black outline-none placeholder:text-black/20"
                      placeholder="Business Name" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-widest mb-1 text-gray-400">First Name</label>
                    <input name="firstName" type="text" required value={formData.firstName} onChange={handleChange}
                      className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-sm font-bold outline-none focus:border-[#EC008C]" placeholder="First" />
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-widest mb-1 text-gray-400">Last Name</label>
                    <input name="lastName" type="text" required value={formData.lastName} onChange={handleChange}
                      className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-sm font-bold outline-none focus:border-[#EC008C]" placeholder="Last" />
                  </div>
                </div>
                <div className="relative">
                  <label className="block font-mono text-[9px] uppercase tracking-widest mb-1 text-gray-400">Email</label>
                  <input name="email" type="email" required value={formData.email} onChange={handleChange}
                    className={`w-full bg-transparent border-b-2 py-2 text-sm font-bold outline-none lowercase transition-colors ${
                      emailStatus === "taken" ? "border-red-500 focus:border-red-500 text-red-600" 
                      : emailStatus === "available" ? "border-green-500 focus:border-green-500" 
                      : "border-gray-200 focus:border-[#EC008C]"
                    }`} 
                    placeholder="your@email.com" />
                  
                  {/* Live validation feedback */}
                  <div className="absolute -bottom-5 left-0 font-mono text-[9px] uppercase font-bold tracking-widest">
                    {emailCheckLoading && <span className="text-gray-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Checking...</span>}
                    {emailStatus === "taken" && !emailCheckLoading && <span className="text-red-500">⚠ EMAIL ALREADY IN USE</span>}
                    {emailStatus === "available" && !emailCheckLoading && <span className="text-green-500">✓ EMAIL AVAILABLE</span>}
                  </div>
                </div>


                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-widest mb-1 text-gray-400">Password</label>
                    <div className="relative">
                      <input name="password" type={showPassword ? "text" : "password"} required value={formData.password} onChange={handleChange}
                        className="w-full bg-transparent border-b-2 border-gray-200 py-2 pr-8 text-sm outline-none focus:border-[#EC008C]" placeholder="••••••••" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#EC008C]">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-widest mb-1 text-gray-400">Confirm</label>
                    <div className="relative">
                      <input name="confirmPassword" type={showConfirmPassword ? "text" : "password"} required value={formData.confirmPassword} onChange={handleChange}
                        className="w-full bg-transparent border-b-2 border-gray-200 py-2 pr-8 text-sm outline-none focus:border-[#00FFFF]" placeholder="••••••••" />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#00FFFF]">
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 border border-[#1A1A1A]/10 bg-[#F9F9F7] grid grid-cols-2 gap-y-2">
                  <Requirement label="08+ CHARS"  met={passwordRequirements.length} />
                  <Requirement label="CAPS_LOCK"  met={passwordRequirements.capital} />
                  <Requirement label="SYMBOL_!@#" met={passwordRequirements.symbol} />
                  <Requirement label="SYNC_MATCH" met={passwordsMatch} />
                </div>

                {error && (
                  <div className="p-4 border-2 border-[#EC008C] font-mono text-[10px] text-[#EC008C] uppercase font-bold flex items-center gap-2">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}

                <button type="submit" disabled={loading || emailStatus === "taken"}
                  className="w-full bg-[#1A1A1A] text-white py-5 font-black text-lg flex items-center justify-center gap-4 hover:bg-[#EC008C] transition-all disabled:opacity-50 shadow-[8px_8px_0px_0px_rgba(236,0,140,1)] active:translate-x-1 active:translate-y-1 active:shadow-none">
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                    <>REGISTER <ArrowRight className="w-6 h-6" /></>
                  )}
                </button>

                <div className="mt-8 pt-8 border-t border-dashed border-[#1A1A1A]/20 flex justify-between items-center">
                  <span className="font-mono text-[10px] opacity-30">© 2026 | Press & Present</span>
                  <Link href="/login" className="text-[10px] font-black uppercase tracking-widest border-2 border-[#1A1A1A] px-4 py-2 hover:bg-[#EC008C] hover:text-white transition-colors">
                    Return to Login
                  </Link>
                </div>
              </form>
        </div>
      </div>
      </div>
    </main>
  );
}