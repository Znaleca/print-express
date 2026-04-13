"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { User, Lock, Mail, Save, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(""); // Read-only
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  
  const [profileMessage, setProfileMessage] = useState({ text: "", type: "" });
  const [securityMessage, setSecurityMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);
      setEmail(user.email || "");
      setFullName(user.user_metadata?.full_name || "");
      setLoading(false);
    }
    getUser();
  }, [router]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage({ text: "", type: "" });

    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName }
    });

    setIsSavingProfile(false);

    if (error) {
      setProfileMessage({ text: error.message, type: "error" });
    } else {
      setProfileMessage({ text: "Profile updated successfully.", type: "success" });
    }
  };

  const handleUpdateSecurity = async (e) => {
    e.preventDefault();
    if (!password) {
      setSecurityMessage({ text: "Password cannot be empty.", type: "error" });
      return;
    }
    if (password !== confirmPassword) {
      setSecurityMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }

    setIsSavingSecurity(true);
    setSecurityMessage({ text: "", type: "" });

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    setIsSavingSecurity(false);

    if (error) {
      setSecurityMessage({ text: error.message, type: "error" });
    } else {
      setSecurityMessage({ text: "Password updated successfully.", type: "success" });
      setPassword("");
      setConfirmPassword("");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] bg-[#1A1A1A] text-[#00FFFF] font-mono">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="uppercase tracking-[0.4em] text-[10px] font-black">Syncing_Identity_Core...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#FDFDFD] p-6 md:p-12 font-sans pb-32">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b-8 border-[#1A1A1A] pb-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex gap-1">
                <div className="w-4 h-1 bg-[#00FFFF]" />
                <div className="w-4 h-1 bg-[#EC008C]" />
                <div className="w-4 h-1 bg-[#FFF200]" />
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.5em] text-gray-400">Settings_v1.0</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter leading-none mb-6">
              Identity_Control
            </h1>
            
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2 bg-[#1A1A1A] text-white px-4 py-2 font-mono text-[10px] uppercase tracking-widest font-black shadow-[4px_4px_0px_0px_rgba(0,255,255,1)]">
                <ShieldCheck size={14} className="text-[#00FFFF]" /> Access_Level: {user.user_metadata?.role || "CUSTOMER"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* PROFILE SETTINGS */}
          <section className="bg-white border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(255,242,0,1)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFF200] opacity-20 transform translate-x-8 -translate-y-8 group-hover:scale-150 transition-transform duration-700" />
            
            <div className="bg-[#1A1A1A] text-white px-6 py-4 flex items-center gap-3 border-b-4 border-[#1A1A1A]">
              <User size={20} className="text-[#FFF200]" />
              <h2 className="font-black uppercase italic tracking-widest text-lg">General_Profile</h2>
            </div>

            <form onSubmit={handleUpdateProfile} className="p-6 md:p-8 space-y-6 relative z-10">
              {profileMessage.text && (
                <div className={`p-4 border-2 font-mono text-[10px] uppercase font-bold flex items-center gap-3 ${profileMessage.type === 'error' ? 'bg-white text-[#EC008C] border-[#EC008C]' : 'bg-[#1A1A1A] text-[#00FFFF] border-[#1A1A1A]'}`}>
                  {profileMessage.type === 'error' ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />} 
                  {profileMessage.text}
                </div>
              )}

              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase font-black tracking-widest text-zinc-500 flex items-center gap-2">
                  <Mail size={12} /> Email_Address (Immutable)
                </label>
                <input 
                  type="email" 
                  value={email} 
                  disabled
                  className="w-full bg-[#F4F4F1] border-2 border-[#1A1A1A]/20 p-4 font-mono text-sm uppercase text-zinc-500 cursor-not-allowed opacity-70"
                />
              </div>

              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                  <User size={12} className="text-[#EC008C]" /> Display_Name
                </label>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your nickname"
                  className="w-full bg-white border-2 border-[#1A1A1A] p-4 font-mono text-sm uppercase text-[#1A1A1A] focus:outline-none focus:ring-4 ring-[#FFF200]/50 transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
                />
              </div>

              <button 
                type="submit"
                disabled={isSavingProfile}
                className="w-full mt-4 bg-[#1A1A1A] text-white py-4 font-black uppercase italic text-sm flex justify-center items-center gap-2 hover:bg-[#FFF200] hover:text-[#1A1A1A] transition-all disabled:opacity-50"
              >
                {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Commit_Profile_Data
              </button>
            </form>
          </section>

          {/* SECURITY SETTINGS */}
          <section className="bg-white border-4 border-[#1A1A1A] shadow-[8px_8px_0px_0px_rgba(236,0,140,1)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#EC008C] opacity-20 transform translate-x-8 -translate-y-8 group-hover:scale-150 transition-transform duration-700" />
            
            <div className="bg-[#1A1A1A] text-white px-6 py-4 flex items-center gap-3 border-b-4 border-[#1A1A1A]">
              <Lock size={20} className="text-[#EC008C]" />
              <h2 className="font-black uppercase italic tracking-widest text-lg">Security_Matrix</h2>
            </div>

            <form onSubmit={handleUpdateSecurity} className="p-6 md:p-8 space-y-6 relative z-10">
              {securityMessage.text && (
                 <div className={`p-4 border-2 font-mono text-[10px] uppercase font-bold flex items-center gap-3 ${securityMessage.type === 'error' ? 'bg-white text-[#EC008C] border-[#EC008C]' : 'bg-[#1A1A1A] text-[#00FFFF] border-[#1A1A1A]'}`}>
                   {securityMessage.type === 'error' ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />} 
                   {securityMessage.text}
                 </div>
              )}

              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                  <Lock size={12} className="text-[#00FFFF]" /> New_Passphrase
                </label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border-2 border-[#1A1A1A] p-4 text-sm text-[#1A1A1A] focus:outline-none focus:ring-4 ring-[#EC008C]/50 transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                  <Lock size={12} className="text-[#00FFFF]" /> Confirm_Passphrase
                </label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border-2 border-[#1A1A1A] p-4 text-sm text-[#1A1A1A] focus:outline-none focus:ring-4 ring-[#EC008C]/50 transition-all shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] font-mono"
                />
              </div>

              <button 
                type="submit"
                disabled={isSavingSecurity}
                className="w-full mt-4 bg-[#1A1A1A] text-white py-4 font-black uppercase italic text-sm flex justify-center items-center gap-2 hover:bg-[#EC008C] hover:text-white transition-all disabled:opacity-50"
              >
                {isSavingSecurity ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Update_Encryption
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
