'use client';

import { usePathname } from "next/navigation";
import { FaFacebookF, FaInstagram, FaYoutube } from 'react-icons/fa';
import { SiTiktok } from 'react-icons/si';
import { ArrowUpRight } from "lucide-react";
import Link from 'next/link';

function CropMarks({ className = "w-8 h-8 text-[#00FFFF]/30" }) {
    return (
        <svg viewBox="0 0 40 40" className={className} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M 2 12 L 12 12 L 12 2" />
            <path d="M 28 2 L 28 12 L 38 12" />
            <path d="M 2 28 L 12 28 L 12 38" />
            <path d="M 38 28 L 28 28 L 28 38" />
        </svg>
    );
}

function CMYKBar() {
    return (
        <div className="cmyk-bar" aria-hidden="true">
            <div />
            <div />
            <div />
            <div />
        </div>
    );
}

export default function Footer() {
    const pathname = usePathname();

    // Owner and admin portals have their own navigation and should stay separate from
    // the public customer experience.
    if (pathname?.startsWith("/owner") || pathname?.startsWith("/admin") || pathname === "/messages") return null;

    const socialLinks = [
        { icon: <FaFacebookF size={14} />, label: 'Facebook', href: '#' },
        { icon: <FaInstagram size={14} />, label: 'Instagram', href: '#' },
        { icon: <SiTiktok size={14} />, label: 'TikTok', href: '#' },
        { icon: <FaYoutube size={14} />, label: 'YouTube', href: '#' },
    ];

    const exploreLinks = [
        { name: "Browse Services", href: "/browse" },
        { name: "Print Shops Directory", href: "/shops" },
        { name: "Track Order", href: "/track" },
    ];

    const partnerLinks = [
        { name: "Register Shop", href: "/signup" },
        { name: "Owner Login", href: "/login" },
    ];

    return (
        <footer className="bg-[#121212] text-white pt-10 pb-8 px-4 sm:px-8 lg:px-12 relative overflow-hidden border-t border-white/10">
            {/* Top Signature CMYK Accent Bar */}
            <div className="absolute top-0 left-0 right-0">
                <CMYKBar />
            </div>

            {/* Subtle Print Decorative Mark */}
            <div className="absolute bottom-8 right-8 hidden md:block opacity-15 pointer-events-none">
                <CropMarks className="w-10 h-10 text-[#FFF200]" />
            </div>

            <div className="max-w-[1600px] mx-auto relative z-10">

                {/* ── TOP EDITORIAL SPLIT LAYOUT ── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-8 items-start">

                    {/* Left Side CTA Section */}
                    <div className="lg:col-span-6 space-y-4">
                        <div className="space-y-2">
                            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
                                Let our print partners help you.
                            </h3>
                            <p className="text-sm sm:text-base text-white/70 font-normal">
                                Start your custom print order today.
                            </p>
                        </div>

                        {/* Circular Arrow Button */}
                        <div className="pt-1">
                            <Link
                                href="/browse"
                                className="w-12 h-12 rounded-full bg-white hover:bg-[#00FFFF] text-[#121212] flex items-center justify-center transition-all shadow-lg group hover:scale-105"
                                aria-label="Start your print order"
                            >
                                <ArrowUpRight size={22} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </Link>
                        </div>
                    </div>

                    {/* Right Side Simplified Links */}
                    <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-6">

                        {/* Column 1: Explore */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-white/40">
                                Explore
                            </h4>
                            <ul className="space-y-2 text-xs font-semibold text-white/70">
                                {exploreLinks.map((item) => (
                                    <li key={item.name}>
                                        <Link href={item.href} className="hover:text-[#00FFFF] transition-colors">
                                            {item.name}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Column 2: For Shops */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-white/40">
                                For Shops
                            </h4>
                            <ul className="space-y-2 text-xs font-semibold text-white/70">
                                {partnerLinks.map((item) => (
                                    <li key={item.name}>
                                        <Link href={item.href} className="hover:text-[#EC008C] transition-colors">
                                            {item.name}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Column 3: Connect & Socials */}
                        <div className="space-y-3 col-span-2 sm:col-span-1">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-white/40">
                                Connect
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {socialLinks.map((social, index) => (
                                    <a
                                        key={index}
                                        href={social.href}
                                        className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-[#EC008C] hover:border-[#EC008C] transition-all"
                                        aria-label={social.label}
                                    >
                                        {social.icon}
                                    </a>
                                ))}
                            </div>
                        </div>

                    </div>

                </div>

                {/* ── OVERSIZED DISPLAY BRAND TEXT TREATMENT ── */}
                <div className="my-8 py-6 border-t border-b border-white/10 text-center overflow-hidden">
                    <Link href="/" className="inline-block group">
                        <h2 className="font-mono font-bold tracking-[-0.07em] text-[#F6F6F2]/90 group-hover:text-white transition-colors uppercase leading-none select-none text-[clamp(2.5rem,8vw,7.5rem)]">
                            PRESS <span className="text-[#EC008C] font-bold">&</span> PRESENT
                        </h2>
                    </Link>
                </div>

                {/* ── BOTTOM LEGAL BAR ── */}
                <div className="pt-2 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-white/40 font-medium">
                    <p>© 2026 Press & Present. All rights reserved.</p>
                    <div className="flex items-center gap-6">
                        <a href="#" className="hover:text-white/80 transition-colors">Privacy</a>
                        <a href="#" className="hover:text-white/80 transition-colors">Terms</a>
                    </div>
                </div>

            </div>
        </footer>
    );
}
