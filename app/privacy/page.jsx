import Link from "next/link";

export const metadata = {
  title: "Privacy | Press & Present",
  description: "How Press & Present handles account, order, meeting, and uploaded document information.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#F6F6F2] px-4 py-12 font-sans text-[#1A1A1A] sm:px-8 lg:px-12">
      <article className="mx-auto max-w-3xl rounded-3xl border border-stone-300 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#EC008C]">Press &amp; Present</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Privacy</h1>
        <p className="mt-3 text-sm text-[#676762]">Last updated September 15, 2026</p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-[#41413D]">
          <section>
            <h2 className="text-lg font-black text-[#1A1A1A]">What we collect</h2>
            <p className="mt-2">We collect the information needed to create your account, connect customers with printing shops, process orders, schedule meetings, and provide support. This can include your name, email address, phone number, order details, messages, meeting details, payment proof, and files you choose to upload.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#1A1A1A]">How we use it</h2>
            <p className="mt-2">We use this information to authenticate accounts, coordinate customer and shop workflows, send transactional notifications, calculate delivery details, protect the platform, and show you the order or shop information relevant to your request.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#1A1A1A]">Sharing and retention</h2>
            <p className="mt-2">Order and meeting information is shared with the customer or shop involved in that transaction. We use Supabase for application data and Resend for transactional email delivery. We retain records for as long as needed to operate the service, resolve disputes, meet project requirements, or comply with applicable obligations.</p>
          </section>
          <section>
            <h2 className="text-lg font-black text-[#1A1A1A]">Your choices</h2>
            <p className="mt-2">You can request help with your account or personal information through the support contact shown in the app. Do not upload documents or payment proof that you are not authorized to share.</p>
          </section>
        </div>

        <Link href="/" className="mt-8 inline-flex rounded-full bg-[#1A1A1A] px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-[#EC008C]">Back to Press &amp; Present</Link>
      </article>
    </main>
  );
}
