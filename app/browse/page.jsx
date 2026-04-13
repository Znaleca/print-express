"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Search, Star, Loader2, Map as MapIcon, ChevronRight, Hash } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#EBEBE8] text-black font-mono animate-pulse">
      <Loader2 className="animate-spin mb-2" size={32} />
      <p className="uppercase tracking-widest text-sm">Initializing_Map_Engine...</p>
    </div>
  ),
});

export default function BrowsePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBusinesses() {
      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select(`
          id, name, address, lat, lng,
          services ( name, category, available ),
          business_reviews ( rating )
        `)
        .eq("status", "APPROVED");

      if (bizError) {
        console.error("Error loading businesses:", bizError);
        setLoading(false);
        return;
      }

      const formatted = (bizData || []).map((b) => {
        const availableServices = (b.services || [])
          .filter(s => s.available)
          .map(s => s.name);

        // Compute rating logic from public view
        const reviews = b.business_reviews || [];
        const avgRating = reviews.length > 0 
          ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
          : 5.0; // Failback to 5.0 if no reviews yet

        return {
          id: b.id,
          name: b.name || "UNNAMED_UNIT",
          address: b.address || "LOC_UNKNOWN",
          lat: parseFloat(b.lat) || 14.6806,
          lng: parseFloat(b.lng) || 120.5375,
          rating: parseFloat(avgRating),
          reviewCount: reviews.length,
          services: availableServices.slice(0, 3)
        };
      });

      setBusinesses(formatted);
      setLoading(false);
    }

    loadBusinesses();
  }, []);

  const filtered = businesses.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.services.some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
      b.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden bg-[#F4F4F1] font-sans">
      {/* ── Sidebar ── */}
      <aside className="w-[420px] shrink-0 flex flex-col bg-white border-r-4 border-black z-10 relative">
        {/* Header */}
        <div className="p-6 border-b-4 border-black bg-white">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 bg-[#FF3E00] rotate-45" />
            <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none">Find_Nodes</h1>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black z-10" size={18} />
            <input
              type="text"
              className="w-full pl-12 pr-4 py-4 border-2 border-black bg-[#F4F4F1] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#FFF200] transition-all font-mono text-xs uppercase tracking-widest placeholder:text-zinc-400"
              placeholder="SEARCH_BY_ID_OR_SERVICE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Business list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#EBEBE8]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-black font-mono uppercase text-xs opacity-50">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p>Syncing_Database...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-black/20 text-center font-mono text-xs uppercase opacity-40">
              No active nodes found in this sector.
            </div>
          ) : (
            filtered.map((b) => {
              const isSelected = selectedId === b.id;
              return (
                <div key={b.id} className="w-full">
                  {/* Outer Card: Changed to div with onClick to avoid button nesting error */}
                  <div
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left p-5 border-2 border-black transition-all relative overflow-hidden group cursor-pointer ${isSelected
                      ? "bg-black text-white shadow-[8px_8px_0px_0px_rgba(255,62,0,1)] -translate-y-1 -translate-x-1"
                      : "bg-white hover:bg-[#FFF200]/10 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className={`text-xl font-black uppercase italic leading-none ${isSelected ? "text-white" : "text-black"}`}>
                        {b.name}
                      </p>
                      <ChevronRight size={20} className={`${isSelected ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"} transition-all`} />
                    </div>

                    <div className="flex items-center gap-1 font-mono text-[10px] uppercase opacity-60 mb-4 tracking-tighter">
                      <Hash size={10} /> {b.id.split('-')[0]} // {b.address}
                    </div>

                    <div className="flex items-center justify-between border-t border-black/10 pt-4">
                      <span className={`flex items-center gap-1 font-black text-sm italic ${isSelected ? "text-[#FFF200]" : "text-black"}`}>
                        <Star size={14} fill="currentColor" /> {b.rating.toFixed(1)} <span className="text-[10px] opacity-70 ml-1">({b.reviewCount})</span>
                      </span>

                      <div className="flex gap-1 flex-wrap justify-end">
                        {b.services.map((s, idx) => (
                          <span key={idx} className={`font-mono text-[9px] px-2 py-0.5 border uppercase tracking-tighter ${isSelected ? "bg-white text-black border-white" : "bg-black text-white border-black"
                            }`}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Inner Action: Changed to div with stopPropagation to handle navigation */}
                    {isSelected && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/business/${b.id}`);
                        }}
                        className="mt-4 w-full py-3 bg-[#FFF200] text-black border-2 border-black font-mono text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        role="button"
                        tabIndex={0}
                      >
                        Access_Node_Store <ChevronRight size={14} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t-4 border-black bg-black text-[#F4F4F1] font-mono text-[9px] uppercase tracking-[0.2em] flex justify-between">
          <span>Active_Nodes: {filtered.length}</span>
          <span className="animate-pulse">System_Ready</span>
        </div>
      </aside>

      {/* ── Map ── */}
      <div className="flex-1 relative border-l-4 border-black z-0">
        <MapComponent businesses={filtered} selectedBusinessId={selectedId} />

        {/* Floating Map Label */}
        <div className="absolute top-6 right-6 z-10 bg-black text-white px-4 py-2 font-black italic uppercase tracking-widest text-sm flex items-center gap-2 shadow-[6px_6px_0px_0px_rgba(255,242,0,1)]">
          <MapIcon size={18} className="text-[#FFF200]" /> Sector_View.obj
        </div>
      </div>
    </div>
  );
}