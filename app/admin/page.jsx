"use client";

import { useState, useEffect } from "react";
import { 
  ShieldCheck, Check, X, AlertTriangle, Users,
  Database, ArrowRight, Printer, Sparkles
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/**
 * MAIN COMPONENT: AdminDashboard
 */
export default function AdminDashboard() {
  const [approvalQueue, setApprovalQueue] = useState([]);
  const [verifiedQueue, setVerifiedQueue] = useState([]);
  const [users, setUsers] = useState([]);
  const [totalBusinesses, setTotalBusinesses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchDashboardData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Unauthorized access. Please log in again.");

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

      if (!response.ok) {
        const details = payload?.details || payload?.error || `Dashboard fetch failed (${response.status})`;
        throw new Error(details);
      }

      const ownerBusinesses = payload.ownerBusinesses || [];
      const ownerProfiles = payload.ownerProfiles || [];
      
      // Get unique IDs of users who have registered a business
      const ownerIds = [...new Set(ownerBusinesses.map((b) => b.owner_id).filter(Boolean))];
      const ownerProfilesMap = ownerProfiles.reduce((acc, row) => ({ ...acc, [row.id]: row }), {});
      const latestBusinessByOwner = ownerBusinesses.reduce((acc, b) => (!acc[b.owner_id] ? { ...acc, [b.owner_id]: b } : acc), {});

      const queue = ownerIds.map((owner) => {
        const business = latestBusinessByOwner[owner] || null;
        const ownerProfile = ownerProfilesMap[owner] || null;
        return {
          key: business ? `biz-${business.id}` : `owner-${owner}`,
          businessId: business?.id || null,
          ownerId: owner,
          businessName: business?.name || "PROFILE_NOT_FOUND",
          ownerName: ownerProfile?.full_name || "UNKNOWN_USER",
          ownerEmail: ownerProfile?.email || "HIDDEN",
          status: business?.status || "NO_BUSINESS",
        };
      });

      setApprovalQueue(queue.filter((i) => i.status !== "APPROVED"));
      setVerifiedQueue(queue.filter((i) => i.status === "APPROVED"));
      setUsers(payload.users || []); // Entire public.profiles table
      setTotalBusinesses(payload.totalBusinesses || 0);
    } catch (err) {
      console.error("Admin dashboard fetch error:", err);
      setLoadError(err?.message || "Failed to load admin dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  const validate = async (businessId, ownerId, action) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/admin/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ businessId, ownerId, action }),
      });
      fetchDashboardData();
    } catch (err) { console.error(err); }
  };

  const statCards = [
    { label: "Pending", value: approvalQueue.length, color: "text-[#FF3E00]" },
    { label: "Verified", value: verifiedQueue.length, color: "text-[#00A8E8]" },
    { label: "Business Units", value: totalBusinesses, color: "text-black" },
    { label: "Total Accounts", value: users.length, color: "text-black" },
  ];

  return (
    <main className="bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden font-sans">
      <section className="relative border-b-8 border-[#1A1A1A] px-6 py-12 md:px-10 md:py-14">
        <div className="absolute top-0 left-0 h-16 w-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 h-16 w-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 h-16 w-16 bg-[#FFF200] opacity-20" />

        <div className="relative mx-auto w-full max-w-[1920px]">
          <div className="inline-flex items-center gap-3 border-4 border-[#1A1A1A] bg-white px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
            <span className="flex gap-1">
              <span className="h-2 w-2 bg-[#00FFFF]" />
              <span className="h-2 w-2 bg-[#EC008C]" />
              <span className="h-2 w-2 bg-[#FFF200]" />
            </span>
            Admin_Online // Core_Node_Stable
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-[0.95] md:text-7xl">
                Admin_<span className="bg-[#1A1A1A] px-4 py-1 text-white not-italic">Command Grid</span>
              </h1>
              <p className="mt-4 max-w-3xl font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed text-gray-600 md:text-sm">
                Monitor onboarding, verify business nodes, and control account integrity across the full network.
              </p>
            </div>

            <div className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-gray-500">Status</p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tighter">System Operational</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center bg-[#1A1A1A] text-white">
                  <Sparkles className="h-6 w-6 text-[#FFF200]" />
                </div>
              </div>
              <div className="mt-4 flex gap-1">
                <div className="h-1 flex-1 bg-[#00FFFF]" />
                <div className="h-1 flex-1 bg-[#EC008C]" />
                <div className="h-1 flex-1 bg-[#FFF200]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-b-4 border-[#1A1A1A] bg-[#1A1A1A] py-4">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-6 px-6 font-mono text-[10px] font-black uppercase tracking-[0.35em] md:px-10">
          <span className="text-[#00FFFF]">Cyan</span>
          <span className="text-[#EC008C]">Magenta</span>
          <span className="text-[#FFF200]">Yellow</span>
          <span className="text-white">Black</span>
          <Printer size={14} className="text-white" />
        </div>
      </div>

      <section className="mx-auto w-full max-w-[1920px] px-6 py-10 md:px-10 md:py-14">
        <div className="mb-10 grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((s) => (
            <div key={s.label} className="border-4 border-[#1A1A1A] bg-white p-5 shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
              <p className="mb-2 font-mono text-[9px] font-black uppercase tracking-[0.2em] opacity-50">{s.label}</p>
              <p className={`text-3xl font-black italic leading-none ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* PRIMARY ACTION TABLE */}
        <section className="mb-16">
          {loadError && (
            <div className="mb-6 border-2 border-[#1A1A1A] bg-[#FF3E00] text-white px-4 py-3 font-mono text-[11px] uppercase tracking-tight">
              Error: {loadError}
            </div>
          )}

          <div className="flex items-center gap-2 mb-6 bg-black text-white px-4 py-2 w-fit">
            <AlertTriangle size={18} className="text-[#FFF200]" />
            <h2 className="font-black uppercase text-sm tracking-tight">Requires Validation</h2>
          </div>

          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-black text-white font-mono text-[10px] uppercase tracking-[0.2em]">
                  <th className="p-4 border-r border-zinc-800">Business Unit</th>
                  <th className="p-4 border-r border-zinc-800">Owner Identity</th>
                  <th className="p-4 border-r border-zinc-800 text-center">Protocol Action</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black">
                {loading ? (
                   <tr><td colSpan="3" className="p-10 text-center font-mono animate-pulse">Syncing_Nodes...</td></tr>
                ) : approvalQueue.length === 0 ? (
                  <tr><td colSpan="3" className="p-10 text-center font-mono uppercase opacity-40">All nodes verified.</td></tr>
                ) : (
                  approvalQueue.map((item) => (
                    <tr key={item.key} className="hover:bg-[#FFF200]/10 transition-colors">
                      <td className="p-5 border-r-2 border-black">
                        <span className="font-black uppercase italic text-lg leading-none">{item.businessName}</span>
                        <div className="flex gap-2 mt-2">
                          <span className="font-mono text-[9px] bg-black text-white px-1.5 py-0.5 uppercase tracking-tighter">
                            Status: {item.status}
                          </span>
                        </div>
                      </td>
                      <td className="p-5 border-r-2 border-black">
                        <p className="font-bold text-xs uppercase">{item.ownerName}</p>
                        <p className="font-mono text-[10px] text-zinc-500 lowercase">{item.ownerEmail}</p>
                      </td>
                      <td className="p-5">
                        <div className="flex justify-center gap-3">
                          <button 
                            onClick={() => validate(item.businessId, item.ownerId, "APPROVE")}
                            className="flex-1 bg-black text-white font-black py-2 px-4 hover:bg-[#00FFFF] transition-all flex items-center justify-center gap-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none"
                          >
                            <Check size={16} /> VERIFY
                          </button>
                          <button 
                            onClick={() => validate(item.businessId, item.ownerId, "REJECT")}
                            className="bg-[#FF3E00] text-white p-2 border-2 border-black hover:bg-black transition-all"
                          >
                            <X size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECONDARY LISTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* VERIFIED OPERATORS */}
          <section>
            <h3 className="font-black uppercase italic mb-4 flex items-center gap-2 underline underline-offset-8 decoration-4 decoration-[#00FFFF]">
              <ShieldCheck size={20} className="text-[#00FFFF]" /> Verified Operators
            </h3>
            <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              {verifiedQueue.length === 0 ? (
                <div className="p-4 font-mono text-[10px] opacity-30 uppercase text-center italic">No Verified Units Found</div>
              ) : (
                verifiedQueue.map((node) => (
                  <div key={node.key} className="p-4 border-b-2 border-black last:border-0 flex justify-between items-center group hover:bg-[#F4F4F1]">
                    <div>
                      <p className="font-bold uppercase italic text-sm">{node.businessName}</p>
                      <p className="font-mono text-[9px] opacity-50">{node.ownerEmail}</p>
                    </div>
                    <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                ))
              )}
            </div>
          </section>

          {/* QUICK DIRECTORY */}
          <section>
            <h3 className="font-black uppercase italic mb-4 flex items-center gap-2 underline underline-offset-8 decoration-4 decoration-[#FFF200]">
              <Users size={20} className="text-black" /> Quick Directory
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {users.map((user) => (
                <div key={user.id} className="bg-white border-2 border-black p-3 hover:-translate-y-1 transition-transform group">
                  <p className="font-bold text-[10px] uppercase truncate">{user.full_name || "NULL_USER"}</p>
                  <p className={`font-mono text-[8px] font-black uppercase mt-1 ${
                    user.role === 'BUSINESS_OWNER' ? 'text-[#00FFFF]' : 
                    user.role === 'ADMIN' ? 'text-[#FF3E00]' : 'text-zinc-400'
                  }`}>
                    {user.role || "CUSTOMER"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

      </section>
    </main>
  );
}