"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Printer,
  ShieldCheck,
  Store,
  Truck,
  FileText,
  Layers,
  Tag,
  ShoppingBag,
  FileUp,
} from "lucide-react";

// ── REUSABLE PRINT-BRAND DECORATIVE SVG COMPONENTS ──

function CropMarks({ className = "w-8 h-8 text-[#00FFFF]/40" }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M 2 12 L 12 12 L 12 2" />
      <path d="M 28 2 L 28 12 L 38 12" />
      <path d="M 2 28 L 12 28 L 12 38" />
      <path d="M 38 28 L 28 28 L 28 38" />
    </svg>
  );
}

function PrintScribble({ className = "w-48 h-4 text-[#00FFFF]" }) {
  return (
    <svg viewBox="0 0 200 20" className={className} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
      <path d="M 5 12 Q 50 3 100 12 T 195 10" />
    </svg>
  );
}

function DotGrid({ className = "w-28 h-28 text-white/10" }) {
  return (
    <svg viewBox="0 0 80 80" className={className} fill="currentColor">
      <circle cx="10" cy="10" r="2.5" />
      <circle cx="30" cy="10" r="2.5" />
      <circle cx="50" cy="10" r="2.5" />
      <circle cx="70" cy="10" r="2.5" />
      <circle cx="10" cy="30" r="2.5" />
      <circle cx="30" cy="30" r="2.5" />
      <circle cx="50" cy="30" r="2.5" />
      <circle cx="70" cy="30" r="2.5" />
      <circle cx="10" cy="50" r="2.5" />
      <circle cx="30" cy="50" r="2.5" />
      <circle cx="50" cy="50" r="2.5" />
      <circle cx="70" cy="50" r="2.5" />
      <circle cx="10" cy="70" r="2.5" />
      <circle cx="30" cy="70" r="2.5" />
      <circle cx="50" cy="70" r="2.5" />
      <circle cx="70" cy="70" r="2.5" />
    </svg>
  );
}

function CMYKStrip({ className = "" }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="h-3 w-3 rounded-full bg-[#00FFFF]" title="Cyan" />
      <span className="h-3 w-3 rounded-full bg-[#EC008C]" title="Magenta" />
      <span className="h-3 w-3 rounded-full bg-[#FFF200]" title="Yellow" />
      <span className="h-3 w-3 rounded-full bg-[#1A1A1A]" title="Key Black" />
    </div>
  );
}

function RegistrationMark({ className = "w-10 h-10 text-[#00FFFF]/40" }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="20" cy="20" r="12" />
      <circle cx="20" cy="20" r="6" />
      <line x1="20" y1="2" x2="20" y2="38" />
      <line x1="2" y1="20" x2="38" y2="20" />
    </svg>
  );
}

function CurvedDrawnArrow({ className = "w-24 h-24 text-[#FFF200]" }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M 15 25 Q 65 10 75 55 T 45 80" />
      <path d="M 35 70 L 45 80 L 58 72" />
    </svg>
  );
}

function LoopingDrawnArrow({ className = "w-28 h-20 text-[#EC008C]" }) {
  return (
    <svg viewBox="0 0 120 80" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M 10 60 Q 40 10 70 35 T 100 65" />
      <path d="M 88 55 L 100 65 L 105 50" />
    </svg>
  );
}

// ── DATA CONFIGURATIONS ──

const workSteps = [
  {
    num: "01",
    title: "Find a shop",
    desc: "Discover trusted print providers nearby. Compare services, turnaround times, and verified ratings.",
    icon: MapPin,
    badgeBg: "bg-[#00FFFF] text-[#1A1A1A]",
  },
  {
    num: "02",
    title: "Send your design",
    desc: "Message shop owners directly, upload artwork files, and confirm digital proofs before printing.",
    icon: MessageSquare,
    badgeBg: "bg-[#EC008C] text-white",
  },
  {
    num: "03",
    title: "Place & track order",
    desc: "Pay your downpayment online, watch real-time order status, and choose pickup or delivery.",
    icon: Truck,
    badgeBg: "bg-[#FFF200] text-[#1A1A1A]",
  },
];

const printServices = [
  {
    name: "Business Cards",
    desc: "Matte, glossy, or textured cardstock with clean die-cut finishes.",
    badgeClass: "bg-cyan-100 text-cyan-800 border border-cyan-200/80",
    tag: "350gsm Stock",
    href: "/browse?category=cards",
  },
  {
    name: "Flyers & Brochures",
    desc: "Vibrant full-color promotional flyers, bi-fold, and tri-fold prints.",
    badgeClass: "bg-pink-100 text-pink-800 border border-pink-200/80",
    tag: "High Volume",
    href: "/browse?category=flyers",
  },
  {
    name: "Posters & Tarpaulins",
    desc: "Heavy-duty outdoor vinyl banners, eyeleted posters, and signage.",
    badgeClass: "bg-amber-100 text-amber-800 border border-amber-200/80",
    tag: "Outdoor Grade",
    href: "/browse?category=banners",
  },
  {
    name: "Stickers & Labels",
    desc: "Custom die-cut vinyl stickers, product labels, and packaging seals.",
    badgeClass: "bg-slate-200 text-slate-800 border border-slate-300/80",
    tag: "Waterproof",
    href: "/browse?category=stickers",
  },
  {
    name: "Shirts & Merchandise",
    desc: "DTF apparel printing, screen printing, and customized event shirts.",
    badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-200/80",
    tag: "Custom Merch",
    href: "/browse?category=apparel",
  },
  {
    name: "Invitations & Stationery",
    desc: "Event invitation cards, official documents, and custom binding.",
    badgeClass: "bg-purple-100 text-purple-800 border border-purple-200/80",
    tag: "Specialty Print",
    href: "/browse?category=stationery",
  },
];

export default function Home() {
  return (
    <main className="home-page min-h-screen bg-[#1A1A1A] text-white font-sans selection:bg-[#00FFFF] selection:text-[#1A1A1A] overflow-x-hidden relative">

      {/* ── 1. HERO SECTION (MINIMAL HIGH-IMPACT CANVAS) ── */}
      <section className="relative min-h-[calc(100vh-88px)] flex flex-col justify-between px-4 sm:px-6 md:px-10 lg:px-14 pt-10 pb-12 bg-[#1A1A1A] overflow-hidden border-b border-white/10">

        {/* Decorative Background Drawings & Print Marks */}
        <div className="absolute top-10 left-8 hidden lg:block opacity-30 pointer-events-none">
          <CropMarks className="w-10 h-10 text-[#00FFFF]" />
        </div>
        <div className="absolute top-10 right-8 hidden lg:block opacity-30 pointer-events-none">
          <CropMarks className="w-10 h-10 text-[#EC008C]" />
        </div>
        <div className="absolute bottom-20 left-8 hidden lg:block opacity-30 pointer-events-none">
          <CropMarks className="w-12 h-12 text-[#FFF200]" />
        </div>
        <div className="absolute bottom-20 right-8 hidden lg:block opacity-30 pointer-events-none">
          <DotGrid className="w-36 h-36 text-white/15" />
        </div>

        {/* Print Registration Crosshair Targets */}
        <div className="absolute top-16 left-1/6 hidden xl:block opacity-35 pointer-events-none">
          <RegistrationMark className="w-12 h-12 text-[#00FFFF]" />
        </div>
        <div className="absolute bottom-24 right-1/6 hidden xl:block opacity-35 pointer-events-none">
          <RegistrationMark className="w-12 h-12 text-[#EC008C]" />
        </div>

        {/* Floating Architectural Paper Outlines */}
        <div className="absolute top-16 right-1/4 w-72 h-96 rounded-3xl border border-white/10 transform rotate-12 pointer-events-none hidden lg:block" />
        <div className="absolute bottom-16 left-1/4 w-80 h-56 rounded-3xl border border-white/10 transform -rotate-6 pointer-events-none hidden lg:block" />

        {/* Hero Content */}
        <div className="max-w-[1600px] mx-auto w-full flex-1 flex flex-col justify-center items-center text-center space-y-5 relative z-10 my-auto py-6 sm:py-8">

          {/* Centered Headline (Smaller & Balanced) */}
          <div className="space-y-2 max-w-3xl">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              FIND PRINT SHOPS.
            </h1>
            <div className="relative inline-block">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-[#00FFFF] leading-tight">
                SEND DESIGNS.
              </h1>
              <PrintScribble className="w-full h-3 text-[#EC008C] absolute -bottom-1.5 left-0" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-[#FFF200] leading-tight">
              TRACK ORDERS.
            </h1>
          </div>

          {/* Supporting Paragraph (Smaller & Clean) */}
          <p className="max-w-xl text-sm sm:text-base font-normal leading-relaxed text-white/80 pt-1">
            Press & Present connects customers with verified local printing shops for quick price quotes, digital artwork proofing, online orders, and live tracking.
          </p>

          {/* Dual Action Buttons (No Icon Clutter) */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-3 w-full max-w-md">
            <Link
              href="/browse"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#00FFFF] hover:bg-[#FFF200] text-[#1A1A1A] px-8 py-3.5 text-sm font-extrabold transition-all shadow-md group"
            >
              Browse Print Shops
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 hover:bg-white hover:text-[#1A1A1A] text-white px-8 py-3.5 text-sm font-extrabold backdrop-blur-md transition-all shadow-xs"
            >
              Register Your Shop
            </Link>
          </div>

        </div>

        {/* Hero Footer Bar */}
        <div className="max-w-[1600px] mx-auto w-full pt-5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/60 font-semibold relative z-10">
          <div className="flex items-center gap-3">
            <span className="text-white/40 uppercase tracking-widest text-[10px] font-mono">Print Standards</span>
            <CMYKStrip />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-white/80">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FFFF]" /> Verified Local Shops
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EC008C]" /> Instant Artwork Proofing
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFF200]" /> Real-Time Order Status
            </span>
          </div>
        </div>

      </section>

      {/* ── 2. SERVICES SECTION (DE-CARDIFIED UN-BOXED HORIZONTAL LIST) ── */}
      <section className="bg-[#F6F6F2] text-[#1A1A1A] px-4 sm:px-6 md:px-10 lg:px-14 py-12 sm:py-16 border-b border-stone-300/40 relative">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* Left Column: Sticky Section Header */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-28">
            <div className="space-y-3">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#1A1A1A] tracking-tight leading-tight">
                Print services for everyday needs & business projects.
              </h2>
            </div>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-md font-medium">
              Select custom materials, compare turnaround times, and request digital proofs directly from local print specialists.
            </p>

            <div className="pt-2">
              <Link
                href="/browse"
                className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] hover:bg-[#EC008C] text-white px-7 py-3.5 text-xs font-extrabold transition-all shadow-sm group"
              >
                Browse All Categories
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Right Column: Clean Un-cluttered Horizontal Rows */}
          <div className="lg:col-span-7 divide-y divide-stone-300/60">
            {printServices.map((service) => (
              <Link
                key={service.name}
                href={service.href}
                className="py-4 sm:py-5 flex items-center justify-between gap-4 group px-3.5 -mx-3.5 rounded-2xl hover:bg-stone-200/60 transition-all cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-base sm:text-lg font-extrabold text-[#1A1A1A] group-hover:text-[#EC008C] transition-colors">
                      {service.name}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${service.badgeClass}`}>
                      {service.tag}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {service.desc}
                  </p>
                </div>

                <div className="p-2 rounded-full text-slate-400 group-hover:text-[#EC008C] group-hover:translate-x-1 transition-all shrink-0">
                  <ArrowRight size={18} />
                </div>
              </Link>
            ))}
          </div>

        </div>
      </section>

      {/* ── 3. HOW IT WORKS SECTION (CONNECTED FLOW PROCESS) ── */}
      <section className="bg-[#1A1A1A] text-white px-4 sm:px-6 md:px-10 lg:px-14 py-12 sm:py-16 border-b border-white/10 relative overflow-hidden">
        <div className="max-w-[1600px] mx-auto space-y-10 relative z-10">

          <div className="space-y-3 text-left sm:text-center max-w-3xl mx-auto">

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
              A simpler way to handle custom print orders.
            </h2>
          </div>

          {/* Connected Flow Steps (Un-boxed horizontal process timeline) */}
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">

            {/* Horizontal Connector Line (Desktop) */}
            <div className="hidden md:block absolute top-7 left-1/6 right-1/6 border-t-2 border-dashed border-white/15 z-0" />

            {workSteps.map((step) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={step.num}
                  className="space-y-4 relative z-10 flex flex-col items-start md:items-center text-left md:text-center group"
                >
                  {/* Step Number & Icon Circle Badge */}
                  <div className="flex items-center gap-3 md:flex-col md:gap-4">
                    <div className={`w-14 h-14 rounded-full ${step.badgeBg} flex items-center justify-center font-black text-lg shadow-md group-hover:scale-110 transition-transform`}>
                      <StepIcon size={24} />
                    </div>
                    <span className="text-xs font-mono font-bold text-white/50 tracking-wider">
                      STEP {step.num}
                    </span>
                  </div>

                  <h3 className="text-xl font-extrabold text-white pt-1">{step.title}</h3>
                  <p className="text-xs sm:text-sm text-white/70 leading-relaxed font-normal max-w-xs">
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ── 4. CUSTOMER / SHOP OWNER VALUE SPLIT ── */}
      <section className="px-4 sm:px-6 md:px-10 lg:px-14 py-12 sm:py-16 border-b border-stone-300/40 bg-[#F6F6F2]">
        <div className="max-w-[1600px] mx-auto space-y-8">

          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl font-black text-[#1A1A1A] tracking-tight">
              Designed for print customers & shop owners.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* Customer Panel */}
            <div className="p-8 sm:p-10 rounded-3xl border border-stone-300/60 bg-[#ECECE8] space-y-6 flex flex-col justify-between relative overflow-hidden">
              <div className="space-y-5">
                <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-stone-300/80 text-[#1A1A1A] text-xs font-extrabold uppercase tracking-wider">
                  For Print Customers
                </div>
                <h3 className="text-2xl font-black text-[#1A1A1A] tracking-tight">Order prints with total confidence.</h3>
                <p className="text-xs sm:text-sm text-[#1A1A1A]/70 leading-relaxed">
                  Discover local print shops, send design files, receive instant price quotes, and track your print job from paper stock prep to delivery.
                </p>
                <ul className="space-y-3 text-xs sm:text-sm font-semibold text-[#1A1A1A]/85">
                  <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[#EC008C] shrink-0" /> Search verified local print providers</li>
                  <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[#EC008C] shrink-0" /> Direct owner chat & digital artwork proofing</li>
                  <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[#EC008C] shrink-0" /> Secure online downpayment & live order tracking</li>
                </ul>
              </div>

              <div className="pt-6 border-t border-stone-300/60">
                <Link
                  href="/browse"
                  className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] hover:bg-[#EC008C] text-white px-6 py-3.5 text-xs font-extrabold transition-all group shadow-sm"
                >
                  Browse print shops
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

            {/* Shop Owner Panel */}
            <div className="p-8 sm:p-10 rounded-3xl border border-white/10 bg-[#1A1A1A] text-white space-y-6 flex flex-col justify-between relative overflow-hidden">
              <div className="space-y-5">
                <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-white/15 text-[#FFF200] text-xs font-extrabold uppercase tracking-wider">
                  For Print Shop Owners
                </div>
                <h3 className="text-2xl font-black text-white tracking-tight">Grow your print shop online.</h3>
                <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
                  List your printing services, manage customer artwork files, issue quotes, accept online downpayments, and manage shop orders in one place.
                </p>
                <ul className="space-y-3 text-xs sm:text-sm font-semibold text-white/85">
                  <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FFF200] shrink-0" /> Showcase your services, stock & custom pricing</li>
                  <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FFF200] shrink-0" /> Streamline customer messaging & file approvals</li>
                  <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FFF200] shrink-0" /> Receive order notifications & downpayment proofs</li>
                </ul>
              </div>

              <div className="pt-6 border-t border-white/10">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-[#EC008C] hover:bg-[#d0007b] text-white px-6 py-3.5 text-xs font-extrabold transition-all group shadow-sm"
                >
                  Register your shop
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ── 5. FINAL CTA BANNER ── */}
      <section className="bg-[#F6F6F2] text-white px-4 sm:px-6 md:px-10 lg:px-14 py-12 sm:py-16 relative overflow-hidden">
        <div className="max-w-[1600px] mx-auto border border-white/10 rounded-3xl p-6 sm:p-10 text-center space-y-5 relative overflow-hidden bg-[#1A1A1A] shadow-xl">

          {/* Top CMYK Stripe */}
          <div className="absolute top-0 inset-x-0 h-1.5 grid grid-cols-4">
            <div className="bg-[#00FFFF]" />
            <div className="bg-[#EC008C]" />
            <div className="bg-[#FFF200]" />
            <div className="bg-white" />
          </div>

          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white max-w-xl mx-auto pt-2">
            Start your next print order today
          </h2>

          <p className="text-xs sm:text-sm text-white/70 max-w-lg mx-auto leading-relaxed">
            Connect with local print providers nearby or create a business account to accept orders online.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <Link
              href="/browse"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#00FFFF] hover:bg-[#FFF200] text-[#1A1A1A] px-8 py-4 text-sm font-extrabold transition-all group"
            >
              Browse shops
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 hover:bg-white hover:text-[#1A1A1A] text-white px-8 py-4 text-sm font-extrabold backdrop-blur-sm transition-all"
            >
              Create account
            </Link>
          </div>

        </div>
      </section>

    </main>
  );
}
