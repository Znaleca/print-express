"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { User, Lock, Mail, Save, Loader2, ShieldCheck, AlertTriangle, Phone } from "lucide-react";
import { normalizePhilippinePhone } from "@/lib/phone";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";

export default function AccountSettingsPage({ isOwnerPortal = false, portalRole = "customer" } = {}) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(""); // Read-only
  const [phone, setPhone] = useState("");
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
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!isOwnerPortal && (profile?.role === "BUSINESS_OWNER" || user.user_metadata?.role === "BUSINESS_OWNER")) {
        router.replace("/owner/account-settings");
        return;
      }

      setFullName(profile?.full_name || user.user_metadata?.full_name || "");
      setPhone(profile?.phone || user.user_metadata?.phone || "");
      setLoading(false);
    }
    getUser();
  }, [router]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage({ text: "", type: "" });

    const normalizedPhone = normalizePhilippinePhone(phone);
    if (!normalizedPhone) {
      setIsSavingProfile(false);
      setProfileMessage({ text: "Enter a valid Philippine mobile number. Example: 09171234567 or +639171234567.", type: "error" });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData?.session?.access_token || ""}`,
      },
      body: JSON.stringify({ fullName, phone: normalizedPhone }),
    });
    const data = await res.json();

    setIsSavingProfile(false);

    if (!res.ok) {
      setProfileMessage({ text: data.error || "Failed to update profile.", type: "error" });
    } else {
      setFullName(data.profile?.full_name || fullName.trim());
      setPhone(data.profile?.phone || normalizedPhone);
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
    return <OwnerPageSkeleton rows={2} />;
  }

  return (
    <main className="account-settings-page min-h-screen w-full overflow-x-hidden bg-[#F6F6F2] font-sans">
      <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-12 pt-8 text-white sm:px-8 sm:pb-14 sm:pt-10 lg:px-10">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />

        <div className="relative mx-auto max-w-6xl space-y-8">
          {/* HEADER SECTION */}
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">Settings</h1>
              <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">
                {portalRole === "admin" ? "Manage your administrator profile and keep your account secure." : portalRole === "owner" ? "Manage your shop owner profile and keep your account secure." : "Manage your profile and keep your account secure."}
              </p>
              
              <div className="flex flex-wrap items-center gap-6">
                <div className="mt-5 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-white ring-1 ring-white/15">
                  <ShieldCheck size={14} className="text-[#00FFFF]" /> Account role · {user.user_metadata?.role || "CUSTOMER"}
                </div>
              </div>
            </div>
          </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* PROFILE SETTINGS */}
          <section className="relative overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white shadow-sm group">
            <div className="cmyk-bar-sm absolute left-0 right-0 top-0" />
            
            <div className="flex items-center gap-3 border-b border-[#D8D6CE] bg-white px-6 py-5">
              <User size={20} className="text-[#FFF200]" />
              <h2 className="text-xl font-black text-[#1A1A1A]">Profile details</h2>
            </div>

            <form onSubmit={handleUpdateProfile} className="p-6 md:p-8 space-y-6 relative z-10">
              {profileMessage.text && (
                <div className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center gap-3 ${profileMessage.type === 'error' ? 'bg-pink-50 text-[#EC008C] border-pink-200' : 'bg-[#1A1A1A] text-[#00FFFF] border-[#1A1A1A]'}`}>
                  {profileMessage.type === 'error' ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />} 
                  {profileMessage.text}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                  <Mail size={13} /> Email address · cannot be changed
                </label>
                <input 
                  type="email" 
                  value={email} 
                  disabled
                  className="w-full rounded-xl border border-[#D8D6CE] bg-[#F6F6F2] px-4 py-3 text-sm text-slate-500 cursor-not-allowed opacity-70"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                  <User size={12} className="text-[#EC008C]" /> Nickname
                </label>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full rounded-xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm text-[#1A1A1A] outline-none transition-all focus:ring-2 focus:ring-[#FFF200]/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                  <Phone size={12} className="text-[#00FFFF]" /> Mobile_Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0917 123 4567"
                  className="w-full rounded-xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm text-[#1A1A1A] outline-none transition-all focus:ring-2 focus:ring-[#00FFFF]/40"
                />
                <p className="text-[11px] text-slate-500">Saved in +63 format for SMS order updates.</p>
              </div>

              <button 
                type="submit"
                disabled={isSavingProfile}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] py-3.5 text-sm font-extrabold text-white transition-all hover:bg-[#FFF200] hover:text-[#1A1A1A] disabled:opacity-50"
              >
                {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Profile
              </button>
            </form>
          </section>

          {/* SECURITY SETTINGS */}
          <section className="relative overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white shadow-sm group">
            <div className="cmyk-bar-sm absolute left-0 right-0 top-0" />
            
            <div className="flex items-center gap-3 border-b border-[#D8D6CE] bg-white px-6 py-5">
              <Lock size={20} className="text-[#EC008C]" />
              <h2 className="text-xl font-black text-[#1A1A1A]">Change password</h2>
            </div>

            <form onSubmit={handleUpdateSecurity} className="p-6 md:p-8 space-y-6 relative z-10">
              {securityMessage.text && (
                 <div className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center gap-3 ${securityMessage.type === 'error' ? 'bg-pink-50 text-[#EC008C] border-pink-200' : 'bg-[#1A1A1A] text-[#00FFFF] border-[#1A1A1A]'}`}>
                   {securityMessage.type === 'error' ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />} 
                   {securityMessage.text}
                 </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                  <Lock size={13} className="text-[#00FFFF]" /> New password
                </label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm text-[#1A1A1A] outline-none transition-all focus:ring-2 focus:ring-[#EC008C]/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                  <Lock size={13} className="text-[#00FFFF]" /> Confirm password
                </label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#D8D6CE] bg-white px-4 py-3 text-sm text-[#1A1A1A] outline-none transition-all focus:ring-2 focus:ring-[#EC008C]/50"
                />
              </div>

              <button 
                type="submit"
                disabled={isSavingSecurity}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] py-3.5 text-sm font-extrabold text-white transition-all hover:bg-[#EC008C] disabled:opacity-50"
              >
                {isSavingSecurity ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Password
              </button>
            </form>
          </section>
        </div>
      </div>
      </section>
    </main>
  );
}
