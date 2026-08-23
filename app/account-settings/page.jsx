"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { User, Lock, Mail, Save, Loader2, ShieldCheck, AlertTriangle, Phone, Camera, Trash2 } from "lucide-react";
import { normalizePhilippinePhone } from "@/lib/phone";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  PROFILE_AVATARS_BUCKET,
  getUploadExtension,
  optimizeImageForUpload,
} from "@/lib/imageUpload";

const AVATAR_MAX_BYTES = 1024 * 1024;
const AVATAR_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function AccountSettingsPage({ isOwnerPortal = false, portalRole = "customer" } = {}) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [accountRole, setAccountRole] = useState("CUSTOMER");
  const [loading, setLoading] = useState(true);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(""); // Read-only
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const avatarInputRef = useRef(null);

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
        .select("full_name, phone, role, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      setAccountRole(profile?.role || "CUSTOMER");

      if (!isOwnerPortal && profile?.role === "BUSINESS_OWNER") {
        router.replace("/owner/account-settings");
        return;
      }

      setFullName(profile?.full_name || user.user_metadata?.full_name || "");
      setPhone(profile?.phone || user.user_metadata?.phone || "");
      const savedAvatar = profile?.avatar_url || user.user_metadata?.avatar_url || "";
      setAvatarUrl(savedAvatar);
      setAvatarPreview(savedAvatar);
      setLoading(false);
    }
    getUser();
  }, [router]);

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const handleAvatarSelection = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!AVATAR_TYPES.has(file.type)) {
      setProfileMessage({ text: "Choose a JPG, PNG, or WebP profile photo.", type: "error" });
      return;
    }
    if (file.size > AVATAR_SOURCE_MAX_BYTES) {
      setProfileMessage({ text: "The selected photo must be 10 MB or smaller.", type: "error" });
      return;
    }

    setAvatarFile(file);
    setRemoveAvatar(false);
    setAvatarPreview(URL.createObjectURL(file));
    setProfileMessage({ text: "", type: "" });
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview("");
    setRemoveAvatar(true);
    setProfileMessage({ text: "Profile photo will be removed when you save.", type: "success" });
  };

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

    let uploadedAvatarPath = null;

    try {
      if (avatarFile) {
        const optimizedAvatar = await optimizeImageForUpload(avatarFile, {
          maxBytes: AVATAR_MAX_BYTES,
          maxDimension: 512,
        });
        uploadedAvatarPath = `${user.id}/avatars/avatar-${Date.now()}.${getUploadExtension(optimizedAvatar)}`;
        const { error: uploadError } = await supabase.storage
          .from(PROFILE_AVATARS_BUCKET)
          .upload(uploadedAvatarPath, optimizedAvatar, {
            cacheControl: "31536000",
            contentType: optimizedAvatar.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData?.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          fullName,
          phone: normalizedPhone,
          avatarPath: uploadedAvatarPath || undefined,
          removeAvatar,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (uploadedAvatarPath) {
          await supabase.storage.from(PROFILE_AVATARS_BUCKET).remove([uploadedAvatarPath]);
        }
        throw new Error(data.error || "Failed to update profile.");
      }

      const savedAvatar = data.profile?.avatar_url || "";
      setFullName(data.profile?.full_name || fullName.trim());
      setPhone(data.profile?.phone || normalizedPhone);
      setAvatarUrl(savedAvatar);
      setAvatarPreview(savedAvatar);
      setAvatarFile(null);
      setRemoveAvatar(false);
      setProfileMessage({ text: "Profile updated successfully.", type: "success" });
    } catch (error) {
      setProfileMessage({ text: error.message || "Failed to update profile.", type: "error" });
    } finally {
      setIsSavingProfile(false);
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
                  <ShieldCheck size={14} className="text-[#00FFFF]" /> Account role · {accountRole}
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

              <div className="rounded-2xl border border-[#D8D6CE] bg-[#F6F6F2] p-4">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarSelection}
                />
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <ProfileAvatar
                    src={avatarPreview}
                    name={fullName || email}
                    className="h-24 w-24"
                    fallbackClassName="bg-[#1A1A1A] text-[#00FFFF]"
                    sizes="96px"
                  />
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <p className="text-sm font-extrabold text-slate-900">Message profile photo</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Shown beside your messages. JPG, PNG, or WebP; automatically optimized to 512 px and 1 MB.
                    </p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isSavingProfile}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#EC008C] disabled:opacity-50"
                      >
                        <Camera size={14} /> {avatarPreview ? "Change photo" : "Choose photo"}
                      </button>
                      {(avatarPreview || avatarUrl) && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          disabled={isSavingProfile}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-[#EC008C] hover:text-[#EC008C] disabled:opacity-50"
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

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
