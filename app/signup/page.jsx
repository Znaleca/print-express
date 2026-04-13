"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Store, User, Loader2, ArrowRight, Mail, Check, X, Briefcase } from "lucide-react";

// Sub-component for individual requirement lines
const Requirement = ({ label, met }) => (
  <div className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider transition-colors ${met ? "text-green-600" : "text-gray-400"}`}>
    <span>{met ? "[✓]" : "[ ]"}</span>
    <span className={met ? "opacity-60" : ""}>{label}</span>
  </div>
);

export default function SignUpPage() {
  const router = useRouter();
  const [role, setRole] = useState("CUSTOMER");
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    businessName: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const passwordRequirements = {
    length: formData.password.length >= 8,
    capital: /[A-Z]/.test(formData.password),
    symbol: /[!@#$%^&*(),.?":{}|<> ]/.test(formData.password),
  };

  const isPasswordValid = Object.values(passwordRequirements).every(Boolean);
  const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword !== "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isPasswordValid) {
      setError("Password does not meet security requirements.");
      setLoading(false);
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const signUpData = {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            full_name: formData.fullName,
            role: role,
          },
        },
      };

      if (role === "BUSINESS_OWNER") {
        signUpData.options.data.business_name = formData.businessName;
      }

      const { data, error: signUpError } = await supabase.auth.signUp(signUpData);
      if (signUpError) throw signUpError;

      if (role === "BUSINESS_OWNER" && data?.user?.id) {
        await supabase.from("businesses").insert({
          owner_id: data.user.id,
          name: formData.businessName.trim() || `${formData.fullName}'s Business`,
          status: "PENDING",
        });
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message || "An error occurred during sign up.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <main className="min-h-screen bg-[#F4F4F1] text-[#1A1A1A] font-sans flex flex-col lg:flex-row">
      
      {/* Sidebar Branding */}
      <div className="lg:w-1/3 bg-[#1A1A1A] p-12 flex flex-col justify-between text-[#F4F4F1]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-8 h-8 bg-[#FF3E00] rounded-full" /> 
            <span className="font-mono tracking-tighter text-xl uppercase">Print.</span>
          </div>
          <h1 className="text-6xl font-black leading-none tracking-tighter uppercase italic">
            Create <br /> Account
          </h1>
        </div>
        
        <div className="space-y-6">
          <p className="font-mono text-sm opacity-60 leading-relaxed uppercase">
            // Register Node <br />
            // Access Portal v.2.0
          </p>
          <div className="flex gap-1">
            <div className="w-12 h-12 bg-[#00A8E8]" /> 
            <div className="w-12 h-12 bg-[#EC008C]" /> 
            <div className="w-12 h-12 bg-[#FFF200]" /> 
          </div>
        </div>
      </div>

      {/* Form Section */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-16">
        <div className="w-full max-w-md">
          {success ? (
            <div className="p-8 border-4 border-[#1A1A1A] bg-white animate-in zoom-in-95">
              <div className="w-16 h-16 bg-[#00A8E8] mb-6 flex items-center justify-center">
                <Mail className="text-white w-8 h-8" />
              </div>
              <h2 className="text-4xl font-black uppercase tracking-tighter mb-4">Check Email</h2>
              <p className="font-mono text-sm uppercase mb-8 leading-relaxed">
                Verification link sent to: <br />
                <span className="text-[#FF3E00] font-bold">{formData.email}</span>
              </p>
              <Link href="/login" className="inline-flex items-center font-bold uppercase border-b-2 border-[#1A1A1A] hover:text-[#FF3E00] hover:border-[#FF3E00] transition-colors">
                Return to Login <ArrowRight size={18} className="ml-2" />
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-10">
                <h2 className="text-5xl font-black tracking-tighter uppercase mb-2">Join Studio</h2>
                <p className="text-gray-500 font-medium tracking-tight">Select your operational role below.</p>
              </div>

              {/* Role Selector */}
              <div className="flex border-2 border-[#1A1A1A] mb-10">
                <button
                  type="button"
                  onClick={() => setRole("CUSTOMER")}
                  className={`flex-1 py-4 text-xs font-mono uppercase tracking-widest transition-all ${
                    role === "CUSTOMER" ? "bg-[#1A1A1A] text-white" : "bg-transparent text-[#1A1A1A]"
                  }`}
                >
                  <User size={14} className="inline mr-2 mb-1" /> Customer
                </button>
                <button
                  type="button"
                  onClick={() => setRole("BUSINESS_OWNER")}
                  className={`flex-1 py-4 text-xs font-mono uppercase tracking-widest transition-all ${
                    role === "BUSINESS_OWNER" ? "bg-[#1A1A1A] text-white" : "bg-transparent text-[#1A1A1A]"
                  }`}
                >
                  <Store size={14} className="inline mr-2 mb-1" /> Business Owner
                </button>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-[#FF3E00] text-white font-mono text-xs uppercase flex items-center gap-3">
                  <span className="font-bold text-lg">[!]</span> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* 1. BUSINESS NAME (Conditional & First) */}
                {role === "BUSINESS_OWNER" && (
                  <div className="group animate-in fade-in slide-in-from-top-2 duration-500">
                    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-[#FF3E00] font-bold">
                      Business Entity Name
                    </label>
                    <div className="relative">
                      <input name="businessName" type="text" required value={formData.businessName} onChange={handleChange}
                        className="w-full bg-transparent border-b-4 border-[#1A1A1A] py-3 text-2xl font-black outline-none placeholder:opacity-20 uppercase" 
                        placeholder="e.g. STUDIO_01" />
                      <Briefcase className="absolute right-0 top-4 opacity-10" size={20} />
                    </div>
                  </div>
                )}

                {/* 2. FULL NAME */}
                <div className="group">
                  <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400">Full Name</label>
                  <input name="fullName" type="text" required value={formData.fullName} onChange={handleChange}
                    className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-lg outline-none focus:border-[#1A1A1A] uppercase" placeholder="JOHN DOE" />
                </div>

                {/* 3. EMAIL */}
                <div className="group">
                  <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400">Email Address</label>
                  <input name="email" type="email" required value={formData.email} onChange={handleChange}
                    className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-lg outline-none focus:border-[#1A1A1A] lowercase" placeholder="DESIGNER@STUDIO.COM" />
                </div>

                {/* 4. PASSWORDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="group">
                    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400">Password</label>
                    <input name="password" type="password" required value={formData.password} onChange={handleChange}
                      className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-lg outline-none focus:border-[#1A1A1A]" placeholder="••••••••" />
                  </div>
                  <div className="group">
                    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400">Confirm</label>
                    <input name="confirmPassword" type="password" required value={formData.confirmPassword} onChange={handleChange}
                      className={`w-full bg-transparent border-b-2 py-2 text-lg outline-none transition-all ${
                        formData.confirmPassword && !passwordsMatch ? "border-[#FF3E00]" : "border-gray-200 focus:border-[#1A1A1A]"
                      }`} placeholder="••••••••" />
                  </div>
                </div>

                {/* SECURITY MANIFEST */}
                <div className="p-4 border-2 border-[#1A1A1A] bg-white space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400 border-b border-gray-100 pb-2">Security Parameters</p>
                  <div className="space-y-1">
                    <Requirement label="08+ Characters" met={passwordRequirements.length} />
                    <Requirement label="01+ Capital Letter" met={passwordRequirements.capital} />
                    <Requirement label="01+ Special Symbol" met={passwordRequirements.symbol} />
                    <Requirement label="Match Confirmation" met={passwordsMatch} />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1A1A1A] text-white py-6 px-8 font-bold text-lg flex items-center justify-center gap-3 hover:bg-[#FF3E00] transition-all disabled:opacity-50 active:scale-[0.98] shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)]"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                    <> INITIALIZE ACCOUNT <ArrowRight className="w-5 h-5" /> </>
                  )}
                </button>

                <div className="mt-12 flex justify-between items-center border-t border-gray-200 pt-8">
                  <p className="text-xs font-mono text-gray-400 uppercase tracking-widest">© 2026 Print Studio</p>
                  <Link href="/login" className="text-xs font-bold uppercase tracking-widest border-b-2 border-[#1A1A1A] pb-1 hover:text-[#FF3E00] hover:border-[#FF3E00] transition-colors">
                    Sign In Instead
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}