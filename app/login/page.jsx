"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ArrowRight, ShieldCheck, Activity, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Forgot Password States
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const getReadableError = (err) => {
    const message = err?.message?.toLowerCase() || "";
    if (message.includes("invalid login credentials")) {
      return "ACCESS_DENIED: INVALID_CREDENTIALS";
    }
    return err.message || "SYSTEM_ERROR: UNEXPECTED_PROTOCOL_FAILURE";
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!formData.email) return;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setError(err.message || "Failed to dispatch recovery link.");
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
    <main className="min-h-screen bg-[#F4F4F1] text-[#1A1A1A] font-sans flex flex-col lg:flex-row overflow-hidden">

      {/* Sidebar Branding - Abstract/Industrial */}
      <div className="lg:w-5/12 bg-[#1A1A1A] p-12 flex flex-col justify-between text-[#F4F4F1] relative">
        {/* Background Decorative Grid - Cyan Dots */}
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(#00FFFF 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

        <div className="relative z-10">
          <div className="flex items-start gap-4 mb-16">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-[#00FFFF] flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,255,255,0.3)]">
                <div className="w-8 h-8 bg-[#00FFFF] rotate-45 animate-pulse" />
              </div>
            </div>
            <div className="font-mono text-[10px] tracking-[0.3em] leading-tight opacity-40">
              AUTH_PROTOCOL: SECURE_LOGIN<br />
              NODE_ENCRYPTION: ENABLED<br />
              PORTAL_V: 2.0.6
            </div>
          </div>

          <h1 className="text-8xl font-black leading-[0.85] tracking-tighter uppercase italic mb-8">
            ACCESS<br />
            <span className="text-[#00FFFF]">_</span>HUB
          </h1>

          <div className="flex gap-4 items-center">
            <div className="h-[2px] w-20 bg-[#EC008C]" /> {/* Magenta Accent */}
            <span className="font-mono text-xs tracking-widest uppercase opacity-60 italic font-bold">Encrypted Session</span>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-4">
          <div className="border border-white/20 p-4 font-mono">
            <Mail size={18} className="text-[#00FFFF] mb-2" />
            <p className="text-[9px] uppercase opacity-40">Auth_Method</p>
            <p className="text-[11px] font-bold tracking-widest uppercase">Email_Identity</p>
          </div>
          <div className="border border-white/20 p-4 font-mono">
            <Activity size={18} className="text-[#FFF200] mb-2" /> {/* Yellow Accent */}
            <p className="text-[9px] uppercase opacity-40">Server_Load</p>
            <p className="text-[11px] font-bold tracking-widest">MINIMAL_0.02</p>
          </div>
        </div>
      </div>

      {/* Form Section */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-16 relative bg-[#F4F4F1]">
        {/* Decorative corner brackets */}
        <div className="absolute top-10 left-10 w-10 h-10 border-t-2 border-l-2 border-[#00FFFF]/20" />
        <div className="absolute bottom-10 right-10 w-10 h-10 border-b-2 border-r-2 border-[#EC008C]/20" />

        <div className="w-full max-w-md relative z-10">
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="text-[#00FFFF]" size={16} />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.4em]">Validation_Required</span>
            </div>
            <h2 className="text-6xl font-black tracking-tighter uppercase leading-none">WELCOME_BACK</h2>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-[#EC008C] text-white font-mono text-xs uppercase flex items-center gap-3 border-4 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <span className="font-black">[FATAL_ERR]</span> {error}
            </div>
          )}

          {resetSent ? (
            <div className="p-8 border-4 border-[#1A1A1A] bg-white text-center shadow-[12px_12px_0px_0px_rgba(26,26,26,1)]">
              <ShieldCheck className="w-16 h-16 text-[#00FFFF] mx-auto mb-6" />
              <h2 className="text-3xl font-black uppercase tracking-tighter mb-4">Transmission_Sent</h2>
              <p className="font-mono text-[10px] uppercase opacity-60 mb-8 leading-relaxed">
                If the identity <span className="font-bold text-black border-b-2 border-[#00FFFF]">{formData.email}</span> exists in the registry, a secure reset link has been dispatched.
              </p>
              <button
                onClick={() => { setResetSent(false); setIsResetMode(false); }}
                className="w-full bg-[#1A1A1A] text-white py-4 font-black text-xs uppercase tracking-widest hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-colors"
              >
                RETURN TO SYSTEM ACCESS
              </button>
            </div>
          ) : (
            <form onSubmit={isResetMode ? handleResetPassword : handleSubmit} className="space-y-8">
              <div className="group">
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400 font-bold flex justify-between">
                  <span>Email</span>
                  {isResetMode && <span className="text-[#EC008C]">Required for reset</span>}
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full bg-transparent border-b-4 border-[#1A1A1A]/10 py-3 text-2xl font-black outline-none focus:border-[#00FFFF] transition-all placeholder:text-black/10"
                  placeholder="johndoe@gmail.com"
                />
              </div>

              {!isResetMode && (
                <div className="group relative animate-in fade-in slide-in-from-top-4">
                  <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400 font-bold">Password</label>
                  <input
                    name="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full bg-transparent border-b-4 border-[#1A1A1A]/10 py-3 text-2xl font-black outline-none focus:border-[#00FFFF] transition-all placeholder:text-black/10"
                    placeholder="••••••••"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={() => { setIsResetMode(true); setError(null); }}
                      className="text-[9px] font-mono uppercase font-black tracking-tighter text-gray-400 hover:text-[#EC008C] transition-colors"
                    >
                      FORGOT PASSWORD?
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1A1A1A] text-white py-6 px-8 font-black text-xl flex items-center justify-center gap-4 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all disabled:opacity-50 active:scale-[0.98] shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] active:shadow-none active:translate-x-1 active:translate-y-1"
              >
                {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : (
                  <> 
                    {isResetMode ? "DISPATCH RECOVERY LINK" : "LOGIN"} 
                    <ArrowRight className="w-6 h-6" /> 
                  </>
                )}
              </button>

              {isResetMode && (
                <div className="text-center font-mono text-[10px] uppercase tracking-widest animate-in slide-in-from-bottom-2">
                  <button type="button" onClick={() => { setIsResetMode(false); setError(null); }} className="text-gray-400 hover:text-black hover:border-b-2 hover:border-[#1A1A1A] transition-all border-b-2 border-transparent pb-1">
                    ABORT RECOVERY
                  </button>
                </div>
              )}

              <div className="mt-16 flex justify-between items-center border-t-2 border-dashed border-gray-300 pt-8">
                <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest font-bold">© 2026 | Press & Present</p>
                <Link href="/signup" className="text-[10px] font-black uppercase tracking-[0.2em] bg-white border-2 border-[#1A1A1A] px-6 py-2 shadow-[4px_4px_0px_0px_rgba(0,255,255,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all">
                  Register
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}