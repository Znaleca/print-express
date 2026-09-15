import Link from "next/link";

export const metadata = {
  title: "Terms | Press & Present",
  description: "Terms for using Press & Present to discover shops, place orders, and schedule meetings.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#F6F6F2] px-4 py-12 font-sans text-[#1A1A1A] sm:px-8 lg:px-12">
      <article className="mx-auto max-w-3xl rounded-3xl border border-stone-300 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#00A5A5]">Press &amp; Present</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Terms</h1>
        <p className="mt-3 text-sm text-[#676762]">Last updated September 15, 2026</p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-[#41413D]">
          <section>
            <h2 className="text-lg font-black text-[#1A1A1A]">Using the platform</h2>
            <p className="mt-2">Press &amp; Present helps customers discover printing shops, communicate about projects, place orders, track fulfillment, and schedule online meetings. Provide accurate account information and use the platform only for lawful print-related activity.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#1A1A1A]">Orders and payments</h2>
            <p className="mt-2">Shop owners are responsible for the services, prices, turnaround times, and fulfillment details they publish. Customers are responsible for reviewing quotations, submitting accurate artwork and payment information, and completing required payments before an order is finished.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#1A1A1A]">Meetings and uploaded files</h2>
            <p className="mt-2">Meeting times are subject to shop availability and confirmation rules. Upload only files you have permission to use, and do not use meetings, messages, or uploads to harass, impersonate, or distribute harmful content.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#1A1A1A]">Changes and support</h2>
            <p className="mt-2">We may update these terms as the capstone service evolves. Continued use after an update means you accept the revised terms. Contact the Press &amp; Present team through the support path in the app if you need help with an order or account.</p>
          </section>
        </div>

        <Link href="/" className="mt-8 inline-flex rounded-full bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-[#00A5A5]">Back to Press &amp; Present</Link>
      </article>
    </main>
  );
}
