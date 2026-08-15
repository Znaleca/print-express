import Link from "next/link";
import { ArrowRight, MapPin, MessageSquare, Truck } from "lucide-react";
import ProfileCard from "@/components/ProfileCard";

const steps = [
  {
    number: "01",
    title: "Find a shop",
    description: "Discover trusted print providers nearby and compare their services, turnaround times, and ratings.",
    icon: MapPin,
    color: "bg-[#00FFFF] text-[#1A1A1A]",
  },
  {
    number: "02",
    title: "Send your design",
    description: "Message shop owners directly, upload artwork files, and confirm digital proofs before printing.",
    icon: MessageSquare,
    color: "bg-[#EC008C] text-white",
  },
  {
    number: "03",
    title: "Place and track",
    description: "Pay your downpayment, follow the live order status, and choose pickup or delivery when it is ready.",
    icon: Truck,
    color: "bg-[#FFF200] text-[#1A1A1A]",
  },
];

const team = [
  {
    name: "Liana Roldan",
    fullName: "Liana C. Roldan",
    role: "Project Lead & QA",
    focus: "Quality & testing",
    contribution: "Keeps the capstone focused, reliable, and ready for real users.",
    details: ["Project direction", "Quality assurance", "User acceptance testing"],
    image: "/Liana%20.png",
    glow: "rgba(0,255,255,.62)",
    gradient: "linear-gradient(145deg, rgba(0,255,255,.32), rgba(26,26,26,.3) 68%)",
  },
  {
    name: "Stefano Ching",
    fullName: "John Stefano S. Ching",
    role: "Documentation Lead",
    focus: "Clarity & records",
    contribution: "Turns the product journey into clear, useful project documentation.",
    details: ["Technical writing", "System documentation", "Project reporting"],
    image: "/Stef.png",
    glow: "rgba(236,0,140,.62)",
    gradient: "linear-gradient(145deg, rgba(236,0,140,.32), rgba(26,26,26,.3) 68%)",
  },
  {
    name: "Angelo Santos",
    fullName: "Angelo Mayce Fredriel D. Santos",
    role: "Lead Programmer",
    focus: "Architecture & systems",
    contribution: "Builds the core platform logic, data flows, and integrations behind Press & Present.",
    details: ["System architecture", "Supabase integration", "API and workflow logic"],
    image: "/Mayce.JPG",
    glow: "rgba(255,242,0,.62)",
    gradient: "linear-gradient(145deg, rgba(255,242,0,.3), rgba(26,26,26,.3) 68%)",
  },
  {
    name: "James Carreon",
    fullName: "James Ivan C. Carreon",
    role: "Product Programmer",
    focus: "Experience & interface",
    contribution: "Shapes the interface so finding a shop and placing an order feels straightforward.",
    details: ["UI engineering", "User flows", "Interaction design"],
    image: "/James.jpg",
    glow: "rgba(155,196,245,.66)",
    gradient: "linear-gradient(145deg, rgba(155,196,245,.3), rgba(26,26,26,.3) 68%)",
  },
];

export default function AboutPage() {
  return (
    <main className="about-page min-h-screen bg-[#F6F6F2] font-sans text-[#1A1A1A]">
      <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-12 pt-10 text-white sm:px-8 sm:pb-16 sm:pt-14 lg:px-12">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute bottom-8 left-10 hidden h-24 w-24 rotate-12 border border-[#EC008C]/30 sm:block" />

        <div className="relative mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#EC008C]">Bachelor of Science in Information Technology · Capstone Project · Press &amp; Present</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-black uppercase leading-[0.9] tracking-tight sm:text-7xl">
            A better way to <span className="text-[#00FFFF]">print local.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
            Press & Present is our capstone project for connecting customers with trusted local print shops and making every project easier to discover, customize, order, and track.
          </p>
        </div>
      </section>

      <section className="border-b border-stone-300/60 bg-[#F6F6F2] px-4 py-12 sm:px-8 sm:py-16 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#EC008C]">How it works</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">A clearer way to handle custom print orders.</h2>
          </div>

          <div className="relative mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            <div className="absolute left-[16%] right-[16%] top-7 hidden border-t-2 border-dashed border-[#1A1A1A]/15 md:block" />
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.number} className="relative z-10 bg-[#F6F6F2] md:text-center">
                  <div className="flex items-center gap-3 md:flex-col md:gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-full font-black shadow-sm ${step.color}`}>
                      <Icon size={24} />
                    </div>
                    <span className="text-xs font-bold tracking-[0.18em] text-[#676762]">STEP {step.number}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-black">{step.title}</h3>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#676762] md:mx-auto">{step.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#1A1A1A] px-4 py-12 text-white sm:px-8 sm:py-16 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FFF200]">Ready when you are</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Find the right print partner for your next project.</h2>
          </div>
          <Link href="/shops" className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#EC008C] px-5 py-3.5 text-sm font-black text-white transition-colors hover:bg-[#00FFFF] hover:text-[#1A1A1A]">
            Browse print shops <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="border-b border-stone-300/60 bg-white px-4 py-12 sm:px-8 sm:py-16 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#EC008C]">The capstone team</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Built with purpose, tested with care.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#676762] sm:text-base">
              Click a profile to see each person&apos;s contribution to Press &amp; Present.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((member) => (
              <ProfileCard
                key={member.fullName}
                name={member.name}
                title={member.role}
                avatarUrl={member.image}
                avatarAlt={`${member.fullName} portrait`}
                avatarShape="circle"
                showUserInfo={false}
                flipOnClick
                backTitle={member.role}
                backDescription={member.contribution}
                backDetails={member.details}
                behindGlowColor={member.glow}
                innerGradient={member.gradient}
                priority={member.name === "Liana Roldan"}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
