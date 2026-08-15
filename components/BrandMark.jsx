export default function BrandMark({ className = "" }) {
  return (
    <span
      aria-label="Press and Present"
      className={`brand-mark relative inline-flex h-10 w-[72px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#1A1A1A] text-xl font-black tracking-tight shadow-sm ${className}`}
    >
      <span className="absolute inset-x-0 top-0 grid h-1 grid-cols-4" aria-hidden="true">
        <span className="bg-[#00FFFF]" />
        <span className="bg-[#EC008C]" />
        <span className="bg-[#FFF200]" />
        <span className="bg-white" />
      </span>
      <span className="text-[#00FFFF]">P</span>
      <span className="text-[#EC008C]">&</span>
      <span className="text-[#FFF200]">P</span>
    </span>
  );
}
