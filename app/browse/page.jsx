"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Search, Star, Loader2, Map as MapIcon, ChevronRight, Hash, Printer } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#1A1A1A] text-[#00FFFF] font-mono animate-pulse">
      <Loader2 className="animate-spin mb-4" size={40} />
      <p className="uppercase tracking-[0.3em] text-xs font-black">Initialising_CMYK_Map_Engine...</p>
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

        const reviews = b.business_reviews || [];
        const avgRating = reviews.length > 0 
          ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
          : 5.0;

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
    <div className="flex h-[calc(100vh-80px)] overflow-hidden bg-[#FDFDFD] font-sans">
      {/* ── Sidebar: Industrial Dark Theme ── */}
      <aside className="w-[420px] shrink-0 flex flex-col bg-[#1A1A1A] text-white z-10 relative border-r-8 border-[#1A1A1A]">
        
        {/* Header - CMYK Accented */}
        <div className="p-8 border-b-2 border-white/10 bg-[#1A1A1A] relative">
          <div className="absolute top-0 left-0 w-full h-1 flex">
            <div className="flex-1 bg-[#00FFFF]" />
            <div className="flex-1 bg-[#EC008C]" />
            <div className="flex-1 bg-[#FFF200]" />
          </div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Printer size={20} className="text-[#00FFFF]" />
              <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none">Find_Nodes</h1>
            </div>
            <span className="font-mono text-[9px] text-white/40 uppercase tracking-widest">v.2026</span>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00FFFF]" size={18} />
            <input
              type="text"
              className="w-full pl-12 pr-4 py-4 bg-white/5 border-2 border-white/20 text-white focus:border-[#00FFFF] focus:outline-none transition-all font-mono text-[10px] uppercase tracking-widest placeholder:text-white/20"
              placeholder="SEARCH_BY_COORD_OR_SPEC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Node List Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#1A1A1A] scrollbar-thin scrollbar-thumb-white/10">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 font-mono uppercase text-[10px] tracking-[0.3em] text-[#00FFFF]">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p>Syncing_Node_Data...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 border-2 border-dashed border-white/10 text-center font-mono text-[10px] uppercase opacity-40">
              No active nodes detected in sector.
            </div>
          ) : (
            filtered.map((b) => {
              const isSelected = selectedId === b.id;
              return (
                <div key={b.id} className="w-full">
                  <div
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left p-6 border-2 transition-all relative overflow-hidden group cursor-pointer ${
                      isSelected
                      ? "bg-white text-[#1A1A1A] border-[#00FFFF] shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] -translate-y-1"
                      : "bg-white/5 border-white/10 hover:border-white/40"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 ${isSelected ? "bg-[#EC008C]" : "bg-white/20"}`} />
                          <p className="font-mono text-[9px] uppercase tracking-widest opacity-60">
                            Node_Ref: {b.id.split('-')[0]}
                          </p>
                        </div>
                        <p className={`text-2xl font-black uppercase italic leading-none`}>
                          {b.name}
                        </p>
                      </div>
                      <ChevronRight size={24} className={`${isSelected ? "text-[#EC008C]" : "opacity-0"} transition-all`} />
                    </div>

                    <p className={`font-mono text-[9px] uppercase mb-4 tracking-tighter truncate ${isSelected ? "text-gray-500" : "text-white/40"}`}>
                      COORD // {b.address}
                    </p>

                    <div className={`flex items-center justify-between border-t pt-4 ${isSelected ? "border-black/5" : "border-white/5"}`}>
                      <span className="flex items-center gap-1 font-black text-sm italic">
                        <Star size={14} fill={isSelected ? "#EC008C" : "white"} className={isSelected ? "text-[#EC008C]" : "text-white"} />
                        {b.rating.toFixed(1)} 
                        <span className="text-[10px] opacity-40 ml-1">[{b.reviewCount}]</span>
                      </span>

                      <div className="flex gap-1 flex-wrap justify-end">
                        {b.services.map((s, idx) => (
                          <span key={idx} className={`font-mono text-[8px] px-2 py-0.5 border uppercase font-bold tracking-tighter ${
                            isSelected ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-[#1A1A1A] border-white"
                          }`}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {isSelected && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/business/${b.id}`);
                        }}
                        className="mt-6 w-full py-4 bg-[#1A1A1A] text-white font-black text-[10px] uppercase tracking-[0.3em] hover:bg-[#00FFFF] hover:text-black transition-all flex items-center justify-center gap-3 cursor-pointer"
                      >
                        Launch_Store_Interface <ChevronRight size={14} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer: CMYK Palette Ref */}
        <div className="p-5 border-t-2 border-white/10 flex justify-between items-center bg-[#000000]">
          <div className="flex gap-2">
            <div className="w-3 h-3 bg-[#00FFFF]" />
            <div className="w-3 h-3 bg-[#EC008C]" />
            <div className="w-3 h-3 bg-[#FFF200]" />
          </div>
          <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#00FFFF]">
            {filtered.length}_Nodes_Linked
          </span>
        </div>
      </aside>

      {/* ── Map ── */}
      <div className="flex-1 relative border-l-4 border-[#1A1A1A] z-0">
        <MapComponent businesses={filtered} selectedBusinessId={selectedId} />

        {/* Floating Sector Label */}
        <div className="absolute top-6 right-6 z-10 bg-[#1A1A1A] text-white px-5 py-3 font-black italic uppercase tracking-widest text-xs flex items-center gap-3 shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
          <MapIcon size={18} className="text-[#00FFFF]" /> 
          Live_Sector_Grid.obj
        </div>
      </div>
    </div>
  );
}