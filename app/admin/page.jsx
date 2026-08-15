"use client";

import { useState, useEffect } from "react";
import { 
  ShieldCheck, Check, X, AlertTriangle, Users,
  Database, ArrowRight, Printer, Sparkles, Loader2, Store
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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
          businessName: business?.name || "Shop Not Named",
          ownerName: ownerProfile?.full_name || "Owner User",
          ownerEmail: ownerProfile?.email || "No email",
          status: business?.status || "NO_BUSINESS",
        };
      });

      setApprovalQueue(queue.filter((i) => i.status !== "APPROVED"));
      setVerifiedQueue(queue.filter((i) => i.status === "APPROVED"));
      setUsers(payload.users || []);
      setTotalBusinesses(payload.totalBusinesses || 0);
    } catch (err) {
      console.error("Admin dashboard fetch error:", err);
      setLoadError(err?.message || "Failed to load admin dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  const statCards = [
    { label: "Pending Verifications", value: approvalQueue.length },
    { label: "Verified Shops", value: verifiedQueue.length },
    { label: "Total Shops Registered", value: totalBusinesses },
    { label: "Total Platform Users", value: users.length },
  ];

  if (loading) {
    return (
      <main className="admin-page min-h-screen bg-[#F6F6F2] flex items-center justify-center font-sans text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#EC008C]" />
          <p className="text-xs font-semibold uppercase tracking-wider">Loading admin panel...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page min-h-screen bg-[#F6F6F2] font-sans text-slate-900 pb-24">
      
      {/* Header Banner */}
      <section className="relative overflow-hidden bg-[#1A1A1A] border-b border-white/10 py-8 px-4 text-white sm:px-6 lg:px-8">
        <div className="cmyk-bar absolute top-0 left-0 right-0" />
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">Admin console</h1>
            <p className="mt-2 text-xs text-white/65">Review print shop verification requests, manage accounts, and moderate platform content.</p>
          </div>
        </div>
      </section>

      {loadError && (
        <div className="max-w-[1600px] mx-auto px-4 mt-4">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
            {loadError}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 space-y-6">
        
        {/* STAT CARDS */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
              <div className="cmyk-bar-sm absolute top-0 left-0 right-0" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{s.label}</p>
              <p className="text-3xl font-extrabold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* PENDING APPROVAL QUEUE */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4">
            Pending Shop Verification Queue ({approvalQueue.length})
          </h2>

          {approvalQueue.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-medium">
              No pending verification requests at this time. All shops are reviewed!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {approvalQueue.map((item) => (
                <div key={item.key} className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-sm text-slate-900">{item.businessName}</p>
                    <p className="text-xs text-slate-500">{item.ownerName} • {item.ownerEmail}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">
                    Pending Review
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* VERIFIED SHOPS QUEUE */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4">
            Verified Partner Shops ({verifiedQueue.length})
          </h2>

          {verifiedQueue.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-medium">
              No approved partner shops yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {verifiedQueue.map((item) => (
                <div key={item.key} className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-sm text-slate-900">{item.businessName}</p>
                    <p className="text-xs text-slate-500">{item.ownerName} • {item.ownerEmail}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center gap-1">
                    <ShieldCheck size={14} /> Verified Partner
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </section>

    </main>
  );
}
