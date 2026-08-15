export default function OwnerPageSkeleton({ rows = 3 }) {
  return (
    <main
      className="min-h-screen bg-[#F6F6F2] p-5 font-sans sm:p-8"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="mx-auto max-w-6xl animate-pulse space-y-8">
        <div className="relative overflow-hidden rounded-3xl border border-[#D8D6CE] bg-white px-6 py-9 shadow-sm sm:px-9">
          <div className="cmyk-bar absolute left-0 right-0 top-0" />
          <div className="h-3 w-28 rounded-full bg-[#ECECE8]" />
          <div className="mt-5 h-12 max-w-md rounded-2xl bg-[#ECECE8]" />
          <div className="mt-4 h-4 max-w-xl rounded-full bg-[#ECECE8]" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="rounded-3xl border border-[#D8D6CE] bg-white p-6 shadow-sm">
              <div className="h-5 w-2/5 rounded-full bg-[#ECECE8]" />
              <div className="mt-5 h-3 w-4/5 rounded-full bg-[#ECECE8]" />
              <div className="mt-3 h-3 w-3/5 rounded-full bg-[#ECECE8]" />
              <div className="mt-8 h-20 rounded-2xl bg-[#F6F6F2]" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
