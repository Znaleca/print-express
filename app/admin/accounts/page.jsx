"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

const ACCOUNT_PAGE_SIZE = 15;
const ACCOUNT_ROLE_SECTIONS = [
  { key: "CUSTOMER", label: "Customers", icon: Users },
  { key: "BUSINESS_OWNER", label: "Business Owners", icon: Building2 },
  { key: "ADMIN", label: "Administrators", icon: ShieldCheck },
];

function getDirectoryRole(user) {
  const role = String(user?.role || "").toUpperCase();
  return ACCOUNT_ROLE_SECTIONS.some((section) => section.key === role) ? role : "CUSTOMER";
}

export default function AdminAccounts() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [accountError, setAccountError] = useState(null);
  const [accountSection, setAccountSection] = useState("CUSTOMER");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountDateFilter, setAccountDateFilter] = useState("ALL");
  const [accountProfileFilter, setAccountProfileFilter] = useState("ALL");
  const [accountSort, setAccountSort] = useState("NEWEST");
  const [accountPage, setAccountPage] = useState(1);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setAccountError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");

      const response = await fetch("/api/admin/dashboard", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const raw = await response.text();
      let payload = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
      if (!response.ok) throw new Error(payload.error || "Could not load user accounts.");
      setUsers(payload.users || []);
    } catch (loadError) {
      console.error("Admin user directory load error:", loadError);
      setUsers([]);
      setAccountError(loadError.message || "Could not load user accounts.");
      showToast(loadError.message || "Could not load user accounts.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const accountCounts = useMemo(() => {
    const counts = Object.fromEntries(ACCOUNT_ROLE_SECTIONS.map((section) => [section.key, 0]));
    users.forEach((user) => { counts[getDirectoryRole(user)] += 1; });
    return counts;
  }, [users]);

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    const now = Date.now();
    const cutoffByFilter = {
      LAST_30_DAYS: now - (30 * 24 * 60 * 60 * 1000),
      LAST_90_DAYS: now - (90 * 24 * 60 * 60 * 1000),
      LAST_12_MONTHS: now - (365 * 24 * 60 * 60 * 1000),
    };
    const cutoff = cutoffByFilter[accountDateFilter];

    return users
      .filter((user) => getDirectoryRole(user) === accountSection)
      .filter((user) => !query || [user.full_name, user.email].some((value) => String(value || "").toLowerCase().includes(query)))
      .filter((user) => {
        if (!cutoff) return true;
        const createdAt = Date.parse(user.created_at || "");
        return Number.isFinite(createdAt) && createdAt >= cutoff;
      })
      .filter((user) => {
        if (accountProfileFilter === "HAS_NAME") return Boolean(String(user.full_name || "").trim());
        if (accountProfileFilter === "NEEDS_NAME") return !String(user.full_name || "").trim();
        return true;
      })
      .sort((first, second) => {
        const firstDate = Date.parse(first.created_at || "") || 0;
        const secondDate = Date.parse(second.created_at || "") || 0;
        return accountSort === "OLDEST" ? firstDate - secondDate : secondDate - firstDate;
      });
  }, [accountDateFilter, accountProfileFilter, accountSearch, accountSection, accountSort, users]);

  const accountTotalPages = Math.max(1, Math.ceil(filteredAccounts.length / ACCOUNT_PAGE_SIZE));
  const visibleAccounts = filteredAccounts.slice((accountPage - 1) * ACCOUNT_PAGE_SIZE, accountPage * ACCOUNT_PAGE_SIZE);
  const accountFirstVisible = filteredAccounts.length === 0 ? 0 : ((accountPage - 1) * ACCOUNT_PAGE_SIZE) + 1;
  const accountLastVisible = Math.min(accountPage * ACCOUNT_PAGE_SIZE, filteredAccounts.length);

  useEffect(() => {
    setAccountPage(1);
  }, [accountDateFilter, accountProfileFilter, accountSearch, accountSection, accountSort]);

  useEffect(() => {
    setAccountPage((currentPage) => Math.min(currentPage, accountTotalPages));
  }, [accountTotalPages]);

  return (
    <main className="admin-page min-h-screen bg-[#F6F6F2] pb-24 font-sans text-slate-900">
      <section className="relative overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FFFF]">Admin workspace</div><h1 className="text-3xl font-black uppercase tracking-tight text-white">Accounts</h1><p className="mt-2 max-w-2xl text-xs text-white/65">Manage customer and business owner accounts from separate, searchable directories.</p></div>
          <button type="button" onClick={fetchUsers} disabled={loadingUsers} className="inline-flex items-center gap-1.5 self-start border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 sm:self-auto"><RefreshCcw size={13} className={loadingUsers ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </section>

      {toast && <div className={`fixed bottom-6 right-6 z-[200] rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg ${toast.type === "error" ? "bg-rose-700" : "bg-slate-900"}`} role="alert">{toast.message}</div>}

      <section className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="User account role sections">
            {ACCOUNT_ROLE_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isSelected = accountSection === section.key;
              return <button key={section.key} type="button" role="tab" aria-selected={isSelected} onClick={() => { setAccountSection(section.key); setAccountPage(1); }} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${isSelected ? "border-[#00C7C7] bg-[#00C7C7]/10 text-[#007F80]" : "border-slate-200 bg-white text-slate-600 hover:border-[#00C7C7]/60 hover:bg-slate-50"}`}><span className="flex min-w-0 items-center gap-2"><Icon size={16} aria-hidden="true" /><span className="truncate text-xs font-black uppercase tracking-[0.08em]">{section.label}</span></span><span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 shadow-sm">{accountCounts[section.key]}</span></button>;
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,180px))]">
              <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Search accounts<span className="relative mt-1 block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input type="search" value={accountSearch} onChange={(event) => { setAccountSearch(event.target.value); setAccountPage(1); }} placeholder="Search name or email..." aria-label={`Search ${accountSection.toLowerCase()} accounts by name or email`} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium normal-case tracking-normal text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#00C7C7] focus:bg-white" /></span></label>
              <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Joined<select value={accountDateFilter} onChange={(event) => { setAccountDateFilter(event.target.value); setAccountPage(1); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-[#00C7C7] focus:bg-white"><option value="ALL">All dates</option><option value="LAST_30_DAYS">Last 30 days</option><option value="LAST_90_DAYS">Last 90 days</option><option value="LAST_12_MONTHS">Last 12 months</option></select></label>
              <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Profile<select value={accountProfileFilter} onChange={(event) => { setAccountProfileFilter(event.target.value); setAccountPage(1); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-[#00C7C7] focus:bg-white"><option value="ALL">All profiles</option><option value="HAS_NAME">Name provided</option><option value="NEEDS_NAME">Name missing</option></select></label>
              <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Sort<select value={accountSort} onChange={(event) => { setAccountSort(event.target.value); setAccountPage(1); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-[#00C7C7] focus:bg-white"><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option></select></label>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black text-slate-900">{ACCOUNT_ROLE_SECTIONS.find((section) => section.key === accountSection)?.label}</h2><p className="mt-0.5 text-xs text-slate-500" aria-live="polite">Showing {accountFirstVisible}-{accountLastVisible} of {filteredAccounts.length} account{filteredAccounts.length === 1 ? "" : "s"}</p></div>{filteredAccounts.length > 0 && <div className="flex items-center gap-2 self-start sm:self-auto"><button type="button" onClick={() => setAccountPage((currentPage) => Math.max(1, currentPage - 1))} disabled={accountPage <= 1} aria-label="Previous account page" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition-colors hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={14} aria-hidden="true" /> Previous</button><span className="min-w-[76px] text-center text-[11px] font-black text-slate-500">Page {accountPage} of {accountTotalPages}</span><button type="button" onClick={() => setAccountPage((currentPage) => Math.min(accountTotalPages, currentPage + 1))} disabled={accountPage >= accountTotalPages} aria-label="Next account page" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition-colors hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={14} aria-hidden="true" /></button></div>}</div>

          {loadingUsers ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs font-semibold text-slate-500"><Loader2 size={24} className="mx-auto mb-2 animate-spin text-[#EC008C]" />Loading account directory...</div> : accountError ? <div className="rounded-2xl border border-rose-200 bg-white p-10 text-center"><p className="text-sm font-black text-slate-800">Account directory unavailable</p><p className="mt-1 text-xs text-slate-500">{accountError}</p><button type="button" onClick={fetchUsers} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-4 py-2 text-xs font-black text-white hover:bg-[#EC008C]"><RefreshCcw size={14} /> Retry</button></div> : filteredAccounts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Users size={28} className="mx-auto mb-3 text-slate-300" aria-hidden="true" /><p className="text-sm font-black text-slate-700">No matching accounts</p><p className="mt-1 text-xs text-slate-500">Try a different search term or clear one of the filters.</p></div> : <>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><table className="min-w-[680px] w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-500"><th className="px-4 py-3">Full Name</th><th className="px-4 py-3">Email Address</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 text-right">Joined Date</th></tr></thead><tbody className="divide-y divide-slate-100 font-medium text-slate-800">{visibleAccounts.map((user) => <tr key={user.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-bold text-slate-900">{user.full_name || "User Account"}</td><td className="px-4 py-3 text-slate-500">{user.email || "No email on profile"}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{getDirectoryRole(user)}</span></td><td className="px-4 py-3 text-right text-slate-400">{new Date(user.created_at || Date.now()).toLocaleDateString()}</td></tr>)}</tbody></table></div>
            <div className="grid gap-3 md:hidden">{visibleAccounts.map((user) => <article key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900">{user.full_name || "User Account"}</h3><p className="mt-1 break-all text-xs text-slate-500">{user.email || "No email on profile"}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{getDirectoryRole(user)}</span></div><div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">Joined {new Date(user.created_at || Date.now()).toLocaleDateString()}</div></article>)}</div>
          </>}
        </div>
      </section>
    </main>
  );
}
