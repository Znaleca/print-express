"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  UploadCloud, CheckCircle2, CreditCard, Banknote,
  FileText, Star, MapPin, Loader2, Hash, ArrowRight,
  ChevronRight, Info, AlertTriangle
} from "lucide-react";

export default function BusinessDetailsPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  // User state
  const [user, setUser] = useState(null);
  const [isCustomer, setIsCustomer] = useState(false);

  // Form state
  const [selectedServices, setSelectedServices] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [receiptFile, setReceiptFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function init() {
      // Load user
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user && user.user_metadata?.role === "CUSTOMER") {
        setIsCustomer(true);
      }

      // Load business
      if (id) {
        const { data, error } = await supabase
          .from("businesses")
          .select(`
            id, name, address, description,
            services ( id, name, price, description, category, available ),
            business_reviews ( rating, feedback, created_at, customer_name )
          `)
          .eq("id", id)
          .eq("status", "APPROVED")
          .single();

        if (!error && data) {
          data.services = (data.services || []).filter(s => s.available);
          
          // Inject Reviews Logic from public view
          const reviews = data.business_reviews || [];
          data.reviewCount = reviews.length;
          data.ratingAvg = data.reviewCount > 0 
            ? (reviews.reduce((sum, r) => sum + r.rating, 0) / data.reviewCount).toFixed(1)
            : "5.0";
            
          data.reviews = reviews.filter(r => !!r.feedback).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

          setBusiness(data);
        }
      }
      setLoading(false);
    }
    init();
  }, [id]);

  const toggle = (svc) =>
    setSelectedServices((prev) =>
      prev.find((s) => s.id === svc.id) ? prev.filter((s) => s.id !== svc.id) : [...prev, svc]
    );

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ file: f, name: f.name, id: Date.now() + Math.random() })),
    ]);
  };

  const handleReceiptUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      setReceiptFile(e.target.files[0]);
    }
  };

  const total = selectedServices.reduce((s, x) => s + Number(x.price), 0);

  const generateFileName = (fileName) => {
    const ext = fileName.split('.').pop();
    const random = Math.random().toString(36).substring(2, 10);
    return `${Date.now()}_${random}.${ext}`;
  };

  const checkout = async () => {
    if (!user) return alert("You must be logged in to place an order.");
    if (!isCustomer) return alert("Only registered customers can place orders.");
    if (!selectedServices.length) return alert("Please select at least one service.");
    if (paymentMethod === "E-Wallet" && !receiptFile) return alert("Please upload your E-Wallet payment receipt.");
    if (!uploadedFiles.length) return alert("Please upload design files for proofing.");

    setIsProcessing(true);

    try {
      const uid = user.id;
      
      // Upload Design Files
      const designFileUrls = [];
      for (const item of uploadedFiles) {
        const filePath = `${uid}/${generateFileName(item.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("order-assets")
          .upload(filePath, item.file);

        if (uploadError) throw new Error("Failed to upload design files: " + uploadError.message);

        const { data: urlData } = supabase.storage
          .from("order-assets")
          .getPublicUrl(filePath);
          
        designFileUrls.push({ name: item.name, url: urlData.publicUrl });
      }

      // Upload Receipt
      let receiptUrl = null;
      if (paymentMethod === "E-Wallet" && receiptFile) {
        const filePath = `${uid}/receipt_${generateFileName(receiptFile.name)}`;
        const { error: receiptError } = await supabase.storage
          .from("order-assets")
          .upload(filePath, receiptFile);

        if (receiptError) throw new Error("Failed to upload receipt: " + receiptError.message);

        const { data: urlData } = supabase.storage
          .from("order-assets")
          .getPublicUrl(filePath);
        receiptUrl = urlData.publicUrl;
      }

      // Insert Order
      const { error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: uid,
          business_id: business.id,
          status: "PLACED",
          payment_method: paymentMethod,
          total: total,
          items: selectedServices,
          receipt_url: receiptUrl,
          design_files: designFileUrls
        });

      if (orderError) throw new Error("Failed to place order: " + orderError.message);

      alert(`Order placed successfully via ${paymentMethod}! Redirecting to tracking...`);
      router.push("/track");
    } catch (err) {
      console.error(err);
      alert(err.message);
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F4F4F1] font-mono">
        <Loader2 className="animate-spin text-black mb-4" size={48} />
        <p className="uppercase tracking-[0.3em] text-xs">Fetching_Node_Data...</p>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-24 text-center">
        <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-4">Node_Not_Found</h1>
        <p className="font-mono text-sm uppercase opacity-50">Error 404: Access to specified business ID denied or inactive.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F1] text-[#1A1A1A] font-sans pb-24">
      {/* ── HEADER SECTION ── */}
      <header className="bg-white border-b-4 border-black px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-4 h-4 bg-[#FF3E00] rotate-45" />
            <span className="font-mono text-[10px] uppercase tracking-[0.4em] opacity-40">Unit_Profile_v2.0</span>
          </div>

          <h1 className="text-6xl font-black uppercase italic tracking-tighter leading-none mb-6">
            {business.name || "UNNAMED_UNIT"}
          </h1>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 bg-black text-white px-3 py-1 font-mono text-[10px] uppercase tracking-widest">
              <MapPin size={12} className="text-[#FFF200]" /> {business.address}
            </div>
            <div className="flex items-center gap-2 font-black italic text-lg text-black">
              <Star size={20} fill="currentColor" className="text-black" /> {business.ratingAvg} <span className="text-[10px] uppercase font-mono opacity-60 not-italic tracking-widest mt-1">({business.reviewCount} INTEL)</span>
            </div>
            <div className="font-mono text-[10px] uppercase opacity-40 tracking-tighter">
              ID: {business.id.split('-')[0]} // STATUS: ONLINE
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 mt-12 grid grid-cols-1 lg:grid-cols-3 gap-12">

        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-2 space-y-16">

          {/* DESCRIPTION */}
          {business.description && (
            <section className="bg-white border-2 border-black p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-2 mb-4 border-b border-zinc-100 pb-2">
                <Info size={16} />
                <h3 className="font-black uppercase text-xs tracking-widest italic">Unit_Intel</h3>
              </div>
              <p className="text-zinc-600 leading-relaxed italic">{business.description}</p>
            </section>
          )}

          {/* CUSTOMER REVIEWS */}
          {(business.reviews?.length > 0) && (
            <section className="bg-[#EBEBE8] border-4 border-black p-8">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-3 mb-6">
                 Client_Feedback <span className="bg-black text-white px-2 py-0.5 text-[10px] not-italic">{business.reviews.length} ENTRIES</span>
              </h2>
              <div className="space-y-4">
                {business.reviews.map((r, idx) => (
                  <div key={idx} className="bg-white border-2 border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                     <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-black uppercase italic text-xs mb-1">{r.customer_name || "AUTHORIZED_CLIENT"}</p>
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map(star => (
                              <Star key={star} size={12} fill={star <= r.rating ? "black" : "none"} className={star <= r.rating ? "text-black" : "text-gray-300"} />
                            ))}
                          </div>
                        </div>
                        <span className="font-mono text-[9px] uppercase tracking-widest opacity-40">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                     </div>
                     <p className="font-mono text-xs uppercase text-zinc-800 leading-relaxed mt-2 border-t border-black/10 pt-3">
                       "{r.feedback}"
                     </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SERVICE SELECTION */}
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter flex items-center gap-4">
                <span className="bg-[#FFF200] px-3 py-1 text-black not-italic border-2 border-black">01</span>
                Service_Manifest
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {business.services.map((svc) => {
                const isSelected = selectedServices.some((s) => s.id === svc.id);
                return (
                  <button
                    key={svc.id}
                    onClick={() => toggle(svc)}
                    className={`group relative text-left p-6 border-2 transition-all ${isSelected
                        ? "bg-black text-white border-black shadow-[8px_8px_0px_0px_rgba(255,62,0,1)] -translate-y-1"
                        : "bg-white border-black hover:bg-[#FFF200]/10"
                      }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${isSelected ? 'border-white bg-white text-black' : 'border-black bg-black text-white'}`}>
                        {svc.category || "GENERAL"}
                      </span>
                      {isSelected && <CheckCircle2 className="text-[#FF3E00]" size={20} />}
                    </div>

                    <p className="font-black uppercase italic text-xl mb-1 leading-none">{svc.name}</p>
                    <p className={`text-[11px] font-medium leading-relaxed mb-6 opacity-60 ${isSelected ? 'text-white' : 'text-zinc-500'}`}>
                      {svc.description || "NO_DESCRIPTION_AVAILABLE"}
                    </p>

                    <div className="flex justify-between items-end">
                      <p className={`text-2xl font-black italic ${isSelected ? 'text-[#FFF200]' : 'text-black'}`}>
                        ₱{Number(svc.price).toFixed(2)}
                      </p>
                      <ChevronRight size={18} className={`${isSelected ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'} transition-all`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* UPLOAD SECTION */}
          <section>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter flex items-center gap-4 mb-8">
              <span className="bg-[#FFF200] px-3 py-1 text-black not-italic border-2 border-black">02</span>
              Blueprint_Upload
            </h2>

            <label className="flex flex-col items-center justify-center gap-4 p-12 border-4 border-dashed border-black/20 bg-white hover:bg-[#00A8E8]/5 hover:border-[#00A8E8] transition-all cursor-pointer group">
              <input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.ai,.psd" onChange={handleFileUpload} />
              <UploadCloud size={48} className="text-black group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <p className="font-black uppercase italic text-xl">Upload_Operational_Files</p>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-40 mt-1">PDF, AI, PSD, SVG (MAX 50MB)</p>
              </div>
            </label>

            {uploadedFiles.length > 0 && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {uploadedFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 bg-black text-white p-3 border-l-4 border-[#FFF200] overflow-hidden">
                    <FileText size={16} className="text-[#FFF200] shrink-0" />
                    <span className="font-mono text-[10px] uppercase truncate">{f.name}</span>
                    <button onClick={(e) => { e.preventDefault(); setUploadedFiles(prev => prev.filter(x => x.id !== f.id)); }} className="ml-auto text-white opacity-50 hover:opacity-100 hover:text-[#FF3E00]">
                      <AlertTriangle size={12} className="rotate-45" /> {/* Close button sort of */}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── RIGHT COLUMN: SUMMARY ── */}
        <aside className="lg:sticky lg:top-12 h-fit">
          <div className="bg-white border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="bg-black text-white px-6 py-4 flex items-center justify-between">
              <h2 className="font-black uppercase italic tracking-widest text-sm">Order_Specification</h2>
              <Hash size={16} className="text-[#FFF200]" />
            </div>

            <div className="p-6">
              {selectedServices.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-black/10">
                  <p className="font-mono text-[10px] uppercase opacity-40">Waiting_for_input...</p>
                </div>
              ) : (
                <div className="space-y-4 mb-8">
                  {selectedServices.map((s) => (
                    <div key={s.id} className="flex justify-between items-start group">
                      <div>
                        <p className="font-black uppercase italic text-xs leading-none">{s.name}</p>
                        <p className="font-mono text-[9px] uppercase opacity-40">Unit_Price</p>
                      </div>
                      <span className="font-mono text-xs font-bold">₱{Number(s.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t-4 border-black pt-6 mb-8">
                <div className="flex justify-between items-end">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] font-black">Gross_Total</span>
                  <span className="text-4xl font-black italic leading-none">₱{total.toFixed(2)}</span>
                </div>
              </div>

              {/* PAYMENT METHOD SELECTION */}
              <div className="mb-6 border-b-2 border-black pb-6 space-y-3">
                 <p className="font-black uppercase italic text-xs tracking-widest">Payment_Method</p>
                 <div className="grid grid-cols-2 gap-2">
                   <button 
                     onClick={() => setPaymentMethod("COD")}
                     className={`py-3 px-2 border-2 text-xs font-black uppercase flex items-center justify-center gap-1 transition-all ${paymentMethod === 'COD' ? 'bg-[#FFF200] border-black text-black' : 'bg-white border-black text-black opacity-50 hover:opacity-100'}`}
                   >
                     <Banknote size={14} /> COD
                   </button>
                   <button 
                     onClick={() => setPaymentMethod("E-Wallet")}
                     className={`py-3 px-2 border-2 text-xs font-black uppercase flex items-center justify-center gap-1 transition-all ${paymentMethod === 'E-Wallet' ? 'bg-[#00A8E8] border-black text-white' : 'bg-white border-black text-black opacity-50 hover:opacity-100'}`}
                   >
                     <CreditCard size={14} /> E-Wallet
                   </button>
                 </div>

                 {paymentMethod === "E-Wallet" && (
                   <div className="mt-4 p-4 bg-zinc-100 border border-black/20">
                     <p className="font-mono text-[9px] uppercase tracking-widest mb-3 opacity-60">Upload E-Wallet Receipt</p>
                     <input type="file" accept="image/*" onChange={handleReceiptUpload} className="text-xs font-mono w-full" />
                     {receiptFile && (
                       <div className="mt-2 text-[10px] text-green-600 font-bold uppercase truncate">
                         Attached: {receiptFile.name}
                       </div>
                     )}
                   </div>
                 )}
              </div>

              {!isCustomer ? (
                <div className="bg-red-50 text-red-600 border-2 border-red-200 p-4 font-mono text-[10px] uppercase tracking-wider text-center flex flex-col gap-2">
                  <AlertTriangle size={24} className="mx-auto" />
                  Only registered CUSTOMERS can place orders. Sign in to continue.
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={checkout}
                    disabled={isProcessing || !selectedServices.length}
                    className="w-full bg-[#1A1A1A] text-white py-5 px-6 font-black uppercase italic text-sm flex items-center justify-center gap-3 hover:bg-black transition-all shadow-[6px_6px_0px_0px_rgba(255,62,0,1)] disabled:opacity-50 disabled:shadow-none translate-y-0 hover:-translate-y-1 active:translate-y-1 active:shadow-none group"
                  >
                    {isProcessing ? (
                      <><Loader2 size={18} className="animate-spin" /> EXECUTING...</>
                    ) : (
                      <>EXECUTE_ORDER <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" /></>
                    )}
                  </button>
                </div>
              )}

              <div className="mt-8 p-4 bg-[#F4F4F1] border border-black/10">
                <p className="font-mono text-[9px] uppercase leading-relaxed opacity-50">
                  // NOTICE: By executing, you agree to version control V1 of uploaded assets. Initial proofing begins within 24 standard operational hours.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}