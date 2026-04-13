"use client";

import { User, Shield, Mail, Fingerprint } from "lucide-react";

export default function ProfileRegistry({ users, loading }) {
  return (
    <section className="mt-16 mb-20">
      {/* SECTION HEADER */}
      <div className="flex items-center gap-3 mb-6 bg-black text-white px-4 py-2 w-fit italic">
        <Fingerprint size={20} className="text-[#FFF200]" />
        <h2 className="font-black uppercase text-sm tracking-widest">Master_Profile_Registry</h2>
      </div>

      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#EBEBE8] border-b-4 border-black font-mono text-[10px] uppercase tracking-widest text-black">
              <th className="p-4 border-r-2 border-black">Full Name [identity]</th>
              <th className="p-4 border-r-2 border-black">Email [communication]</th>
              <th className="p-4 border-r-2 border-black">Role [authorization]</th>
              <th className="p-4 text-center">System ID</th>
            </tr>
          </thead>
          
          <tbody className="divide-y-2 divide-black">
            {loading ? (
              <tr>
                <td colSpan="4" className="p-12 text-center font-mono animate-pulse uppercase opacity-50">
                  Scanning public.profiles...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-12 text-center font-mono uppercase opacity-30">
                  No records found in pg_default.
                </td>
              </tr>
            ) : (
              users.map((profile) => (
                <tr key={profile.id} className="hover:bg-[#FFF200]/5 transition-colors group">
                  
                  {/* FULL NAME */}
                  <td className="p-4 border-r-2 border-black font-black uppercase text-sm italic">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-black rotate-45" />
                      {profile.full_name || "NULL_IDENTITY"}
                    </div>
                  </td>

                  {/* EMAIL */}
                  <td className="p-4 border-r-2 border-black font-mono text-[11px] text-zinc-600">
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="opacity-40" />
                      {profile.email}
                    </div>
                  </td>

                  {/* ROLE */}
                  <td className="p-4 border-r-2 border-black">
                    <span className={`
                      inline-flex items-center gap-2 px-3 py-1 text-[10px] font-bold border-2 border-black uppercase tracking-tighter
                      ${profile.role === 'ADMIN' ? 'bg-red-600 text-white' : 
                        profile.role === 'BUSINESS_OWNER' ? 'bg-blue-600 text-white' : 
                        'bg-white text-black'}
                    `}>
                      <Shield size={10} />
                      {profile.role}
                    </span>
                  </td>

                  {/* UUID (Shortened for readability) */}
                  <td className="p-4 text-center font-mono text-[9px] opacity-40 group-hover:opacity-100 transition-opacity">
                    {profile.id.split('-')[0]}...
                  </td>

                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* SCHEMA FOOTER */}
      <div className="flex justify-between items-center mt-4">
        <p className="font-mono text-[9px] uppercase opacity-40">
          Source: public.profiles // Constraint: profiles_id_fkey
        </p>
        <div className="flex gap-2">
          <div className="w-3 h-3 bg-black" />
          <div className="w-3 h-3 bg-zinc-300" />
          <div className="w-3 h-3 bg-zinc-100 border border-black" />
        </div>
      </div>
    </section>
  );
}