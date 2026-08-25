"use client";

import Image from "next/image";
import { ArrowRight, FileText, Loader2, Package } from "lucide-react";
import { getCartGroups, getDesignFiles } from "@/lib/checkout";

export default function OrderSummary({
  selectedServices,
  total,
  effectiveDownpaymentPercent,
  minimumDownpaymentPercent,
  setUserSelectedDownpaymentPercent,
  downpaymentAmount,
  balanceAmount,
  isProcessing,
  isReadyToExecute,
  handleExecuteOrder,
  openDesignFiles,
}) {
  return (
    <aside className="lg:sticky lg:top-20 space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
        <div className="cmyk-bar absolute left-0 right-0 top-0" />

        <h2 className="mb-4 border-b border-slate-100 pb-3 text-base font-bold text-slate-900">
          Order Summary
        </h2>

        <div className="mb-6 space-y-5">
          {getCartGroups(selectedServices).map((group) => (
            <section key={group.key}>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {group.label}
              </h3>
              <div className="space-y-3">
                {group.items.map((item, index) => (
                  <div
                    key={item.cart_item_id || `${item.id}-${index}`}
                    className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 text-xs last:border-0"
                  >
                    <div className={`flex min-w-0 items-start ${item.item_type === "product" ? "gap-3" : ""}`}>
                      {item.item_type === "product" && (
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          {item.image_url ? (
                            <Image src={item.image_url} alt={item.name || "Print item"} fill sizes="56px" className="object-cover" />
                          ) : (
                            <Package className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400" size={20} />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-bold text-slate-900">{item.name || item.item_name || item.service_name || "Print item"}</p>
                        <p className="text-[11px] text-slate-500">Quantity: {item.quantity || 1}</p>

                        {item.selected_specs && (item.selected_specs.size || item.selected_specs.material || item.selected_specs.quality || item.selected_specs.notes) && (
                          <div className="mt-1 space-y-0.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600">
                            {item.selected_specs.size && <div>• Size: <span className="font-semibold text-slate-800">{item.selected_specs.size}</span></div>}
                            {item.selected_specs.material && <div>• Material: <span className="font-semibold text-slate-800">{item.selected_specs.material}</span></div>}
                            {item.selected_specs.quality && <div>• Quality: <span className="font-semibold text-slate-800">{item.selected_specs.quality}</span></div>}
                            {item.selected_specs.requested_quantity && <div>• Requested quantity: <span className="font-semibold text-slate-800">{item.selected_specs.requested_quantity}</span></div>}
                            {item.selected_specs.notes && <div className="italic text-amber-800">"Notes: {item.selected_specs.notes}"</div>}
                          </div>
                        )}
                        {getDesignFiles(item).length > 0 && (
                          <button
                            type="button"
                            onClick={() => openDesignFiles(getDesignFiles(item))}
                            className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#009FA0] hover:text-[#EC008C]"
                          >
                            <FileText size={13} /> View files ({getDesignFiles(item).length})
                          </button>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-bold text-slate-900">₱{(Number(item.price) * (item.quantity || 1)).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div className="flex justify-between text-xs font-medium text-slate-600">
            <span>Subtotal</span>
            <span>₱{total.toFixed(2)}</span>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Downpayment Percent</span>
              <span className="font-bold text-[#EC008C]">{effectiveDownpaymentPercent}%</span>
            </div>
            <input
              type="range"
              min={minimumDownpaymentPercent}
              max="100"
              step="5"
              value={effectiveDownpaymentPercent}
              onChange={(event) => setUserSelectedDownpaymentPercent(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-[#EC008C]"
              aria-label="Downpayment percentage"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-semibold text-slate-700">Downpayment Due Now</span>
            <span className="text-xl font-extrabold text-[#EC008C]">₱{downpaymentAmount.toFixed(2)}</span>
          </div>

          {balanceAmount > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Remaining Balance</span>
              <span>₱{balanceAmount.toFixed(2)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExecuteOrder}
            disabled={isProcessing || !isReadyToExecute}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#EC008C] disabled:opacity-50"
          >
            {isProcessing ? (
              <><Loader2 size={16} className="animate-spin" /> Processing Order...</>
            ) : (
              <>Place Order <ArrowRight size={16} /></>
            )}
          </button>

          {!isReadyToExecute && (
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Please complete all required fields{effectiveDownpaymentPercent > 0 ? " and upload payment proof" : ""} to submit order.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
