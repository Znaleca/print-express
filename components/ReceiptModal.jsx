import { X, Printer } from "lucide-react";
import { useEffect } from "react";

export default function ReceiptModal({ order, onClose, isOwner }) {
  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  if (!order) return null;

  const bInfo = order.businesses || {};
  const dateStr = new Date(order.created_at).toLocaleString();

  return (
    <>
      {/* Print Styles injected locally */}
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

      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 no-print">
        <div className="bg-white border-4 border-black w-full max-w-sm flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex justify-between items-center bg-black text-white px-4 py-3">
            <h3 className="font-mono text-sm uppercase tracking-widest font-black">Receipt_Viewer</h3>
            <button onClick={onClose} className="hover:text-[#EC008C]"><X size={18} /></button>
          </div>

          {/* Receipt Scroll Area */}
          <div className="p-6 overflow-y-auto bg-gray-100 flex justify-center">
            {/* THIS IS THE ACTUAL RECEIPT */}
            <div className="printable-receipt bg-white w-[300px] font-mono text-[11px] p-6 shadow-xl border border-gray-300 text-black mx-auto">
              {/* Receipt Header */}
              <div className="text-center mb-4">
                <h2 className="font-black text-base uppercase mb-1">{bInfo.name || "Business Name"}</h2>
                <p className="opacity-70 leading-tight">{bInfo.address || "Address Unavailable"}</p>
                {bInfo.phone && <p className="opacity-70 leading-tight mt-1">TEL: {bInfo.phone}</p>}
                <p className="opacity-70 leading-tight mt-2 text-[9px]">VAT REG TIN: 000-000-000-000</p>
              </div>

              <div className="border-b-2 border-dashed border-gray-400 my-3" />

              <div className="mb-3 space-y-1">
                <div className="flex justify-between gap-4">
                  <span>ORDER#</span>
                  <span className="truncate">{order.id.split('-')[0].toUpperCase()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>DATE</span>
                  <span className="truncate">{dateStr}</span>
                </div>
                <div className="flex justify-between gap-4 mt-2">
                  <span>PAYMENT</span>
                  <span className="truncate">{order.payment_method}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>TYPE</span>
                  <span className="truncate">{order.delivery_type}</span>
                </div>
              </div>

              <div className="border-b-2 border-dashed border-gray-400 my-3" />

              {/* Delivery / Pick Up Info */}
              <div className="mb-3">
                {order.delivery_type === 'DELIVERY' ? (
                  <>
                    <p className="font-bold mb-1">DELIVER TO:</p>
                    <p className="text-[10px] leading-tight opacity-90">{order.delivery_address || 'Address not provided'}</p>
                    {order.delivery_coordinates?.lat && (
                      <p className="text-[9px] mt-1 opacity-70 font-mono">
                        GPS: {Number(order.delivery_coordinates.lat).toFixed(6)}, {Number(order.delivery_coordinates.lng).toFixed(6)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-bold mb-1">PICK UP AT:</p>
                    <p className="text-[10px] leading-tight opacity-90">{bInfo.address || 'Shop address not provided'}</p>
                  </>
                )}
              </div>

              <div className="border-b-2 border-dashed border-gray-400 my-3" />

              {/* Items */}
              <div className="mb-3">
                <div className="flex justify-between font-bold mb-2">
                  <span>QTY ITEM</span>
                  <span>AMOUNT</span>
                </div>
                {order.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-start mb-1 leading-tight">
                    <span className="w-6 mr-1">{it.quantity || 1}</span>
                    <span className="flex-1 pr-2 truncate uppercase">{it.name}</span>
                    <span className="text-right">{(Number(it.price) * (it.quantity || 1)).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-b-2 border-dashed border-gray-400 my-3" />

              {/* Totals */}
              <div className="space-y-1 mb-4">
                <div className="flex justify-between">
                  <span>SUBTOTAL</span>
                  <span>{Number(order.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[9px] opacity-70">
                  <span>DISCOUNT</span>
                  <span>0.00</span>
                </div>
                <div className="flex justify-between font-black text-sm mt-2 pt-2 border-t border-dotted border-gray-300">
                  <span>TOTAL</span>
                  <span>₱{Number(order.total).toFixed(2)}</span>
                </div>
              </div>

              <div className="border-b-2 border-dashed border-gray-400 my-3" />

              <div className="space-y-1 mb-6">
                <div className="flex justify-between">
                  <span>DP PAID</span>
                  <span>{Number(order.downpayment_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>BALANCE</span>
                  <span>{Number(order.balance_amount || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center font-bold">
                <p className="mb-1 text-sm">THANK YOU!</p>
                <p className="text-[9px] opacity-60">THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX</p>
                <p className="text-[8px] opacity-40 mt-4">System generated by PrintExpress</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-t-4 border-black flex gap-3 bg-white">
            <button onClick={onClose} className="flex-1 border-2 border-black py-2 font-black uppercase text-xs hover:bg-gray-100">
              Close
            </button>
            {isOwner && (
              <button 
                onClick={() => window.print()}
                className="flex-1 bg-[#EC008C] text-white border-2 border-black py-2 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
              >
                <Printer size={16} /> Print
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
