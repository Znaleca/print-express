"use client";

import { useState } from "react";
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
  { key: "TIN_NUMBER",    label: "TIN Number",         desc: "Tax Identification Number",               color: "#EC008C",  textColor: "#ffffff", type: "text" },
];

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("CUSTOMER");

  // Step 1
  const [formData, setFormData] = useState({ fullName: "", email: "", password: "", confirmPassword: "", businessName: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 2
  const [createdBusinessId, setCreatedBusinessId] = useState(null);
  const [createdUserId, setCreatedUserId] = useState(null);
  const [docFiles, setDocFiles] = useState({});
  const [tinNumber, setTinNumber] = useState("");
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [docError, setDocError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});

  const passwordRequirements = {
    length:  formData.password.length >= 8,
    capital: /[A-Z]/.test(formData.password),
    symbol:  /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
  };
  const isPasswordValid   = Object.values(passwordRequirements).every(Boolean);
  const passwordsMatch    = formData.password === formData.confirmPassword && formData.confirmPassword !== "";

  const handleChange = (e) => setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));

  /* ── STEP 1 SUBMIT ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isPasswordValid || !passwordsMatch) {
      setError("Security validation failed. Check password requirements.");
      setLoading(false);
      return;
    }

    try {
      const signUpData = {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_URL || window.location.origin}/auth/confirm`,
          data: { full_name: formData.fullName, role },
        },
      };
      if (role === "BUSINESS_OWNER") signUpData.options.data.business_name = formData.businessName;

      const { data, error: signUpError } = await supabase.auth.signUp(signUpData);
      if (signUpError) throw signUpError;

      if (role === "BUSINESS_OWNER" && data?.user?.id) {
        // If no session exists (e.g. Email confirmation is required), skip to success screen
        if (!data.session) {
           setSuccess(true);
           return;
        }

        // Business row is auto-created via backend trigger. Wait briefly and select it.
        let biz = null;
        for (let i = 0; i < 4; i++) {
          const { data: bData } = await supabase
            .from("businesses")
            .select("id")
            .eq("owner_id", data.user.id)
            .single();
          if (bData) { biz = bData; break; }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (!biz) {
          throw new Error("Could not retrieve created business profile. Proceed to login to complete verification.");
        }

        setCreatedBusinessId(biz.id);
        setCreatedUserId(data.user.id);
        setStep(2);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message || "Protocol Error.");
    } finally {
      setLoading(false);
    }
  };

  /* ── SUCCESS SCREEN ── */
  if (success) {
    return (
      <main className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A] font-sans flex items-center justify-center p-8">
        <div className="w-full max-w-lg p-10 border-8 border-[#1A1A1A] bg-white shadow-[20px_20px_0px_0px_rgba(0,255,255,1)]">
          <div className="w-16 h-16 bg-[#1A1A1A] mb-8 flex items-center justify-center">
            {role === "BUSINESS_OWNER" ? <CheckCircle className="text-[#00FFFF] w-8 h-8" /> : <Mail className="text-[#FFF200] w-8 h-8" />}
          </div>
          <div className="w-12 h-1 mb-6 flex gap-1">
            <div className="flex-1 bg-[#00FFFF]" /><div className="flex-1 bg-[#EC008C]" /><div className="flex-1 bg-[#FFF200]" />
          </div>
          <h2 className="text-5xl font-black uppercase tracking-tighter mb-4 leading-none">
            VERIFY_EMAIL
          </h2>
          <p className="font-mono text-[11px] uppercase mb-10 leading-relaxed text-gray-500">
            {role === "BUSINESS_OWNER"
              ? `Your account has been created for [${formData.businessName}]! Please verify your email via the link sent to your inbox. Once verified, log in to complete your business document verification.`
              : <>A secure link has been dispatched to:{" "}<span className="text-[#1A1A1A] font-bold border-b-2 border-[#EC008C]">{formData.email}</span></>}
          </p>
          <Link href="/login" className="flex items-center justify-center w-full py-5 bg-[#1A1A1A] text-white font-black uppercase tracking-widest hover:bg-[#EC008C] transition-all shadow-[6px_6px_0px_0px_rgba(236,0,140,1)] active:shadow-none">
            Go to Login <ArrowRight size={18} className="ml-3" />
          </Link>
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
                    <label className="block font-mono text-[9px] uppercase tracking-widest mb-1 text-gray-400">
                      {role === "BUSINESS_OWNER" ? "Owner Nickname" : "Nickname"}
                    </label>
                    <input name="fullName" type="text" required value={formData.fullName} onChange={handleChange}
                      className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-sm font-bold outline-none focus:border-[#EC008C]" placeholder="Name" />
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-widest mb-1 text-gray-400">Email</label>
                    <input name="email" type="email" required value={formData.email} onChange={handleChange}
                      className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-sm font-bold outline-none focus:border-[#EC008C] lowercase" placeholder="EMAIL" />
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

                <button type="submit" disabled={loading}
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