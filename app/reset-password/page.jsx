"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ArrowRight, ShieldCheck, KeyRound } from "lucide-react";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Hardcore password rule metrics
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
      setError("Security validation failed. Parameters out of bounds.");
      setLoading(false);
      return;
    }

    try {
      // Supabase's auto-verify handles the token hash within the URL automatically. 
      // All we need to do is update the user payload.
      const { error } = await supabase.auth.updateUser({
        password: formData.password
      });

      if (error) throw error;
      
      setSuccess(true);
      // Wait shortly before throwing them to the login screen
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err) {
      setError(err.message || "Failed to synchronize new encryption key over network.");
    } finally {
      setLoading(false);
    }
  };

  // Sub-component for individual requirement lines
  const Requirement = ({ label, met }) => (
    <div className={`flex items-center gap-2 font-mono text-[9px] uppercase tracking-tighter transition-colors ${met ? "text-green-500" : "text-gray-500"}`}>
      <div className={`w-2 h-2 border ${met ? "bg-green-500 border-green-500" : "border-gray-500"}`} />
      <span className={met ? "font-bold" : ""}>{label}</span>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#F4F4F1] text-[#1A1A1A] font-sans flex flex-col lg:flex-row overflow-hidden">

      {/* Sidebar Branding - Abstract/Industrial */}
      <div className="lg:w-5/12 bg-[#1A1A1A] p-12 flex flex-col justify-between text-[#F4F4F1] relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(#F4F4F1 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

        <div className="relative z-10">
          <div className="flex items-start gap-4 mb-16">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-[#FF3E00] flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(255,62,0,0.3)]">
                <ShieldCheck size={28} className="text-[#FF3E00]" />
              </div>
            </div>
            <div className="font-mono text-[10px] tracking-[0.3em] leading-tight opacity-40">
              STATE: IDENTITY_RECOVERY<br />
              LOCKOUT: OVERRIDE<br />
              PORTAL_V: 2.0.6
            </div>
          </div>

          <h1 className="text-8xl font-black leading-[0.85] tracking-tighter uppercase italic mb-8">
            SECURITY<br />
            <span className="text-[#FF3E00]">_</span>OVERRIDE
          </h1>

          <div className="flex gap-4 items-center">
            <div className="h-[2px] w-20 bg-[#FF3E00]" />
            <span className="font-mono text-xs tracking-widest uppercase opacity-60 italic font-bold">Encrypted Session</span>
          </div>
        </div>
      </div>

      {/* Form Section */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-16 relative bg-[#F4F4F1]">
        <div className="absolute top-10 left-10 w-10 h-10 border-t-2 border-l-2 border-black/10" />
        <div className="absolute bottom-10 right-10 w-10 h-10 border-b-2 border-r-2 border-black/10" />

        <div className="w-full max-w-md relative z-10">
          
          {success ? (
            <div className="p-8 border-4 border-[#1A1A1A] bg-[#FFF200] text-black shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] text-center animate-in zoom-in-95">
               <KeyRound className="mx-auto w-16 h-16 mb-4 relative" />
               <h2 className="text-4xl font-black uppercase tracking-tighter mb-2">KEY_UPDATED</h2>
               <p className="font-mono text-[10px] uppercase font-bold tracking-widest mb-6 opacity-60">Credentials successfully written to the blockchain.</p>
               <p className="font-mono text-xs uppercase animate-pulse">Redirecting to Login Interface...</p>
            </div>
          ) : (
            <>
              <div className="mb-12">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-[#FF3E00] rotate-45" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.4em]">Establish_New_Key</span>
                </div>
                <h2 className="text-6xl font-black tracking-tighter uppercase leading-none mb-4">RECOVERY_PROTOCOL</h2>
                <p className="font-mono text-xs uppercase tracking-widest opacity-40 leading-relaxed font-bold border-l-2 border-[#1A1A1A] pl-3">
                  Please generate a secure, high-entropy cipher to regain access to your operational node.
                </p>
              </div>

              {error && (
                <div className="mb-8 p-4 bg-[#FF3E00] text-white font-mono text-xs uppercase flex items-center gap-3 border-4 border-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                  <span className="font-black">[FATAL_ERR]</span> {error}
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-8">
                
                <div className="space-y-4">
                  <div className="group relative">
                    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400 font-bold">New Cipher (Password)</label>
                    <input
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full bg-transparent border-b-4 border-[#1A1A1A]/10 py-3 text-2xl font-black outline-none focus:border-[#FF3E00] transition-all placeholder:text-black/10"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="group relative">
                    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400 font-bold">Confirm Cipher</label>
                    <input
                      name="confirmPassword"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="w-full bg-transparent border-b-4 border-[#1A1A1A]/10 py-3 text-2xl font-black outline-none focus:border-[#FF3E00] transition-all placeholder:text-black/10"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {/* Security HUD */}
                <div className="p-4 border border-[#1A1A1A]/10 bg-[#EBEBE8] grid grid-cols-2 gap-y-2">
                  <Requirement label="08+ CHARS" met={passwordRequirements.length} />
                  <Requirement label="CAPS_LOCK" met={passwordRequirements.capital} />
                  <Requirement label="SYMBOL_!@#" met={passwordRequirements.symbol} />
                  <Requirement label="SYNC_MATCH" met={passwordsMatch} />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1A1A1A] text-white py-6 px-8 font-black text-xl flex items-center justify-center gap-4 hover:bg-[#FF3E00] transition-all disabled:opacity-50 active:scale-[0.98] shadow-[8px_8px_0px_0px_rgba(255,62,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1"
                >
                  {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : (
                    <> WRITE_NEW_KEY <ArrowRight className="w-6 h-6" /> </>
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-16 flex justify-between items-center border-t-2 border-dashed border-gray-300 pt-8">
            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest font-bold">© 2026 | Press & Present</p>
            <Link href="/login" className="text-[10px] font-black uppercase tracking-[0.2em] bg-white border-2 border-[#1A1A1A] px-6 py-2 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all">
              Abort to Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
