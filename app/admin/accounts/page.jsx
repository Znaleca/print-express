"use client";

import { useState, useEffect } from "react";
import { Fingerprint, Mail, Shield, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function AdminAccounts() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const response = await fetch("/api/admin/dashboard", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const raw = await response.text();
        let payload = {};

        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          payload = { error: raw || "Unknown response format" };
        }

        setUsers(payload.users || []);
      } catch (err) {
        console.error("Admin dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUsers();
  }, []);

  return (
    <section>
      <header className="mb-8">
        <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-2">Account_Directory</h1>
        <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">Global Identity Registry // Access_Level: 00</p>
      </header>

      <div className="flex items-center gap-3 mb-6 bg-black text-white px-4 py-2 w-fit italic">
        <Fingerprint size={20} className="text-[#00FFFF]" />
        <h2 className="font-black uppercase text-sm tracking-widest">Master_Profile_Registry</h2>
      </div>

      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-[#EBEBE8] border-b-4 border-black font-mono text-[10px] uppercase tracking-widest text-black">
                <th className="p-4 border-r-2 border-black">Full Name [identity]</th>
                <th className="p-4 border-r-2 border-black">Email [communication]</th>
                <th className="p-4 border-r-2 border-black">Role [authorization]</th>
                <th className="p-4 text-center border-r-2 border-black">Created</th>
                <th className="p-4 text-center">System ID</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black">
              {loading ? (
                <tr>
                  <td colSpan="5" className="p-12 text-center font-mono uppercase">
                    <Loader2 size={32} className="animate-spin mx-auto mb-4" />
                    Scanning public.profiles...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-12 text-center font-mono uppercase opacity-30">
                    No records found in pg_default.
                  </td>
                </tr>
              ) : (
                users.map((profile) => (
                  <tr key={profile.id} className="hover:bg-[#00FFFF]/10 transition-colors group">
                    <td className="p-4 border-r-2 border-black font-black uppercase text-sm italic">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-black rotate-45" />
                        {profile.full_name || "NULL_IDENTITY"}
                      </div>
                    </td>
                    <td className="p-4 border-r-2 border-black font-mono text-[11px] text-zinc-600">
                      <div className="flex items-center gap-2">
                        <Mail size={12} className="opacity-40" />
                        {profile.email}
                      </div>
                    </td>
                    <td className="p-4 border-r-2 border-black">
                      <span className={`
                        inline-flex items-center gap-2 px-3 py-1 text-[10px] font-bold border-2 border-black uppercase tracking-tighter
                        ${profile.role === 'ADMIN' ? 'bg-[#FF3E00] text-white' : 
                          profile.role === 'BUSINESS_OWNER' ? 'bg-[#00FFFF] text-black' : 
                          'bg-white text-black'}
                      `}>
                        <Shield size={10} />
                        {profile.role}
                      </span>
                    </td>
                    <td className="p-4 border-r-2 border-black text-center font-mono text-[10px]">
                      {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-4 text-center font-mono text-[9px] opacity-40">
                      {profile.id.split('-')[0]}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
