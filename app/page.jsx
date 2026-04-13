"use client";

import Link from "next/link";
import { Sparkles, MapPin, FileUp, CreditCard, ShieldCheck, ArrowRight, Printer } from "lucide-react";

const features = [
  {
    icon: <MapPin size={24} />,
    title: "Location Discovery",
    desc: "Find printing shops in your neighborhood with our interactive map. Compare ratings instantly.",
    color: "border-[#00FFFF]", // Cyan
    hover: "group-hover:bg-[#00FFFF]"
  },
  {
    icon: <FileUp size={24} />,
    title: "Seamless Proofing",
    desc: "Upload designs, track version history, and approve proofs directly on the platform.",
    color: "border-[#EC008C]", // Magenta
    hover: "group-hover:bg-[#EC008C]"
  },
  {
    icon: <CreditCard size={24} />,
    title: "Secure Payments",
    desc: "Complete transactions securely via digital e-wallets or pay in-store upon pickup.",
    color: "border-[#FFF200]", // Yellow
    hover: "group-hover:bg-[#FFF200]"
  },
  {
    icon: <ShieldCheck size={24} />,
    title: "Verified Partners",
    desc: "Every printing business is manually verified by our team, ensuring quality service.",
    color: "border-[#1A1A1A]", // Black
    hover: "group-hover:bg-[#1A1A1A]"
  },
];

export default function Home() {
  return (
    <main className="bg-[#FDFDFD] text-[#1A1A1A] overflow-x-hidden">
      {/* HERO SECTION */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20 border-b-8 border-[#1A1A1A]">
        
        {/* CMYK Abstract Corners */}
        <div className="absolute top-0 left-0 w-16 h-16 bg-[#00FFFF] opacity-20" />
        <div className="absolute top-0 right-0 w-16 h-16 bg-[#EC008C] opacity-20" />
        <div className="absolute bottom-0 left-0 w-16 h-16 bg-[#FFF200] opacity-20" />

        <div className="relative z-10 max-w-6xl mx-auto text-center">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-3 px-6 py-2 mb-12 border-4 border-[#1A1A1A] bg-white font-mono text-[11px] font-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(236,0,140,1)]">
            <span className="flex gap-1">
              <span className="w-2 h-2 bg-[#00FFFF]" />
              <span className="w-2 h-2 bg-[#EC008C]" />
              <span className="w-2 h-2 bg-[#FFF200]" />
            </span>
            System_Online // All_Inks_Loaded
          </div>

          {/* Headline - Increased leading to prevent overlap */}
          <h1 className="font-black text-5xl md:text-7xl lg:text-9xl tracking-tighter uppercase italic leading-[1.1] mb-12">
            Welcome to <br />
            <span className="relative inline-block">
              <span className="relative z-10 bg-[#1A1A1A] text-white px-6 py-2 not-italic">Press & Present</span>
              <span className="absolute -bottom-3 -right-3 w-full h-full border-4 border-[#00FFFF] -z-10" />
            </span>
          </h1>

          {/* Subtitle - Increased bottom margin and line height */}
          <p className="text-lg md:text-2xl font-bold max-w-3xl mx-auto mb-16 leading-relaxed uppercase opacity-90 px-4">
            The industrial hub for local production. Connect with shops, 
            manage assets, and verify proofs in high resolution.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            <Link
              href="/browse"
              className="group w-full sm:w-auto px-12 py-6 bg-[#1A1A1A] text-white font-black text-xl uppercase tracking-tighter flex items-center justify-center gap-4 hover:bg-[#00FFFF] hover:text-[#1A1A1A] transition-all shadow-[10px_10px_0px_0px_rgba(0,255,255,1)] active:shadow-none active:translate-x-1 active:translate-y-1"
            >
              Start Browsing <ArrowRight className="group-hover:translate-x-2 transition-transform" />
            </Link>
            
            <Link
              href="/signup"
              className="w-full sm:w-auto px-12 py-6 bg-white border-4 border-[#1A1A1A] text-[#1A1A1A] font-black text-xl uppercase tracking-tighter hover:bg-[#EC008C] hover:text-white hover:border-[#EC008C] transition-all shadow-[10px_10px_0px_0px_rgba(236,0,140,1)] active:shadow-none"
            >
              Partner Signup
            </Link>
          </div>
        </div>
      </section>

      {/* MULTI-COLOR MARQUEE */}
      <div className="bg-[#1A1A1A] py-6 border-b-4 border-[#1A1A1A]">
        <div className="flex whitespace-nowrap overflow-hidden font-mono text-sm font-black uppercase tracking-[0.5em]">
          <div className="flex animate-marquee">
            {[...Array(10)].map((_, i) => (
              <span key={i} className="mx-8 flex items-center gap-6">
                <span className="text-[#00FFFF]">Cyan</span>
                <span className="text-[#EC008C]">Magenta</span>
                <span className="text-[#FFF200]">Yellow</span>
                <span className="text-white">Black</span>
                <Printer size={18} className="text-white" />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* FEATURES SECTION */}
      <section className="py-32 px-6 lg:px-12 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 mb-24 items-end">
          <div>
            <h2 className="text-6xl md:text-8xl font-black uppercase leading-[0.9] tracking-tighter mb-8">
              Full Spectrum <br /> Production
            </h2>
            <div className="flex h-4 w-full max-w-md">
              <div className="flex-1 bg-[#00FFFF]" />
              <div className="flex-1 bg-[#EC008C]" />
              <div className="flex-1 bg-[#FFF200]" />
              <div className="flex-1 bg-[#1A1A1A]" />
            </div>
          </div>
          <p className="font-mono text-sm md:text-base uppercase leading-loose text-gray-600 border-l-8 border-[#1A1A1A] pl-8">
            // Unified workflow architecture. <br />
            // Real-time status tracking. <br />
            // Industry standard color matching.
          </p>
        </div>

        {/* Feature Grid with distinct CMYK borders to prevent overlap feeling */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className={`group p-10 bg-white border-4 border-[#1A1A1A] ${f.color} transition-all hover:-translate-y-2 shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col h-full`}
            >
              <div className={`w-16 h-16 flex items-center justify-center bg-[#1A1A1A] text-white mb-10 transition-colors ${f.hover}`}>
                {f.icon}
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight mb-6 leading-tight min-h-[3rem]">
                {f.title}
              </h3>
              <p className="font-mono text-xs uppercase leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#1A1A1A] text-white py-16 px-8 border-t-8 border-[#EC008C]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
          <div>
            <h4 className="text-4xl font-black uppercase italic tracking-tighter mb-2">
              Press <span className="text-[#00FFFF]">&</span> Present
            </h4>
            <p className="font-mono text-[10px] tracking-widest opacity-40 uppercase">
              Production Grade Portal // Est. 2026
            </p>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 border-2 border-[#00FFFF] flex items-center justify-center text-[#00FFFF] hover:bg-[#00FFFF] hover:text-black transition-all cursor-pointer font-bold">C</div>
              <div className="w-10 h-10 border-2 border-[#EC008C] flex items-center justify-center text-[#EC008C] hover:bg-[#EC008C] hover:text-white transition-all cursor-pointer font-bold">M</div>
              <div className="w-10 h-10 border-2 border-[#FFF200] flex items-center justify-center text-[#FFF200] hover:bg-[#FFF200] hover:text-black transition-all cursor-pointer font-bold">Y</div>
              <div className="w-10 h-10 border-2 border-white flex items-center justify-center text-white hover:bg-white hover:text-black transition-all cursor-pointer font-bold">K</div>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.4em] opacity-30">
              Validated // Secure_Access_Only
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}