"use client";

import { Terminal, FileText, ShieldAlert, Cpu, Layout } from "lucide-react";

const team = [
  {
    name: "Angelo Mayce Fredriel D. Santos",
    role: "Lead Programmer",
    icon: <Terminal size={48} />,
    details: ["System Architecture", "Logic Implementation", "Database Management", "API Integration"]
  },
  {
    name: "James Ivan C. Carreon",
    role: "Programmer 2",
    icon: <Layout size={48} />,
    details: ["UI/UX Engineering", "User Flow Mapping", "Visual Hierarchy", "Interaction Design"]
  },
  {
    name: "Liana C. Roldan",
    role: "Project Leader / QA",
    icon: <ShieldAlert size={48} />,
    details: ["Project Oversight", "Quality Assurance", "Beta Testing", "System Validation"]
  },
  {
    name: "Jhon Stefano S. Ching",
    role: "Documenter",
    icon: <FileText size={48} />,
    details: ["Technical Writing", "System Manuals", "Documentation", "Project Reporting"]
  }
];

export default function AboutSection() {
  return (
    <section id="about" className="w-full bg-[#FDFDFD] text-[#1A1A1A] border-t-[12px] border-[#1A1A1A] scroll-mt-24">
      
      {/* 1. MASSIVE CENTERED HEADER */}
      <div className="w-full flex flex-col items-center justify-center py-24 lg:py-48 px-6 bg-[#f0f0f0] border-b-[12px] border-[#1A1A1A] relative overflow-hidden text-center">
        {/* Background Decoration - Even Larger */}
        <Cpu className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none" size={800} />
        
        <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col items-center">
          <div className="inline-block bg-[#1A1A1A] text-white px-6 py-2 font-mono text-xs md:text-sm uppercase mb-12 tracking-[0.5em] font-bold">
            Academic_Development // BSIT_Specialists_2026
          </div>
          
          <h2 className="text-8xl md:text-[10rem] lg:text-[14rem] font-black uppercase leading-[0.75] tracking-tighter mb-16">
            The <br /> 
            <span className="text-transparent" style={{ WebkitTextStroke: '3px #1A1A1A' }}>
              Developers
            </span>
          </h2>

          <p className="text-2xl md:text-4xl font-black uppercase leading-tight max-w-4xl italic mb-16 text-[#1A1A1A]">
            Engineering a high-fidelity digital ecosystem for the future of the local printing industry.
          </p>

          {/* Centered Technical Details - Scaled Up */}
          <div className="space-y-12 flex flex-col items-center w-full">
            <div className="flex h-3 w-full max-w-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex-1 bg-[#00FFFF]" />
              <div className="flex-1 bg-[#EC008C]" />
              <div className="flex-1 bg-[#FFF200]" />
              <div className="flex-1 bg-[#1A1A1A]" />
            </div>

            <div className="font-mono text-lg md:text-xl uppercase leading-relaxed text-gray-700 font-bold">
              <p className="tracking-widest">// BSIT Capstone Thesis v1.0</p>
              <p className="tracking-widest">// Applied Information Technology</p>
              <p className="mt-4 text-sm md:text-base max-w-2xl mx-auto normal-case font-medium opacity-80">
                Modernizing the local printing industry through intensive academic research and professional-grade software architecture.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-6 pt-4">
               <div className="px-8 py-4 border-4 border-[#1A1A1A] font-mono text-sm md:text-base font-black uppercase bg-white hover:bg-[#00FFFF] transition-colors cursor-default shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                 Core_Logic: Operational
               </div>
               <div className="px-8 py-4 border-4 border-[#1A1A1A] font-mono text-sm md:text-base font-black uppercase bg-white hover:bg-[#FFF200] transition-colors cursor-default shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                 Research: Verified
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TEAM GRID (Increased height and text sizes) */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {team.map((member) => (
          <div 
            key={member.name} 
            className="group min-h-[600px] p-16 border-b-[12px] md:border-r-[12px] last:border-r-0 border-[#1A1A1A] flex flex-col justify-between transition-all hover:bg-[#1A1A1A] hover:text-white relative overflow-hidden"
          >
            <div className="relative z-10">
              <div className="w-24 h-24 flex items-center justify-center bg-[#1A1A1A] text-white mb-12 group-hover:bg-white group-hover:text-black transition-all duration-500 shadow-[8px_8px_0px_0px_rgba(0,255,255,1)] group-hover:shadow-[8px_8px_0px_0px_rgba(236,0,140,1)]">
                {member.icon}
              </div>
              <h3 className="text-xs font-mono font-black uppercase tracking-[0.5em] mb-6 text-[#EC008C] group-hover:text-[#00FFFF] transition-colors">
                {member.role}
              </h3>
              <h4 className="text-5xl font-black uppercase tracking-tighter leading-[0.85]">
                {member.name}
              </h4>
            </div>

            <div className="relative z-10">
              <div className="mb-6 flex items-center gap-4">
                <div className="h-[2px] flex-1 bg-current opacity-30" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] opacity-50">Expertise_Modules</span>
              </div>
              <ul className="space-y-3">
                {member.details.map((detail, i) => (
                  <li key={i} className="font-mono text-xs md:text-sm uppercase flex items-center gap-3 font-bold opacity-70 group-hover:opacity-100">
                    <span className="w-2 h-2 bg-[#EC008C] group-hover:bg-[#00FFFF]" />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* 3. CAPSTONE MARQUEE (Larger text) */}
      <div className="bg-[#1A1A1A] py-12 w-full overflow-hidden flex items-center border-t-[12px] border-[#EC008C]">
        <div className="flex whitespace-nowrap font-mono text-sm md:text-base text-white font-black uppercase tracking-[0.8em] animate-marquee">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center">
              <span className="mx-16 opacity-40">Project_Defense_Status: Ready</span>
              <span className="text-[#00FFFF]">SANTOS</span>
              <span className="mx-6 text-[#EC008C]">CARREON</span>
              <span className="mx-6 text-[#FFF200]">ROLDAN</span>
              <span className="mx-6 text-white">CHING</span>
              <span className="mx-16 opacity-40">Batch_2026 // BSIT</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}