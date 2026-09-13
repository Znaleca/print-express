import { X, Printer, FileText, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getOrderPaymentSummary } from "@/lib/paymentSummary";

const DOCUMENT_TYPES = [
  { value: "RECEIPT", label: "Official Receipt", shortLabel: "Official receipt" },
  { value: "QUOTATION", label: "Formal Quotation", shortLabel: "Formal quotation" },
];

const money = (value) => `₱${Number(value || 0).toFixed(2)}`;

export default function ReceiptModal({ order, onClose, initialDocType = "RECEIPT" }) {
  const safeInitialType = DOCUMENT_TYPES.some((document) => document.value === initialDocType)
    ? initialDocType
    : "RECEIPT";
  const [docType, setDocType] = useState(safeInitialType);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  useEffect(() => {
    setDocType(safeInitialType);
  }, [safeInitialType]);

  if (!order) return null;

  const business = order.businesses || {};
  const customer = order.customer_profile || order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const itemSubtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  const subtotal = Number(order.subtotal ?? (itemSubtotal > 0 ? itemSubtotal : order.total ?? 0));
  const taxAmount = Number(order.tax_amount || 0);
  const discountAmount = Number(order.discount_amount || 0);
  const calculatedTotal = Math.max(0, subtotal - discountAmount + taxAmount);
  const payment = getOrderPaymentSummary(order);
  const grandTotal = payment.total ?? calculatedTotal;
  const downpayment = payment.downpayment;
  const balance = payment.balance ?? Math.max(0, grandTotal - downpayment);
  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const quoteValidUntil = order.quotation_valid_until
    ? new Date(order.quotation_valid_until).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })
    : null;
  const shortOrderId = String(order.id || "ORDER").split("-")[0].toUpperCase();
  const isQuotation = docType === "QUOTATION";
  const documentLabel = isQuotation ? "FORMAL QUOTATION" : "OFFICIAL RECEIPT";
  const customerName = customer.full_name || order.customer_name || "Customer";
  const customerPhone = customer.phone || order.customer_phone || "Not provided";
  const customerAddress = order.delivery_type === "DELIVERY"
    ? order.delivery_address || "Delivery address provided at checkout"
    : "Customer store pickup";

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-receipt, .printable-receipt * { visibility: visible; }
          .printable-receipt {
            position: absolute;
            inset: 0;
            width: 100%;
            margin: 0;
            border: none;
            box-shadow: none;
            border-radius: 0;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="Print document generator">
        <div className="dialog-surface flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden">
          <div className="relative flex items-center justify-between bg-[#1A1A1A] px-5 py-4 text-white">
            <div className="cmyk-bar absolute left-0 right-0 top-0" />
            <div className="relative flex items-center gap-2">
              <FileText size={17} className="text-[#00FFFF]" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em]">Document generator</p>
                <p className="mt-0.5 text-[10px] text-white/55">Order #{shortOrderId} · compact print layout</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close document generator" className="rounded-lg p-1 text-white/65 transition-colors hover:bg-white/10 hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 border-b border-[#D8D6CE] bg-[#F6F6F2] p-2">
            {DOCUMENT_TYPES.map((document) => (
              <button
                key={document.value}
                type="button"
                onClick={() => setDocType(document.value)}
                aria-pressed={docType === document.value}
                className={`rounded-xl px-3 py-2.5 text-left text-xs font-black transition-colors ${docType === document.value ? "bg-white text-[#EC008C] shadow-sm ring-1 ring-[#EC008C]/25" : "text-slate-500 hover:bg-white/70 hover:text-slate-900"}`}
              >
                <span className="block">{document.label}</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-400">{document.shortLabel}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto bg-[#ECECE8] p-4 sm:p-7">
            <article className="printable-receipt mx-auto w-full max-w-[390px] border border-[#D8D6CE] bg-white p-6 font-mono text-[10px] text-[#1A1A1A] shadow-[0_10px_30px_rgba(26,26,26,0.1)] sm:p-7">
              <header className="border-b-2 border-dashed border-[#1A1A1A]/25 pb-4 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-[#009FA0]">Press &amp; Present</p>
                <h1 className="mt-2 text-base font-black uppercase leading-tight">{business.name || "Print Shop"}</h1>
                <p className="mt-1 leading-tight text-slate-500">{business.address || "Address unavailable"}</p>
                {(business.phone || business.email) && <p className="mt-1 leading-tight text-slate-500">{business.phone || business.email}</p>}
                <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#1A1A1A] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white">
                  <CheckCircle2 size={12} className="text-[#00FFFF]" /> {documentLabel}
                </div>
              </header>

              <section className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-[#1A1A1A]/20 py-4 text-[9px] text-slate-600">
                <span>DOCUMENT NO.</span><strong className="text-right text-[#1A1A1A]">PNP-{isQuotation ? "QUO" : "OR"}-{shortOrderId}</strong>
                <span>DATE ISSUED</span><strong className="text-right text-[#1A1A1A]">{dateStr}</strong>
                {isQuotation && <><span className="text-[#A94800]">QUOTE VALID UNTIL</span><strong className="text-right text-[#A94800]">{quoteValidUntil || "Not specified"}</strong></>}
                <span>FULFILLMENT</span><strong className="text-right text-[#1A1A1A]">{order.delivery_type || "PICKUP"}</strong>
                <span>PAYMENT METHOD</span><strong className="text-right text-[#1A1A1A]">{order.payment_method || "Not specified"}</strong>
              </section>

              <section className="border-b border-dashed border-[#1A1A1A]/20 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.12em]">Customer</p>
                <p className="mt-1 font-bold">{customerName}</p>
                <p className="mt-0.5 text-slate-600">{customerPhone}</p>
                <p className="mt-0.5 leading-tight text-slate-600">{customerAddress}</p>
              </section>

              <section className="border-b border-dashed border-[#1A1A1A]/20 py-4">
                <div className="mb-2 grid grid-cols-[1fr_auto] gap-3 border-b border-[#1A1A1A]/15 pb-1 text-[9px] font-black uppercase">
                  <span>Item / specifications</span><span>Amount</span>
                </div>
                {items.length > 0 ? items.map((item, index) => (
                  <div key={`${item.name || "item"}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#1A1A1A]/10 py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="font-bold">{item.name || item.title || "Print service"}</p>
                      {item.selected_specs && (
                        <p className="mt-0.5 leading-tight text-slate-600">
                          {[item.selected_specs.size && `Size: ${item.selected_specs.size}`, item.selected_specs.material && `Material: ${item.selected_specs.material}`, item.selected_specs.quality && `Quality: ${item.selected_specs.quality}`].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {item.selected_specs?.notes && <p className="mt-0.5 italic text-[#A94800]">Note: {item.selected_specs.notes}</p>}
                      <p className="mt-0.5 text-slate-500">Qty {item.quantity || 1} × {money(item.price)}</p>
                    </div>
                    <strong className="text-right">{money(Number(item.price || 0) * Number(item.quantity || 1))}</strong>
                  </div>
                )) : (
                  <div className="grid grid-cols-[1fr_auto] gap-3 py-2"><span>Custom print service job</span><strong>{money(subtotal)}</strong></div>
                )}
              </section>

              <section className="space-y-1.5 border-b border-dashed border-[#1A1A1A]/20 py-4">
                <div className="flex justify-between"><span>SUBTOTAL</span><strong>{money(subtotal)}</strong></div>
                <div className="flex justify-between text-slate-600"><span>DISCOUNT</span><span>−{money(discountAmount)}</span></div>
                <div className="flex justify-between text-slate-600"><span>TAX / VAT</span><span>{money(taxAmount)}</span></div>
                {order.delivery_type === "DELIVERY" && <div className="flex justify-between text-slate-600"><span>DELIVERY FEE</span><span>{money(order.delivery_fee)}</span></div>}
                <div className="flex justify-between border-t border-[#1A1A1A]/15 pt-2 text-xs font-black"><span>{isQuotation ? "QUOTED TOTAL" : "TOTAL"}</span><span>{money(grandTotal)}</span></div>
                <div className="flex justify-between text-slate-600"><span>DOWNPAYMENT</span><span className="font-bold text-[#007A6A]">{money(downpayment)}</span></div>
                <div className="flex justify-between text-xs font-black"><span>BALANCE DUE</span><span className="text-[#EC008C]">{money(Math.max(0, balance))}</span></div>
              </section>

              {isQuotation && (
                <section className="border-b border-dashed border-[#1A1A1A]/20 py-4 text-[9px] leading-relaxed text-slate-600">
                  <p className="font-black uppercase text-[#1A1A1A]">Terms &amp; approval</p>
                  <p className="mt-1">{quoteValidUntil ? `Pricing is valid until ${quoteValidUntil}.` : "Pricing validity was not recorded for this order."} Production starts after final proof approval, cost lock, and required payment confirmation.</p>
                  {order.quotation_terms && <p className="mt-1">{order.quotation_terms}</p>}
                  <div className="mt-6 grid grid-cols-2 gap-4 text-center text-[9px]">
                    <div className="border-t border-[#1A1A1A]/30 pt-1">Prepared by</div>
                    <div className="border-t border-[#1A1A1A]/30 pt-1">Customer approval</div>
                  </div>
                </section>
              )}

              <footer className="pt-4 text-center text-[9px] leading-relaxed text-slate-500">
                <p className="font-bold text-[#1A1A1A]">Thank you for choosing {business.name || "Press & Present"}.</p>
                <p>Keep this document for your order records.</p>
              </footer>
            </article>
          </div>

          <div className="no-print flex items-center justify-between gap-3 border-t border-[#D8D6CE] bg-white p-4">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Close</button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C]"><Printer size={15} /> Print {isQuotation ? "quotation" : "receipt"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
