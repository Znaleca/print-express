import { FaFacebookF, FaInstagram, FaYoutube } from 'react-icons/fa';
import { SiTiktok } from 'react-icons/si';
import { MapPin, FileUp, CreditCard, ShieldCheck } from "lucide-react";

export default function Footer() {
    const socialLinks = [
        { icon: <FaFacebookF size={20} />, color: 'hover:bg-[#00FFFF]', border: 'border-[#00FFFF]', text: 'text-[#00FFFF]', label: 'Facebook' },
        { icon: <FaInstagram size={20} />, color: 'hover:bg-[#EC008C]', border: 'border-[#EC008C]', text: 'text-[#EC008C]', label: 'Instagram' },
        { icon: <SiTiktok size={20} />, color: 'hover:bg-[#FFF200]', border: 'border-[#FFF200]', text: 'text-[#FFF200]', label: 'TikTok' },
        { icon: <FaYoutube size={20} />, color: 'hover:bg-white', border: 'border-white', text: 'text-white', label: 'YouTube' },
    ];

    const quickLinks = [
        { name: "Location Discovery", icon: <MapPin size={14} /> },
        { name: "Seamless Proofing", icon: <FileUp size={14} /> },
        { name: "Secure Payments", icon: <CreditCard size={14} /> },
        { name: "Verified Partners", icon: <ShieldCheck size={14} /> },
    ];

    return (
        <footer className="bg-[#1A1A1A] text-white py-20 px-8 border-t-8 border-[#EC008C] relative overflow-hidden">
            {/* Background Decorative Element */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#EC008C] opacity-[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            
            <div className="w-full">
                <div className="flex flex-col lg:flex-row justify-between items-start gap-16 mb-20">
                    
                    {/* Brand Section */}
                    <div className="max-w-md group">
                        <h4 className="text-5xl font-black uppercase italic tracking-tighter mb-4 transition-transform duration-300 group-hover:-skew-x-2">
                            Press <span className="text-[#00FFFF]">&</span> Present
                        </h4>
                        <p className="font-mono text-xs tracking-widest opacity-40 uppercase leading-relaxed mb-6">
                            The industrial hub for local production. <br />
                            Connecting shops & creators since 2026.
                        </p>
                        <div className="flex h-1 w-32">
                            <div className="flex-1 bg-[#00FFFF]" />
                            <div className="flex-1 bg-[#EC008C]" />
                            <div className="flex-1 bg-[#FFF200]" />
                        </div>
                    </div>

                    {/* Quick Info Grid */}
                    <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                        {quickLinks.map((link) => (
                            <div key={link.name} className="flex items-center gap-3 group cursor-pointer">
                                <span className="text-[#EC008C] group-hover:text-[#00FFFF] transition-colors">{link.icon}</span>
                                <span className="font-mono text-[10px] uppercase tracking-wider opacity-60 group-hover:opacity-100">
                                    {link.name}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Social Section */}
                    <div className="flex flex-col items-center lg:items-end gap-6">
                        <div className="flex gap-4">
                            {socialLinks.map((social, index) => (
                                <a
                                    key={index}
                                    href="#"
                                    className={`w-12 h-12 border-2 ${social.border} ${social.text} flex items-center justify-center transition-all duration-300 ${social.color} hover:text-black hover:-translate-y-1 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] hover:shadow-none`}
                                    aria-label={social.label}
                                >
                                    {social.icon}
                                </a>
                            ))}
                        </div>
                        <div className="text-right">
                            <span className="font-mono text-[10px] uppercase tracking-[0.4em] opacity-30 block">
                                Validated // Secure_Access_Only
                            </span>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="font-mono text-[9px] uppercase tracking-widest opacity-40">
                        © 2026 Press & Present Portal // All Rights Reserved
                    </p>
                    <div className="flex gap-8 font-mono text-[9px] uppercase tracking-[0.2em] opacity-40">
                        <a href="#" className="hover:text-[#00FFFF] transition-colors">Privacy_Protocol</a>
                        <a href="#" className="hover:text-[#EC008C] transition-colors">Terms_Of_Service</a>
                        <a href="#" className="hover:text-[#FFF200] transition-colors">Support_Line</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}