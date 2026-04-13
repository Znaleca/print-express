"use client";

import Link from "next/link";
import { Sparkles, MapPin, FileUp, CreditCard, ShieldCheck, ArrowRight, Printer } from "lucide-react";

const features = [
  {
    icon: <MapPin size={24} />,
    title: "Location Discovery",
    desc: "Find printing shops in your neighborhood with our interactive map. Compare ratings instantly.",
  },
  {
    icon: <FileUp size={24} />,
    title: "Seamless Proofing",
    desc: "Upload designs, track version history, and approve proofs directly on the platform.",
  },
  {
    icon: <CreditCard size={24} />,
    title: "Secure Payments",
    desc: "Complete transactions securely via digital e-wallets or pay in-store upon pickup.",
  },
  {
    icon: <ShieldCheck size={24} />,
    title: "Verified Partners",
    desc: "Every printing business is manually verified by our team, ensuring quality service.",
  },
];

export default function Home() {
  return (
    <main className="bg-[#F4F4F1] text-[#1A1A1A]">
      {/* HERO SECTION */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 py-24 border-b-4 border-[#1A1A1A] overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-10 left-10 w-32 h-32 border-4 border-[#1A1A1A] opacity-10 -rotate-12 pointer-events-none hidden lg:block" />
        <div className="absolute bottom-20 right-10 w-64 h-64 bg-[#FFF200] opacity-20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Brutalist Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1 mb-10 border-2 border-[#1A1A1A] bg-white font-mono text-[10px] uppercase tracking-[0.2em] font-black shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <Sparkles size={14} className="text-[#FF3E00]" /> 
            Protocol v.2.0 Active
          </div>

          {/* Headline - Adjusted tracking and leading to prevent overlap */}
          <h1 className="font-black text-6xl md:text-8xl tracking-tight uppercase italic leading-[1.1] mb-10">
            The New Standard <br />
            <span className="bg-[#1A1A1A] text-[#F4F4F1] px-4 not-italic">For Ink & Paper</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl font-medium max-w-2xl mx-auto mb-14 leading-snug uppercase opacity-80">
            Connect with top-rated printers, upload designs, and 
            manage production from a single industrial dashboard.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link
              href="/browse"
              className="group relative px-10 py-5 bg-[#1A1A1A] text-white font-bold text-xl uppercase tracking-tight flex items-center gap-3 hover:bg-[#FF3E00] transition-all shadow-[8px_8px_0px_0px_rgba(255,62,0,0.3)] active:shadow-none active:translate-x-1 active:translate-y-1"
            >
              Browse Printers <ArrowRight className="group-hover:translate-x-2 transition-transform" />
            </Link>
            
            <Link
              href="/signup"
              className="px-10 py-5 bg-transparent border-4 border-[#1A1A1A] text-[#1A1A1A] font-bold text-xl uppercase tracking-tight hover:bg-[#1A1A1A] hover:text-white transition-all"
            >
              Become Partner
            </Link>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <div className="bg-[#1A1A1A] text-[#F4F4F1] py-5 overflow-hidden border-b-4 border-[#1A1A1A]">
        <div className="flex whitespace-nowrap animate-marquee font-mono text-xs uppercase tracking-[0.4em]">
          {[...Array(10)].map((_, i) => (
            <span key={i} className="mx-12 flex items-center gap-4">
              <Printer size={14} /> Global Printing Network 2026
            </span>
          ))}
        </div>
      </div>

      {/* FEATURES SECTION */}
      <section className="py-24 px-8 w-full">
        <div className="flex flex-col lg:flex-row justify-between items-start gap-12 mb-20">
          <div className="max-w-xl">
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tight leading-tight mb-6">
              Full Spectrum <br /> Production
            </h2>
            <div className="w-24 h-4 bg-[#FF3E00]" />
          </div>
          <p className="max-w-md font-mono text-sm uppercase leading-relaxed text-gray-500">
            // From asset discovery to final delivery. <br />
            // Our platform synchronizes the entire professional print workflow
            for both designers and shop owners.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-4 border-[#1A1A1A]">
          {features.map((f, index) => (
            <div
              key={f.title}
              className={`group p-10 bg-white border-[#1A1A1A] transition-all hover:bg-[#1A1A1A] hover:text-white 
                ${index !== features.length - 1 ? "lg:border-r-4" : ""} 
                ${index < 2 ? "border-b-4 lg:border-b-0" : "md:border-b-4 lg:border-b-0"}
                border-b-4 lg:border-b-0`}
            >
              <div className="w-14 h-14 flex items-center justify-center bg-[#FF3E00] text-white mb-8 group-hover:rotate-12 transition-transform">
                {f.icon}
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight mb-4 italic leading-tight">
                {f.title}
              </h3>
              <p className="font-mono text-xs uppercase leading-relaxed opacity-60 group-hover:opacity-100">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* DECORATIVE FOOTER ACCENT */}
      <div className="h-24 bg-[#1A1A1A] flex items-center justify-between px-8">
        <div className="flex gap-3">
            <div className="w-5 h-5 bg-[#00A8E8]" /> 
            <div className="w-5 h-5 bg-[#EC008C]" /> 
            <div className="w-5 h-5 bg-[#FFF200]" /> 
        </div>
        <span className="font-mono text-[10px] text-white uppercase tracking-[0.3em] opacity-50">
          End of Transmission // 2026
        </span>
      </div>
    </main>
  );
}