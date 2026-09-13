"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileCheck2,
  Loader2,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Star,
  Tag,
  UserRound,
  Wrench,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_DATA = { selectedShop: null };
const TABS = [
  { key: "OVERVIEW", label: "Overview", icon: Building2 },
  { key: "SERVICES", label: "Services", icon: Wrench },
  { key: "REVIEWS", label: "Reviews", icon: MessageSquareText },
  { key: "CATEGORY_APPROVALS", label: "Category Approvals", icon: Tag },
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Price not provided";
}

function formatPrice(service) {
  if (service.item_type === "product" || service.price_max == null || Number(service.price_max) === Number(service.price)) return formatMoney(service.price);
  return `${formatMoney(service.price)} – ${formatMoney(service.price_max)}`;
}

function statusClass(value) {
  const status = String(value || "PENDING").toUpperCase();
  if (status === "APPROVED" || status === "ACTIVE" || status === "VISIBLE") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED" || status === "ARCHIVED" || status === "HIDDEN") return "bg-rose-100 text-rose-800";
  if (status === "LOCKED") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function StatusBadge({ value }) {
  return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.04em] ${statusClass(value)}`}>{String(value || "PENDING").replaceAll("_", " ")}</span>;
}

function Pager({ pagination, label, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4" aria-label={`${label} pagination`}><p className="text-xs text-slate-500">Page {pagination.page} of {pagination.totalPages} · {pagination.totalItems} total</p><div className="flex items-center gap-2"><button type="button" onClick={() => onPageChange(pagination.page - 1)} disabled={pagination.page <= 1} aria-label={`Previous ${label.toLowerCase()} page`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /> Previous</button><button type="button" onClick={() => onPageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} aria-label={`Next ${label.toLowerCase()} page`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#00C7C7] disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={15} /></button></div></div>;
}

function EmptyState({ icon: Icon, title, message }) {
  return <div className="border border-dashed border-slate-300 bg-white p-10 text-center"><Icon size={30} className="mx-auto mb-3 text-slate-300" aria-hidden="true" /><p className="text-sm font-black text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-500">{message}</p></div>;
}

function DetailRow({ label, value }) {
  return <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-semibold text-slate-800">{value || "Not provided"}</p></div>;
}

export default function ShopDetailsPanel({ shopId }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState("OVERVIEW");
  const [servicePage, setServicePage] = useState(1);
  const [reviewPage, setReviewPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [visibility, setVisibility] = useState("ALL");
  const [reviewSort, setReviewSort] = useState("RECENT");
  const [categoryStatus, setCategoryStatus] = useState("ALL");
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const fetchDetails = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
      const params = new URLSearchParams({ shopId, page: "1", servicePage: String(servicePage), reviewPage: String(reviewPage), categoryPage: String(categoryPage), visibility, reviewSort, categoryStatus });
      const response = await fetch(`/api/admin/shops?${params.toString()}`, { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Shop details are unavailable.");
      if (!payload.selectedShop) {
        setData(EMPTY_DATA);
        setNotFound(true);
      } else {
        setData(payload);
      }
    } catch (loadError) {
      console.error("Admin shop details load error:", loadError);
      setData(EMPTY_DATA);
      setError(loadError.message || "Shop details are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [categoryPage, categoryStatus, reviewPage, reviewSort, servicePage, shopId, visibility]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  const updateReviewVisibility = async (orderId, hidden) => {
    setActionLoading((current) => ({ ...current, [orderId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
      const response = await fetch("/api/admin/shops", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action: "REVIEW", orderId, hidden }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to update review visibility.");
      showToast(hidden ? "Review hidden from the shop profile." : "Review restored to the shop profile.");
      await fetchDetails();
    } catch (actionError) {
      showToast(actionError.message || "Failed to update review visibility.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [orderId]: false }));
    }
  };

  const updateCategoryStatus = async (requestId, status) => {
    setActionLoading((current) => ({ ...current, [requestId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
      const response = await fetch("/api/admin/shops", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action: "CATEGORY", requestId, status }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to update category approval.");
      showToast(status === "APPROVED" ? "Category approval accepted." : "Category request rejected.");
      await fetchDetails();
    } catch (actionError) {
      showToast(actionError.message || "Failed to update category approval.", "error");
    } finally {
      setActionLoading((current) => ({ ...current, [requestId]: false }));
    }
  };

  if (loading && !data.selectedShop) return <main className="admin-page flex min-h-screen items-center justify-center overflow-x-hidden bg-[#F6F6F2] font-sans text-slate-600"><div className="flex flex-col items-center gap-3"><Loader2 size={36} className="animate-spin text-[#EC008C]" /><p className="text-xs font-semibold uppercase tracking-wider">Loading shop details...</p></div></main>;
  if (error) return <main className="admin-page flex min-h-screen items-center justify-center overflow-x-hidden bg-[#F6F6F2] px-6 font-sans text-slate-900"><div className="w-full max-w-md border border-rose-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto mb-4 text-[#EC008C]" size={34} /><h1 className="text-xl font-black">Shop details unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p><div className="mt-6 flex flex-wrap justify-center gap-2"><Link href="/admin/shops" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:border-[#00C7C7]"><ArrowLeft size={14} /> Back to shop list</Link><button type="button" onClick={fetchDetails} className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-4 py-2 text-xs font-black text-white hover:bg-[#EC008C]"><RefreshCcw size={14} /> Retry</button></div></div></main>;
  if (notFound || !data.selectedShop) return <main className="admin-page flex min-h-screen items-center justify-center overflow-x-hidden bg-[#F6F6F2] px-6 font-sans text-slate-900"><div className="w-full max-w-md border border-slate-200 bg-white p-8 text-center shadow-sm"><StoreIcon /><h1 className="text-xl font-black">Shop not found</h1><p className="mt-2 text-sm text-slate-600">This shop ID is missing or the shop is no longer available to the Admin directory.</p><Link href="/admin/shops" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#EC008C]"><ArrowLeft size={14} /> Back to shop list</Link></div></main>;

  const shop = data.selectedShop;
  return <main className="admin-page min-h-screen overflow-x-hidden bg-[#F6F6F2] pb-24 font-sans text-slate-900"><section className="relative overflow-hidden border-b border-white/10 bg-[#1A1A1A] px-4 py-7 text-white sm:px-6 lg:px-8"><div className="cmyk-bar absolute left-0 right-0 top-0" /><div className="mx-auto max-w-[1600px]"><Link href="/admin/shops" className="inline-flex items-center gap-1 text-xs font-bold text-white/65 hover:text-[#00FFFF]"><ArrowLeft size={15} /> Back to shop list</Link><div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div className="min-w-0"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00FFFF]">Shop details</p><h1 className="mt-2 truncate text-3xl font-black uppercase tracking-tight">{shop.shopName}</h1><p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/65"><UserRound size={14} /> Business Owner: {shop.ownerName}{(shop.business?.email || shop.business?.phone) && <span className="text-white/45">· {shop.business.email || shop.business.phone}</span>}</p></div><div className="flex flex-wrap gap-1.5"><StatusBadge value={shop.approvalStatus} /><StatusBadge value={shop.lifecycleState} /></div></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"><div className="bg-white/5 px-3 py-2"><p className="text-[10px] text-white/45">Average rating</p><p className="mt-1 flex items-center gap-1 text-sm font-black"><Star size={13} className="fill-[#FFF200] text-[#FFF200]" /> {shop.averageRating}</p></div><div className="bg-white/5 px-3 py-2"><p className="text-[10px] text-white/45">Total reviews</p><p className="mt-1 text-sm font-black">{shop.totalReviewCount}</p></div><div className="bg-white/5 px-3 py-2"><p className="text-[10px] text-white/45">Visible</p><p className="mt-1 text-sm font-black text-[#00FFFF]">{shop.visibleCount}</p></div><div className="bg-white/5 px-3 py-2"><p className="text-[10px] text-white/45">Hidden</p><p className="mt-1 text-sm font-black text-[#EC008C]">{shop.hiddenCount}</p></div><div className="bg-white/5 px-3 py-2"><p className="text-[10px] text-white/45">Pending categories</p><p className="mt-1 text-sm font-black text-[#FFF200]">{shop.pendingCategoryCount}</p></div><div className="bg-white/5 px-3 py-2"><p className="text-[10px] text-white/45">Services</p><p className="mt-1 text-sm font-black">{shop.serviceCount}</p></div><div className="bg-white/5 px-3 py-2"><p className="text-[10px] text-white/45">Last updated</p><p className="mt-1 text-xs font-black">{formatDate(shop.latestActivityDate)}</p></div></div></div></section>{toast && <div className={`fixed bottom-6 right-6 z-[200] max-w-[calc(100vw-2rem)] px-4 py-3 text-xs font-bold text-white shadow-lg ${toast.type === "error" ? "bg-rose-700" : "bg-slate-900"}`} role="status">{toast.message}</div>}<section className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8"><div className="border border-slate-200 bg-white shadow-sm"><div className="flex overflow-x-auto border-b border-slate-100 px-3" role="tablist" aria-label="Shop detail sections">{TABS.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)} className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-black ${activeTab === key ? "border-[#EC008C] text-[#EC008C]" : "border-transparent text-slate-500 hover:border-[#00C7C7] hover:text-slate-800"}`}><Icon size={14} aria-hidden="true" /> {label}</button>)}</div><div className="p-4">{activeTab === "OVERVIEW" && <Overview shop={shop} />}{activeTab === "SERVICES" && <ServicesSection shop={shop} onPageChange={setServicePage} />}{activeTab === "REVIEWS" && <ReviewsSection shop={shop} visibility={visibility} setVisibility={(value) => { setVisibility(value); setReviewPage(1); }} reviewSort={reviewSort} setReviewSort={(value) => { setReviewSort(value); setReviewPage(1); }} actionLoading={actionLoading} updateReviewVisibility={updateReviewVisibility} onPageChange={setReviewPage} />}{activeTab === "CATEGORY_APPROVALS" && <CategorySection shop={shop} categoryStatus={categoryStatus} setCategoryStatus={(value) => { setCategoryStatus(value); setCategoryPage(1); }} actionLoading={actionLoading} updateCategoryStatus={updateCategoryStatus} onPageChange={setCategoryPage} />}</div></div></section></main>;
}

function StoreIcon() {
  return <div className="mb-4 flex justify-center"><Building2 size={34} className="text-[#EC008C]" aria-hidden="true" /></div>;
}

function Overview({ shop }) {
  const business = shop.business || {};
  const owner = shop.owner || {};
  return <div className="space-y-5" aria-label="Shop overview"><div className="grid gap-4 md:grid-cols-2"><div className="border-l-4 border-[#00C7C7] bg-[#F6F6F2] p-4"><div className="mb-3 flex items-center gap-2"><Building2 size={17} className="text-[#008F91]" /><h2 className="text-sm font-black">Business information</h2></div><div className="grid gap-3 sm:grid-cols-2"><DetailRow label="Shop name" value={business.name} /><DetailRow label="Approval status" value={business.status} /><DetailRow label="Lifecycle" value={business.lifecycle_state} /><DetailRow label="Operating status" value={business.is_open == null ? null : business.is_open ? "Open" : "Closed"} /><DetailRow label="Address" value={business.address} /><DetailRow label="Phone" value={business.phone} /><DetailRow label="Business email" value={business.email} /><DetailRow label="Website" value={business.website} /></div>{(business.description || business.products_summary) && <div className="mt-4 space-y-3 border-t border-slate-200 pt-3"><DetailRow label="Business background" value={business.description} /><DetailRow label="Products and services" value={business.products_summary} /></div>}</div><div className="border-l-4 border-[#FFF200] bg-[#F6F6F2] p-4"><div className="mb-3 flex items-center gap-2"><UserRound size={17} className="text-[#756D00]" /><h2 className="text-sm font-black">Business Owner information</h2></div><div className="grid gap-3 sm:grid-cols-2"><DetailRow label="Owner name" value={owner.full_name} /><DetailRow label="Email" value={owner.email} /><DetailRow label="Phone" value={owner.phone} /><DetailRow label="Role" value={owner.role} /><DetailRow label="Account created" value={formatDate(business.created_at)} /><DetailRow label="Last shop update" value={formatDateTime(business.updated_at)} /></div></div></div><div className="grid gap-4 md:grid-cols-3"><div className="border border-slate-200 bg-white p-4"><h2 className="text-sm font-black">Review summary</h2><p className="mt-3 text-3xl font-black">{shop.averageRating}</p><p className="mt-1 text-xs text-slate-500">Average from {shop.totalReviewCount} review{shop.totalReviewCount === 1 ? "" : "s"}.</p></div><div className="border border-slate-200 bg-white p-4"><h2 className="text-sm font-black">Category summary</h2><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="text-[10px] text-slate-400">Pending</p><p className="mt-1 text-xl font-black text-amber-700">{shop.pendingCategoryCount}</p></div><div><p className="text-[10px] text-slate-400">Approved</p><p className="mt-1 text-xl font-black text-emerald-700">{shop.approvedCategoryCount}</p></div><div><p className="text-[10px] text-slate-400">Rejected</p><p className="mt-1 text-xl font-black text-rose-700">{shop.rejectedCategoryCount}</p></div></div></div><div className="border border-slate-200 bg-white p-4"><h2 className="text-sm font-black">Catalog summary</h2><p className="mt-3 text-3xl font-black">{shop.serviceCount}</p><p className="mt-1 text-xs text-slate-500">Services and products listed by this shop.</p></div></div><div className="border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2"><ShieldCheck size={17} className="text-[#008F91]" /><h2 className="text-sm font-black">Recent activity</h2></div>{shop.recentActivity?.length ? <div className="divide-y divide-slate-100">{shop.recentActivity.map((event, activityIndex) => <div key={`${event.type}-${event.date}-${activityIndex}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="font-semibold text-slate-700">{event.label}</span><span className="text-[10px] text-slate-400">{formatDateTime(event.date)}</span></div>)}</div> : <p className="py-4 text-xs text-slate-500">No recent activity recorded for this shop.</p>}</div><div className="flex flex-wrap gap-2"><Link href="/admin/verifications" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#00C7C7]"><FileCheck2 size={14} /> Open verification workspace</Link><Link href="/admin/accounts" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#00C7C7]"><UserRound size={14} /> Open account directory</Link></div></div>;
}
function ServicesSection({ shop, onPageChange }) {
  const services = shop.services || [];
  return <section aria-labelledby="shop-services-heading"><div className="mb-4"><h2 id="shop-services-heading" className="text-sm font-black">Services and products</h2><p className="mt-1 text-xs text-slate-500">Only catalog items belonging to {shop.shopName} are shown.</p></div>{services.length === 0 ? <EmptyState icon={Wrench} title="No services yet" message="This shop has not added any services or products." /> : <div className="grid gap-3 md:grid-cols-2">{services.map((service) => <article key={service.id} className="border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900">{service.name}</h3><p className="mt-1 text-[11px] text-slate-500">{service.category} · {service.item_type === "product" ? "Product" : "Service"}</p></div><StatusBadge value={service.available ? "ACTIVE" : "HIDDEN"} /></div><p className="mt-3 text-xs leading-relaxed text-slate-700">{service.description || "No description provided."}</p><div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs"><div><p className="text-[10px] text-slate-400">Price</p><p className="mt-1 font-black text-slate-800">{formatPrice(service)}</p></div><div><p className="text-[10px] text-slate-400">Customization</p><p className="mt-1 font-bold text-slate-700">{service.is_customizable ? "Customizable" : "Standard"}</p></div>{service.item_type === "product" && <div><p className="text-[10px] text-slate-400">Stock</p><p className="mt-1 font-bold text-slate-700">{service.stock_qty ?? 0}</p></div>}<div><p className="text-[10px] text-slate-400">Updated</p><p className="mt-1 font-bold text-slate-700">{formatDate(service.updated_at || service.created_at)}</p></div></div>{(service.specs?.allowed_sizes?.length || service.specs?.allowed_materials?.length || service.specs?.quality_levels?.length) && <div className="mt-3 border-t border-slate-200 pt-3 text-[11px] text-slate-600"><p className="font-black uppercase tracking-[0.06em] text-slate-400">Options</p>{service.specs.allowed_sizes?.length > 0 && <p className="mt-1"><strong>Sizes:</strong> {service.specs.allowed_sizes.join(", ")}</p>}{service.specs.allowed_materials?.length > 0 && <p className="mt-1"><strong>Materials:</strong> {service.specs.allowed_materials.join(", ")}</p>}{service.specs.quality_levels?.length > 0 && <p className="mt-1"><strong>Quality:</strong> {service.specs.quality_levels.join(", ")}</p>}</div>}</article>)}</div>}<div className="mt-4"><Pager pagination={shop.servicePagination} onPageChange={onPageChange} label="Service" /></div></section>;
}

function ReviewsSection({ shop, visibility, setVisibility, reviewSort, setReviewSort, actionLoading, updateReviewVisibility, onPageChange }) {
  const reviews = shop.reviews || [];
  return <section aria-labelledby="shop-reviews-heading"><div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="shop-reviews-heading" className="text-sm font-black">Reviews for {shop.shopName}</h2><p className="mt-1 text-xs text-slate-500">Only customer reviews belonging to this shop are shown.</p></div><div className="grid grid-cols-2 gap-2 sm:w-[310px]"><label className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold normal-case tracking-normal outline-none focus:border-[#00C7C7]"><option value="ALL">All</option><option value="VISIBLE">Visible</option><option value="HIDDEN">Hidden</option></select></label><label className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Sort<select value={reviewSort} onChange={(event) => setReviewSort(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold normal-case tracking-normal outline-none focus:border-[#00C7C7]"><option value="RECENT">Most recent</option><option value="HIGHEST">Highest rated</option><option value="LOWEST">Lowest rated</option></select></label></div></div>{reviews.length === 0 ? <EmptyState icon={Eye} title={shop.totalReviewCount === 0 ? "No reviews yet" : "No reviews match this filter"} message={shop.totalReviewCount === 0 ? "This shop has not received a customer review yet." : "Try another visibility filter or sort option."} /> : <div className="space-y-3">{reviews.map((review) => <article key={review.order_id} className="border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><UserRound size={15} className="text-[#008F91]" aria-hidden="true" /><h3 className="text-sm font-black text-slate-900">{review.customer_name}</h3><span className="flex items-center gap-0.5 text-[#D1C500]" aria-label={`${review.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={13} className={star <= review.rating ? "fill-[#FFF200]" : "text-slate-300"} />)}</span><StatusBadge value={review.feedback_hidden ? "HIDDEN" : "VISIBLE"} /></div><p className="mt-3 text-xs leading-relaxed text-slate-700">{review.feedback || "No written comment provided."}</p><p className="mt-2 text-[10px] text-slate-400">Reviewed {formatDateTime(review.created_at)} · Order #{String(review.order_id || "").split("-")[0].toUpperCase()}</p>{review.item_name && <p className="mt-1 text-[10px] text-slate-500">Item: {review.item_name}</p>}</div><button type="button" onClick={() => updateReviewVisibility(review.order_id, !review.feedback_hidden)} disabled={actionLoading[review.order_id]} className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${review.feedback_hidden ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50" : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"}`}>{review.feedback_hidden ? <><Eye size={14} /> Restore</> : <><EyeOff size={14} /> Hide</>}</button></div></article>)}</div>}<div className="mt-4"><Pager pagination={shop.reviewPagination} onPageChange={onPageChange} label="Review" /></div></section>;
}

function CategorySection({ shop, categoryStatus, setCategoryStatus, actionLoading, updateCategoryStatus, onPageChange }) {
  const requests = shop.categoryApprovals || [];
  const hasCategoryApprovals = shop.totalCategoryApprovalCount > 0;
  return <section aria-labelledby="shop-category-heading"><div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="shop-category-heading" className="text-sm font-black">Category approvals for {shop.shopName}</h2><p className="mt-1 text-xs text-slate-500">Only requests belonging to this shop are shown.</p></div><label className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 sm:w-[190px]">Status<select value={categoryStatus} onChange={(event) => setCategoryStatus(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold normal-case tracking-normal outline-none focus:border-[#00C7C7]"><option value="ALL">All requests</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label></div>{requests.length === 0 ? <EmptyState icon={Tag} title={hasCategoryApprovals ? "No category requests match this filter" : "No category approvals yet"} message={hasCategoryApprovals ? "Try another category status filter." : "This shop has not submitted a category approval request."} /> : <div className="space-y-3">{requests.map((request) => <article key={request.id} className="border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Tag size={15} className="text-[#756D00]" aria-hidden="true" /><h3 className="text-sm font-black text-slate-900">{request.category_name}</h3><StatusBadge value={request.status} /></div><p className="mt-3 text-xs leading-relaxed text-slate-700">{request.reason || "No reason provided."}</p><p className="mt-2 text-[10px] text-slate-400">Requested {formatDateTime(request.created_at)}</p>{request.admin_comment && <p className="mt-2 border-l-2 border-[#EC008C] pl-2 text-[11px] text-slate-600"><strong>Admin comment:</strong> {request.admin_comment}</p>}</div>{request.status === "PENDING" && <div className="flex shrink-0 gap-2"><button type="button" onClick={() => updateCategoryStatus(request.id, "APPROVED")} disabled={actionLoading[request.id]} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button><button type="button" onClick={() => updateCategoryStatus(request.id, "REJECTED")} disabled={actionLoading[request.id]} className="rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-50">Reject</button></div>}</div></article>)}</div>}<div className="mt-4"><Pager pagination={shop.categoryPagination} onPageChange={onPageChange} label="Category request" /></div></section>;
}
