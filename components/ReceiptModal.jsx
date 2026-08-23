import { X, Printer, FileText, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export default function ReceiptModal({ order, onClose, isOwner, initialDocType = "RECEIPT" }) {
  const [docType, setDocType] = useState(initialDocType); // 'RECEIPT', 'QUOTATION', 'DELIVERY', 'INVOICE'

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  if (!order) return null;

  const bInfo = order.businesses || {};
  const dateStr = new Date(order.created_at).toLocaleDateString();
  const subtotal = Number(order.subtotal ?? order.total_amount ?? order.total ?? 0);
  const taxAmount = Number(order.tax_amount || 0);
  const discountAmount = Number(order.discount_amount || 0);
  const grandTotal = Math.max(0, subtotal + taxAmount - discountAmount);
  const downpayment = Number(order.downpayment_amount ?? 0);
  const balance = Number.isFinite(Number(order.balance_amount))
    ? Number(order.balance_amount)
    : Math.max(0, grandTotal - downpayment);
  const quoteValidUntil = order.quotation_valid_until
    ? new Date(order.quotation_valid_until).toLocaleDateString()
    : null;

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-receipt, .printable-receipt * {
            visibility: visible;
          }
          .printable-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            border: none;
            box-shadow: none;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="dialog-overlay no-print" role="dialog" aria-modal="true" aria-label="Print document generator">
        <div className="dialog-surface w-full max-w-md flex flex-col max-h-[92vh] overflow-hidden">
          
          {/* Header */}
          <div className="flex justify-between items-center bg-slate-900 text-white px-5 py-3.5">
            <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-2">
              <FileText size={16} className="text-[#00FFFF]" /> Print Document Generator
            </h3>
            <button onClick={onClose} className="hover:text-[#EC008C] transition-colors"><X size={18} /></button>
          </div>

          {/* Document Type Switcher Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 overflow-x-auto">
            <button
              type="button"
              onClick={() => setDocType("RECEIPT")}
              className={`flex-1 py-2.5 px-3 text-center border-b-2 transition-all ${
                docType === "RECEIPT" ? "border-[#EC008C] text-[#EC008C] bg-white font-extrabold" : "border-transparent hover:text-slate-900"
              }`}
            >
              Official Receipt
            </button>
            <button
              type="button"
              onClick={() => setDocType("QUOTATION")}
              className={`flex-1 py-2.5 px-3 text-center border-b-2 transition-all ${
                docType === "QUOTATION" ? "border-[#EC008C] text-[#EC008C] bg-white font-extrabold" : "border-transparent hover:text-slate-900"
              }`}
            >
              Formal Quotation
            </button>
            <button
              type="button"
              onClick={() => setDocType("DELIVERY")}
              className={`flex-1 py-2.5 px-3 text-center border-b-2 transition-all ${
                docType === "DELIVERY" ? "border-[#EC008C] text-[#EC008C] bg-white font-extrabold" : "border-transparent hover:text-slate-900"
              }`}
            >
              Delivery Receipt
            </button>
            <button
              type="button"
              onClick={() => setDocType("INVOICE")}
              className={`flex-1 py-2.5 px-3 text-center border-b-2 transition-all ${
                docType === "INVOICE" ? "border-[#EC008C] text-[#EC008C] bg-white font-extrabold" : "border-transparent hover:text-slate-900"
              }`}
            >
              Sales Invoice
            </button>
          </div>

          {/* Receipt Scroll Area */}
          <div className="p-6 overflow-y-auto bg-slate-100 flex justify-center flex-1">
            <div className="printable-receipt bg-white w-[340px] font-mono text-[11px] p-6 shadow-md border border-slate-200 text-slate-900 rounded-xl space-y-4">
              
              <div className="text-center pb-3 border-b border-dashed border-slate-300">
                <h2 className="font-extrabold text-sm uppercase text-slate-900 mb-1">{bInfo.name || "Press & Present Shop"}</h2>
                <p className="text-slate-500 leading-tight text-[10px]">{bInfo.address || "Address Unavailable"}</p>
                {bInfo.phone && <p className="text-slate-500 leading-tight text-[10px] mt-0.5">Tel: {bInfo.phone}</p>}
                
                <div className="mt-3 inline-block px-3 py-1 bg-slate-900 text-white rounded-md text-[10px] font-bold uppercase tracking-wider">
                  {docType === "RECEIPT" ? "OFFICIAL RECEIPT" :
                   docType === "QUOTATION" ? "FORMAL PRINT QUOTATION" :
                   docType === "DELIVERY" ? "DELIVERY RECEIPT" : "SALES INVOICE"}
                </div>
              </div>

              <div className="space-y-1 text-slate-700 text-[10px]">
                <div className="flex justify-between">
                  <span>DOC NO:</span>
                  <span className="font-bold">#PNP-{docType.slice(0, 3)}-{order.id.split('-')[0].toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE ISSUED:</span>
                  <span>{dateStr}</span>
                </div>
                {docType === "QUOTATION" && (
                  <div className="flex justify-between text-amber-700 font-semibold">
                    <span>VALID UNTIL:</span>
                    <span>{quoteValidUntil || "Not specified"}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>FULFILLMENT:</span>
                  <span className="font-semibold">{order.delivery_type}</span>
                </div>
                <div className="flex justify-between">
                  <span>PAYMENT METHOD:</span>
                  <span className="font-semibold">{order.payment_method}</span>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-300" />

              <div>
                <p className="font-bold mb-1 text-slate-900 text-[10px]">
                  {order.delivery_type === 'DELIVERY' ? 'DELIVER TO:' : 'CUSTOMER / PICKUP:'}
                </p>
                <p className="text-[10px] leading-tight text-slate-600">
                  {order.delivery_type === 'DELIVERY' ? (order.delivery_address || 'Address provided on profile') : 'Customer Store Pickup'}
                </p>
              </div>

              <div className="border-b border-dashed border-slate-300" />

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-slate-800 border-b border-slate-200 pb-1">
                  <span>ITEM / SPECS</span>
                  <span>{docType === "QUOTATION" ? "QTY / TOTAL" : "AMOUNT"}</span>
                </div>

                {order.items && order.items.length > 0 ? (
                  order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[10px] gap-2 pb-1 border-b border-slate-100 last:border-0">
                      <div className="flex-1">
                        <span className="font-semibold text-slate-900 block">{item.name || item.title}</span>
                        {item.selected_specs && (
                          <span className="text-[9px] text-slate-600 block leading-tight">
                            {[
                              item.selected_specs.size && `Size: ${item.selected_specs.size}`,
                              item.selected_specs.material && `Mat: ${item.selected_specs.material}`,
                              item.selected_specs.quality && `Qual: ${item.selected_specs.quality}`
                            ].filter(Boolean).join(" | ")}
                          </span>
                        )}
                        {item.selected_specs?.notes && (
                          <span className="text-[9px] text-amber-800 italic block">"Notes: {item.selected_specs.notes}"</span>
                        )}
                        <span className="text-[9px] text-slate-500 block">
                          {item.quantity || 1}x @ ₱{Number(item.price || 0).toFixed(2)}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900 text-right shrink-0">
                        ₱{((item.quantity || 1) * (item.price || 0)).toFixed(2)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-[10px]">
                    <span className="font-semibold text-slate-900">Custom Print Service Job</span>
                    <span className="font-bold text-slate-900">₱{subtotal.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="border-b border-dashed border-slate-300" />

              {/* Financial Totals */}
              <div className="space-y-1.5 text-[11px] pt-1">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span>₱{subtotal.toFixed(2)}</span>
                </div>
                {docType === "QUOTATION" && (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>DISCOUNT:</span>
                      <span>-PHP {discountAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>TAX / VAT:</span>
                      <span>PHP {taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-extrabold">
                      <span>QUOTED TOTAL:</span>
                      <span>PHP {grandTotal.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>DOWNPAYMENT PAID:</span>
                  <span className="font-bold text-emerald-700">₱{downpayment.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-900 font-extrabold text-xs pt-1 border-t border-slate-200">
                  <span>BALANCE DUE:</span>
                  <span className="text-[#EC008C]">₱{Math.max(0, balance).toFixed(2)}</span>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-300" />

              {docType === "QUOTATION" && (
                <>
                  <div className="text-[9px] text-slate-600 leading-tight space-y-1">
                    <p className="font-bold text-slate-900 uppercase">Quotation Terms</p>
                    <p>{quoteValidUntil ? `Pricing is valid until ${quoteValidUntil} and may change after material, quantity, finishing, or artwork revisions.` : "Pricing validity was not recorded for this order."}</p>
                    {order.quotation_terms && <p>{order.quotation_terms}</p>}
                    <p>Production starts after final design proof approval, cost lock, and required payment confirmation.</p>
                    <p>Uploaded files must match the agreed type, format, size, and print quality requirements.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 text-center text-[9px] text-slate-500">
                    <div className="border-t border-slate-300 pt-1">Prepared By</div>
                    <div className="border-t border-slate-300 pt-1">Customer Approval</div>
                  </div>
                  <div className="border-b border-dashed border-slate-300" />
                </>
              )}

              <div className="text-center text-[9px] text-slate-500 leading-tight space-y-1 pt-1">
                <p>Thank you for choosing {bInfo.name || "Press & Present"}!</p>
                <p>For custom quotes or order inquiries, visit Press & Present.</p>
              </div>

            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-4 bg-white border-t border-slate-200 flex justify-between gap-3 no-print">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50"
            >
              Close
            </button>

            <button
              onClick={() => window.print()}
              className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-[#EC008C] transition-colors flex items-center gap-2"
            >
              <Printer size={15} /> Print {docType.toLowerCase()}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
