"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getReadableError = (err) => {
    const message = err?.message?.toLowerCase() || "";
    if (message.includes("invalid login credentials")) {
      return "Wrong password or email. Please try again.";
    }
    return err.message || "An unexpected error occurred.";
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
    <main className="min-h-screen bg-[#F4F4F1] text-[#1A1A1A] font-sans flex flex-col lg:flex-row">

      {/* Sidebar Branding (Matched to SignUp) */}
      <div className="lg:w-1/3 bg-[#1A1A1A] p-12 flex flex-col justify-between text-[#F4F4F1]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-8 h-8 bg-[#FF3E00] rounded-full" />
            <span className="font-mono tracking-tighter text-xl uppercase">Print.</span>
          </div>
          <h1 className="text-6xl font-black leading-none tracking-tighter uppercase italic">
            Access <br /> Portal
          </h1>
        </div>

        <div className="space-y-6">
          <p className="font-mono text-sm opacity-60 leading-relaxed uppercase">
            // Identity Node <br />
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
          <div className="mb-10">
            <h2 className="text-5xl font-black tracking-tighter uppercase mb-2">Welcome Back!</h2>
            <p className="text-gray-500 font-medium">Synchronize your credentials to enter the studio.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-[#FF3E00] text-white font-mono text-xs uppercase flex items-center gap-3">
              <span className="font-bold">[!]</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="group">
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400">Email Address</label>
              <input
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-lg outline-none focus:border-[#1A1A1A]"
                placeholder="DESIGNER@STUDIO.COM"
              />
            </div>

            <div className="group">
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-gray-400">
                Password
              </label>
              <input
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full bg-transparent border-b-2 border-gray-200 py-2 text-lg outline-none focus:border-[#1A1A1A]"
                placeholder="••••••••"
              />
              {/* Moved Forgot Password below the input */}
              <div className="flex justify-end mt-2">
                <a
                  href="#"
                  className="text-[10px] font-mono uppercase text-gray-400 hover:text-[#FF3E00] transition-colors"
                >
                  Forgot Password?
                </a>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1A1A1A] text-white py-6 px-8 font-bold text-lg flex items-center justify-center gap-3 hover:bg-[#FF3E00] transition-all disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <> INITIALIZE SESSION <ArrowRight className="w-5 h-5" /> </>
              )}
            </button>

            <div className="mt-12 flex justify-between items-center border-t border-gray-200 pt-8">
              <p className="text-xs font-mono text-gray-400 uppercase tracking-widest">© 2026 Print Studio</p>
              <Link href="/signup" className="text-xs font-bold uppercase tracking-widest border-b-2 border-[#1A1A1A] pb-1 hover:text-[#FF3E00] hover:border-[#FF3E00] transition-colors">
                Register
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}