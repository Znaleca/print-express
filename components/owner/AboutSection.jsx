"use client";

import { Terminal, FileText, ShieldAlert, Cpu, Layout, Code2 } from "lucide-react";

const team = [
  {
    name: "Angelo Mayce Fredriel D. Santos",
    role: "Lead Programmer",
    icon: <Terminal size={32} />,
    color: "border-[#00FFFF]", // Cyan
    hover: "group-hover:bg-[#00FFFF]",
    details: ["System Architecture", "Logic Implementation", "Database Management", "API Integration"]
  },
  {
    name: "James Ivan C. Carreon",
    role: "Programmer 2",
    icon: <Layout size={32} />,
    color: "border-[#EC008C]", // Magenta
    hover: "group-hover:bg-[#EC008C]",
    details: ["UI/UX Engineering", "User Flow Mapping", "Visual Hierarchy", "Interaction Design"]
  },
  {
    name: "Liana C. Roldan",
    role: "Project Leader / QA",
    icon: <ShieldAlert size={32} />,
    color: "border-[#FFF200]", // Yellow
    hover: "group-hover:bg-[#FFF200]",
    details: ["Project Oversight", "Quality Assurance", "Beta Testing", "System Validation"]
  },
  {
    name: "Jhon Stefano S. Ching",
    role: "Documenter",
    icon: <FileText size={32} />,
    color: "border-[#1A1A1A]", // Black
    hover: "group-hover:bg-[#1A1A1A]",
    details: ["Technical Writing", "System Manuals", "Documentation", "Project Reporting"]
  }
];

export default function AboutSection() {
  return (
    <section id="about" className="w-full bg-[#FDFDFD] text-[#1A1A1A] border-t-8 border-[#1A1A1A] scroll-mt-24">
      
      {/* 1. ACADEMIC HEADER (Split Layout) */}
      <div className="w-full flex flex-col lg:flex-row border-b-8 border-[#1A1A1A]">
        <div className="lg:w-1/2 p-12 lg:p-24 bg-[#f0f0f0] border-b-8 lg:border-b-0 lg:border-r-8 border-[#1A1A1A] relative overflow-hidden">
          <Cpu className="absolute -right-20 -bottom-20 opacity-5" size={400} />
          
          <div className="relative z-10">
            <div className="inline-block bg-[#1A1A1A] text-white px-4 py-1 font-mono text-[10px] uppercase mb-8 tracking-[0.4em]">
              Academic_Development // BSIT_Specialists
            </div>
            <h2 className="text-7xl md:text-9xl font-black uppercase leading-[0.8] tracking-tighter mb-12">
              The <br /> <span className="text-transparent" style={{ WebkitTextStroke: '2px #1A1A1A' }}>Developers</span>
            </h2>
            <p className="text-xl md:text-2xl font-bold uppercase leading-tight max-w-md italic">
              A collective of BSIT students engineering a high-fidelity digital ecosystem for our Capstone Project.
            </p>
          </div>
        </div>

        <div className="lg:w-1/2 p-12 lg:p-24 flex flex-col justify-end gap-8 bg-white">
          <div className="space-y-6">
            <div className="flex h-2 w-full max-w-sm">
              <div className="flex-1 bg-[#00FFFF]" />
              <div className="flex-1 bg-[#EC008C]" />
              <div className="flex-1 bg-[#FFF200]" />
              <div className="flex-1 bg-[#1A1A1A]" />
            </div>
            <p className="font-mono text-sm uppercase leading-loose text-gray-500 max-w-lg">
              // BSIT Capstone Thesis v1.0 <br />
              // Applied Information Technology <br />
              // Modernizing the local printing industry through academic research and professional-grade software development.
            </p>
            <div className="flex items-center gap-4 pt-4">
               <div className="px-3 py-1 border-2 border-[#1A1A1A] font-mono text-[10px] font-black uppercase">Core_Logic: Operational</div>
               <div className="px-3 py-1 border-2 border-[#1A1A1A] font-mono text-[10px] font-black uppercase">Research: Verified</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TEAM GRID (Full Width) */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {team.map((member) => (
          <div 
            key={member.name} 
            className={`group min-h-[500px] p-12 border-b-8 md:border-r-8 last:border-r-0 border-[#1A1A1A] flex flex-col justify-between transition-all hover:bg-[#1A1A1A] hover:text-white relative overflow-hidden`}
          >
            {/* Design Ornament */}
            <div className={`absolute top-0 right-0 w-12 h-12 border-l-2 border-b-2 border-[#1A1A1A] group-hover:border-white opacity-10 transition-colors`} />
            
            <div className="relative z-10">
              <div className={`w-16 h-16 flex items-center justify-center bg-[#1A1A1A] text-white mb-10 group-hover:bg-white group-hover:text-black transition-all duration-300`}>
                {member.icon}
              </div>
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] mb-4 text-[#EC008C] group-hover:text-[#00FFFF] transition-colors">
                {member.role}
              </h3>
              <h4 className="text-4xl font-black uppercase tracking-tighter leading-[0.9] mb-8">
                {member.name}
              </h4>
            </div>

            <div className="relative z-10">
              <div className="mb-4 flex items-center gap-2">
                <div className={`h-[1px] flex-1 bg-current opacity-20`} />
                <span className="font-mono text-[9px] uppercase tracking-widest opacity-40">Development_Log</span>
              </div>
              <ul className="space-y-2">
                {member.details.map((detail, i) => (
                  <li key={i} className="font-mono text-[10px] uppercase flex items-center gap-2 opacity-60 group-hover:opacity-100">
                    <span className="w-1.5 h-1.5 bg-current" />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* 3. CAPSTONE LOG STRIP */}
      <div className="bg-[#1A1A1A] py-10 w-full overflow-hidden flex items-center border-t-8 border-[#EC008C]">
        <div className="flex whitespace-nowrap font-mono text-[11px] text-white font-bold uppercase tracking-[0.6em] animate-marquee">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center">
              <span className="mx-12 opacity-50 underline decoration-dotted underline-offset-4">Project_Defense_Status: Ready</span>
              <span className="text-[#00FFFF]">SANTOS</span>
              <span className="mx-4 text-[#EC008C]">CARREON</span>
              <span className="mx-4 text-[#FFF200]">ROLDAN</span>
              <span className="mx-4 text-white">CHING</span>
              <span className="mx-12 opacity-50 underline decoration-dotted underline-offset-4">Batch_2026 // BSIT</span>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}