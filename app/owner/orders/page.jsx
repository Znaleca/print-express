"use client";

import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ChevronDown, CheckCircle, Eye, UserRound, Phone,
  ExternalLink, Activity, Package, Clock,
  CreditCard, AlertCircle, MapPin, X, ShoppingBag, Upload, RefreshCcw, FileText, Loader2, Search, SlidersHorizontal, Truck, MessageSquare
} from "lucide-react";
import dynamic from "next/dynamic";
import ReceiptModal from "@/components/ReceiptModal";
import { getUploadExtension, PRIVATE_ASSETS_BUCKET, optimizeImageForUpload, resolveStorageUrl, toStorageRef } from "@/lib/imageUpload";
import { formatPesoAmount, getOrderPaymentSummary } from "@/lib/paymentSummary";
import OwnerPageSkeleton from "@/components/owner/OwnerPageSkeleton";

const LocationPicker = dynamic(() => import("@/components/owner/LocationPicker"), { ssr: false });

const MANILA_TIME_ZONE = "Asia/Manila";

const formatManilaDateTime = (value) => {
  if (!value) return "N/A";
  return new Date(value).toLocaleString("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const ORDER_PAGE_SIZE = 5;
const COMPLETED_STATUSES = ["COMPLETED", "DELIVERY_COMPLETED"];
// Owners receive review text only through the dedicated Reviews API, where it
// is masked. Keep the broad order workflow from requesting raw feedback.
const OWNER_ORDER_SELECT = `
  id, customer_id, business_id, status, payment_method, total, customer_phone,
  items, receipt_url, cancel_reason, cancelled_at, refund_proof_url,
  refund_receipt_url, refund_reason, refund_requested_at, refunded_at,
  downpayment_amount, balance_amount, fully_paid, design_files,
  quotation_valid_until, quotation_terms, tax_amount, discount_amount,
  created_at, updated_at, delivery_type, delivery_address,
  delivery_coordinates, fulfillment_mode, expected_fulfillment_at,
  delivery_fee, delivery_distance_km, delivery_extra_distance_km,
  delivery_base_fee, delivery_extra_fee, confirmed_payment_amount,
  payment_confirmation_status, payment_confirmed_at, payment_confirmed_by,
  remaining_payment_status, remaining_payment_method, remaining_payment_proof_url,
  remaining_payment_proof_name, remaining_payment_proof_content_type,
  remaining_payment_proof_size_bytes, remaining_payment_note,
  remaining_payment_rejection_reason, remaining_payment_submitted_at,
  remaining_payment_reviewed_at, remaining_payment_reviewed_by,
  rating, feedback_masked, feedback_hidden, feedback_hidden_at,
  feedback_hidden_by, review_service_id
`;
const STATUS_META = {
  PENDING: { label: "Pending", className: "bg-[#FFF200]/30 text-[#665F00] ring-[#FFF200]" },
  PLACED: { label: "Order placed", className: "bg-[#FFF200]/30 text-[#665F00] ring-[#FFF200]" },
  PREPARING: { label: "In production", className: "bg-[#00FFFF]/20 text-[#006B6B] ring-[#00BABA]" },
  READY_TO_PICK_UP: { label: "Ready for pickup", className: "bg-[#00FFFF]/20 text-[#006B6B] ring-[#00BABA]" },
  RIDER_ON_THE_WAY: { label: "On the way", className: "bg-[#00FFFF]/20 text-[#006B6B] ring-[#00BABA]" },
  DELIVERY_COMPLETED: { label: "Delivery completed", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  COMPLETED: { label: "Completed", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  CANCELLED: { label: "Cancelled", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  REFUNDED: { label: "Refunded", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  REFUND_PENDING: { label: "Refund pending", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  REFUND_CONFIRMED: { label: "Refund confirmed", className: "bg-rose-50 text-rose-700 ring-rose-200" },
};

const STATUS_STEP_STYLES = {
  PENDING: "border-[#FFF200] bg-[#FFF200]/20 text-[#665F00]",
  PLACED: "border-[#EC008C] bg-[#EC008C]/10 text-[#A30061]",
  PREPARING: "border-[#00BABA] bg-[#00FFFF]/15 text-[#006B6B]",
  READY_TO_PICK_UP: "border-amber-400 bg-amber-50 text-amber-800",
  RIDER_ON_THE_WAY: "border-blue-400 bg-blue-50 text-blue-700",
  DELIVERY_COMPLETED: "border-slate-700 bg-slate-800 text-white",
  COMPLETED: "border-slate-700 bg-slate-800 text-white",
};

const getOrderNumber = (order) => String(order?.id || "").split("-")[0].toUpperCase() || "N/A";

const getDeliveryCoordinates = (order) => {
  let coordinates = order?.delivery_coordinates;
  if (typeof coordinates === "string") {
    try {
      coordinates = JSON.parse(coordinates);
    } catch {
      return null;
    }
  }

  const lat = Number(coordinates?.lat ?? coordinates?.latitude);
  const lng = Number(coordinates?.lng ?? coordinates?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const getOwnerProgressSteps = (deliveryType) => deliveryType === "DELIVERY"
  ? ["PENDING", "PLACED", "PREPARING", "RIDER_ON_THE_WAY", "DELIVERY_COMPLETED"]
  : ["PENDING", "PLACED", "PREPARING", "READY_TO_PICK_UP", "COMPLETED"];

const getNextStatus = (order) => {
  const steps = getOwnerProgressSteps(order?.delivery_type);
  const index = steps.indexOf(order?.status);
  return index >= 0 ? steps[index + 1] || null : null;
};

const getNextActionLabel = (nextStatus, deliveryType) => {
  if (nextStatus === "PLACED") return "Mark as placed";
  if (nextStatus === "PREPARING") return "Start production";
  if (nextStatus === "READY_TO_PICK_UP") return "Ready for pickup";
  if (nextStatus === "RIDER_ON_THE_WAY") return "Send to delivery";
  if (nextStatus === "COMPLETED" || nextStatus === "DELIVERY_COMPLETED") return "Mark as completed";
  return deliveryType === "DELIVERY" ? "Continue delivery" : "Continue order";
};

const paymentActionsAvailableForOrder = (order) => ![
  "CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_CONFIRMED",
  ...COMPLETED_STATUSES,
].includes(order?.status);

function StatusProgress({ status, deliveryType, payment, onRequestUpdateStatus, onCancel, isUpdating }) {
  const isCancelled = ["CANCELLED", "REFUNDED", "REFUND_PENDING", "REFUND_CONFIRMED"].includes(status);
  if (isCancelled) {
    const meta = STATUS_META[status] || STATUS_META.CANCELLED;
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
        <AlertCircle size={16} /> {meta.label}
      </div>
    );
  }

  const orderSteps = getOwnerProgressSteps(deliveryType);
  const currentIndex = orderSteps.indexOf(status);
  const nextStatus = currentIndex >= 0 ? orderSteps[currentIndex + 1] : null;
  const isCompletionStep = nextStatus === "COMPLETED" || nextStatus === "DELIVERY_COMPLETED";
  const completionBlocked = isCompletionStep && !payment?.isPaymentConfirmed;
  return (
    <div className="rounded-2xl border border-[#D8D6CE] bg-[#F6F6F2] px-3 py-3 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Order progress</span>
          <p className="mt-1 text-[10px] font-semibold text-slate-500">
            {nextStatus ? "Progress is read-only. Use Update status to move this order forward." : "This workflow is complete and read-only."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {nextStatus && (
            <>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-[#D8D6CE]">
                Next status: {getNextActionLabel(nextStatus, deliveryType)}
              </span>
              <button
                type="button"
                onClick={() => onRequestUpdateStatus?.(nextStatus)}
                disabled={isUpdating || completionBlocked}
                title={completionBlocked ? "Confirm the full payment before completing this order." : undefined}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C] disabled:cursor-not-allowed disabled:opacity-55 ${completionBlocked ? "border border-slate-300 bg-slate-200 text-slate-500" : "bg-[#1A1A1A] text-white hover:-translate-y-0.5 hover:bg-[#EC008C] hover:shadow-md"}`}
                aria-label={completionBlocked ? "Complete order after payment confirmation" : `Update status to ${STATUS_META[nextStatus]?.label || nextStatus}`}
              >
                {isUpdating ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />}
                <span>{completionBlocked ? "Payment required" : isUpdating ? "Updating..." : "Update status"}</span>
              </button>
            </>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <X size={13} /> Cancel order
            </button>
          )}
        </div>
      </div>
      <div className="pb-1" aria-label="Order status timeline">
      <ol className="flex w-full items-center gap-0" aria-label="Order status progress">
        {orderSteps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = status === step;
          const isNext = step === nextStatus;
          const meta = step === "RIDER_ON_THE_WAY"
            ? { ...STATUS_META.RIDER_ON_THE_WAY, label: "In delivery" }
            : STATUS_META[step];
          const stepColor = STATUS_STEP_STYLES[step] || "bg-white text-slate-600";
          const stepStateClass = isComplete
            ? "border-2 border-slate-300 bg-slate-100 text-slate-500 grayscale"
            : `${stepColor} border-2 ${isCurrent ? "" : isNext ? "opacity-90" : "opacity-70"}`;
          return (
            <Fragment key={step}>
              <li
                title={isNext ? `Next status: ${meta.label}` : isCurrent ? "Current status" : index < currentIndex ? "Completed status" : "Complete the previous status first"}
                aria-label={`${meta.label}${isCurrent ? ", current status" : index < currentIndex ? ", completed status" : isNext ? ", next status" : ", upcoming status"}`}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-center transition-all sm:gap-1.5 sm:px-1.5 ${stepStateClass} ${isCurrent ? "-translate-y-0.5 shadow-[0_3px_0_rgba(26,26,26,0.25)]" : isNext ? "ring-1 ring-[#1A1A1A]/10" : ""}`}
              >
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${isComplete ? "bg-[#1A1A1A] text-[#00FFFF]" : "bg-white text-slate-400 ring-1 ring-[#D8D6CE]"}`}>
                  {isComplete ? <CheckCircle size={14} /> : index + 1}
                </div>
                <span className="min-w-0 whitespace-normal text-[8px] font-bold leading-tight text-current sm:text-[9px]">
                  {meta.label}
                </span>
              </li>
              {index < orderSteps.length - 1 && (
                <li
                  aria-hidden="true"
                  className={`h-0.5 w-2 shrink-0 sm:w-8 ${index < currentIndex ? "bg-[#1A1A1A]" : "bg-[#D8D6CE]"}`}
                />
              )}
            </Fragment>
          );
        })}
      </ol>
      </div>
    </div>
  );
}

export default function OwnerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [ownerBusiness, setOwnerBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMapOrder, setViewMapOrder] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [viewDocType, setViewDocType] = useState("RECEIPT");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [refundModal, setRefundModal] = useState(null);
  const [refundFile, setRefundFile] = useState(null);
  const [refundPreview, setRefundPreview] = useState(null);
  const [refundDragActive, setRefundDragActive] = useState(false);
  const [uploadingRefund, setUploadingRefund] = useState(false);
  const [viewDpReceipt, setViewDpReceipt] = useState(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [statusConfirmModal, setStatusConfirmModal] = useState(null);
  const [statusActionMessage, setStatusActionMessage] = useState(null);
  const [paymentUpdatingId, setPaymentUpdatingId] = useState(null);
  const [paymentConfirmModal, setPaymentConfirmModal] = useState(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [remainingPaymentModal, setRemainingPaymentModal] = useState(null);
  const [remainingPaymentReason, setRemainingPaymentReason] = useState("");
  const [ordersLoadError, setOrdersLoadError] = useState("");

  useEffect(() => () => {
    if (refundPreview) URL.revokeObjectURL(refundPreview);
  }, [refundPreview]);

  const attachCustomerProfiles = async (rows, business) => {
    const customerIds = [...new Set((rows || []).map((order) => order.customer_id).filter(Boolean))];
    let profileMap = {};

    if (customerIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("id", customerIds);

      if (profileError) {
        console.warn("[Orders] Could not fetch customer profiles:", profileError.message);
      }

      profileMap = (profileRows || []).reduce((map, profile) => {
        map[profile.id] = profile;
        return map;
      }, {});
    }

    return (rows || []).map((order) => ({
      ...order,
      businesses: business,
      customer_profile: profileMap[order.customer_id] || null,
    }));
  };

  const fetchOrdersForBusiness = async (business) => {
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select(OWNER_ORDER_SELECT)
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });
    if (ordersError) throw ordersError;
    return attachCustomerProfiles(ordersData || [], business);
  };

  useEffect(() => {
    let active = true;
    let subscription;

    const load = async () => {
      try {
        setOrdersLoadError("");
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("Your owner session has expired. Please sign in again.");

        const { data: biz, error: businessError } = await supabase
          .from("businesses")
          .select("id, name, address, phone")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (businessError) throw businessError;

        if (biz) {
          if (active) setOwnerBusiness(biz);
          if (active) setOrders(await fetchOrdersForBusiness(biz));

          subscription = supabase
            .channel(`owner_orders_status_${biz.id}_${Date.now()}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "orders",
                filter: `business_id=eq.${biz.id}`
              },
              (payload) => {
                if (payload.eventType === "INSERT") {
                  void attachCustomerProfiles([payload.new], biz).then(([newOrder]) => {
                    if (active) setOrders((prev) => prev.some((order) => order.id === newOrder.id) ? prev : [newOrder, ...prev]);
                  });
                } else if (payload.eventType === "UPDATE") {
                  void attachCustomerProfiles([payload.new], biz).then(([updatedOrder]) => {
                    if (active) {
                      setOrders((prev) => prev.map((o) => (o.id === payload.new.id ? updatedOrder : o)));
                    }
                  });
                } else if (payload.eventType === "DELETE") {
                  if (active) setOrders((prev) => prev.filter((order) => order.id !== payload.old?.id));
                }
              }
            )
            .subscribe();
        }
      } catch (error) {
        if (active) setOrdersLoadError(error.message || "Orders are temporarily unavailable. Please retry.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();

    return () => {
      active = false;
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  const refreshOrders = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setOrdersLoadError("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your owner session has expired. Please sign in again.");

      let business = ownerBusiness;
      if (!business) {
        const { data, error } = await supabase
          .from("businesses")
          .select("id, name, address, phone")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        business = data;
      }

      if (!business) {
        setOrders([]);
        return;
      }

      setOwnerBusiness(business);
      setOrders(await fetchOrdersForBusiness(business));
    } catch (error) {
      setOrdersLoadError(error.message || "Orders are temporarily unavailable. Please retry.");
    } finally {
      setRefreshing(false);
    }
  };

  const refreshOrder = async (orderId) => {
  const { data, error } = await supabase
    .from("orders")
      .select(OWNER_ORDER_SELECT)
      .eq("id", orderId)
      .maybeSingle();
    if (error || !data) return false;
    setOrders((prev) => prev.map((order) => (
      order.id === orderId
        ? { ...order, ...data, businesses: order.businesses, customer_profile: order.customer_profile }
        : order
    )));
    return true;
  };

  const getPaymentErrorMessage = (error) => {
    const message = String(error?.message || "");
    if (/schema cache|could not find the function|owner_confirm_order_payment/i.test(message)) {
      return "Payment confirmation is not ready on the server yet. Ask an administrator to apply the latest Supabase migration, then retry.";
    }
    if (/payment proof is required/i.test(message)) {
      return "Review the payment proof before confirming this E-Wallet payment.";
    }
    if (/exceeds the remaining balance/i.test(message)) {
      return "The payment amount is higher than the current balance. We refreshed the order; enter the remaining balance or less.";
    }
    if (/already confirmed/i.test(message)) {
      return "This order’s payment was already confirmed. We refreshed the latest order state.";
    }
    return "We could not confirm this payment. Please refresh the order and retry.";
  };

  const sendPaymentNotification = async (orderId, type) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch("/api/orders/payment-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData?.session?.access_token || ""}`,
        },
        body: JSON.stringify({ orderId, type }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return payload.error || "Customer notification could not be sent.";
      if (payload.skipped) return payload.reason || "Customer notification was skipped.";
      if (payload.warning) return payload.warning;
      return null;
    } catch {
      return "Customer notification service is temporarily unavailable.";
    }
  };

  const openPaymentProof = async (order) => {
    const paymentReference = order?.remaining_payment_proof_url;
    if (paymentReference) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch(`/api/orders/payment-proof?orderId=${encodeURIComponent(order.id)}`, {
          headers: { Authorization: `Bearer ${sessionData?.session?.access_token || ""}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.proof?.url) throw new Error("This payment proof is unavailable or access was denied.");
        setViewDpReceipt({ url: payload.proof.url, contentType: payload.proof.contentType, name: payload.proof.name });
        return;
      } catch (error) {
        setStatusActionMessage({ type: "error", text: error.message || "This payment proof is unavailable or access was denied." });
        return;
      }
    }

    const url = await resolveStorageUrl(order?.receipt_url || order?.payment_proof_url);
    if (url) setViewDpReceipt({ url, contentType: "image/*", name: "Payment proof" });
    else setStatusActionMessage({ type: "error", text: "This payment proof is unavailable or access was denied." });
  };

  const requestRemainingPaymentReview = (order, payment, decision) => {
    if (paymentUpdatingId || !payment?.balance || !paymentActionsAvailableForOrder(order)) return;
    setRemainingPaymentReason("");
    setRemainingPaymentModal({ order, decision, remainingBalance: payment.balance });
  };

  const handleReviewRemainingPayment = async () => {
    if (!remainingPaymentModal || paymentUpdatingId) return;
    const { order, decision } = remainingPaymentModal;
    setPaymentUpdatingId(order.id);
    setStatusActionMessage(null);
    try {
      const { data, error } = await supabase.rpc("owner_review_remaining_payment", {
        p_order_id: order.id,
        p_decision: decision,
        p_reason: remainingPaymentReason.trim() || null,
      });
      if (error) throw error;
      const updatedOrder = Array.isArray(data) ? data[0] : data;
      if (!updatedOrder?.id) throw new Error("The server did not return the updated payment state.");
      setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, ...updatedOrder } : item));
      await refreshOrder(order.id);
      setRemainingPaymentModal(null);
      setRemainingPaymentReason("");
      setStatusActionMessage({
        type: "success",
        text: decision === "REJECT"
          ? "Payment submission rejected. The customer can resubmit it."
          : decision === "MANUAL"
            ? "Full payment confirmed manually. The final completion action is now enabled."
            : "Remaining payment approved in full. The final completion action is now enabled.",
      });
    } catch (error) {
      await refreshOrder(order.id);
      setStatusActionMessage({ type: "error", text: getPaymentErrorMessage(error) });
    } finally {
      setPaymentUpdatingId(null);
    }
  };

  const requestPaymentConfirmation = (order, payment) => {
    if (paymentUpdatingId || !payment?.canConfirm || !payment?.balance) return;
    const suggestedAmount = payment.confirmedAmount > 0
      ? payment.balance
      : Math.min(payment.balance, payment.requestedDownpayment || payment.balance);
    setPaymentAmountInput(String(Number(suggestedAmount.toFixed(2))));
    setPaymentConfirmModal({
      order,
      orderId: order.id,
      orderNumber: getOrderNumber(order),
      paymentMethod: payment.paymentMethod || "Payment",
      proofPresent: payment.paymentProofPresent,
      remainingBalance: payment.balance,
    });
  };

  const handleConfirmPayment = async () => {
    if (!paymentConfirmModal || paymentUpdatingId) return;
    const amount = Number(paymentAmountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatusActionMessage({ type: "error", text: "Enter the amount that was actually received." });
      return;
    }

    const { orderId, order } = paymentConfirmModal;
    setPaymentUpdatingId(orderId);
    setStatusActionMessage(null);
    try {
      const { data, error } = await supabase.rpc("owner_confirm_order_payment", {
        p_order_id: orderId,
        p_amount: amount,
      });
      if (error) throw error;
      const updatedOrder = Array.isArray(data) ? data[0] : data;
      if (!updatedOrder?.id) throw new Error("The server did not return the updated payment state.");

      setOrders((prev) => prev.map((item) => item.id === orderId ? { ...item, ...updatedOrder } : item));
      await refreshOrder(orderId);

      const updatedPayment = getOrderPaymentSummary({ ...order, ...updatedOrder });
      const notificationMessage = updatedPayment.isPaidInFull
        ? null
        : await sendPaymentNotification(orderId, "BALANCE_DUE");
      setPaymentConfirmModal(null);
      setPaymentAmountInput("");
      setStatusActionMessage({
        type: notificationMessage ? "warning" : "success",
        text: notificationMessage
          ? `Payment confirmed. Remaining balance: ${formatPesoAmount(updatedPayment.balance)}. ${notificationMessage}`
          : updatedPayment.isPaidInFull
            ? "Payment confirmed in full. The final completion action is now enabled."
            : `Payment confirmed. Remaining balance: ${formatPesoAmount(updatedPayment.balance)}.`,
      });
    } catch (error) {
      await refreshOrder(orderId);
      setStatusActionMessage({ type: "error", text: getPaymentErrorMessage(error) });
    } finally {
      setPaymentUpdatingId(null);
    }
  };

  const handleRequestRemainingPayment = async (order, payment) => {
    if (paymentUpdatingId || !payment?.balance) return;
    setPaymentUpdatingId(order.id);
    setStatusActionMessage(null);
    const notificationMessage = await sendPaymentNotification(order.id, "BALANCE_DUE");
    setStatusActionMessage({
      type: notificationMessage ? "warning" : "success",
      text: notificationMessage
        ? `The remaining balance is ${formatPesoAmount(payment.balance)}. ${notificationMessage}`
        : `Payment reminder sent. The remaining balance is ${formatPesoAmount(payment.balance)}.`,
    });
    setPaymentUpdatingId(null);
  };

  const getStatusErrorMessage = (error) => {
    const message = String(error?.message || "");
    if (/schema cache|could not find the function|owner_advance_order_status/i.test(message)) {
      return "Order status updates are not ready on the server yet. Ask an administrator to apply the latest Supabase migration, then retry.";
    }
    if (/invalid order status transition/i.test(message)) {
      return "This order changed before your update. We refreshed its latest status; choose only the next available step.";
    }
    if (/payment confirmation required|remaining balance/i.test(message)) {
      return "Confirm that the order is fully paid before completing it. We refreshed the latest payment state.";
    }
    if (/not found|do not own|access denied/i.test(message)) {
      return "This order is no longer available to your shop. Please refresh the page.";
    }
    return "We could not update this order status. Please retry.";
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    if (statusUpdatingId) return;
    setStatusUpdatingId(orderId);
    setStatusActionMessage(null);
    try {
      const { data, error } = await supabase.rpc("owner_advance_order_status", {
        p_next_status: newStatus,
        p_order_id: orderId,
      });

      if (error) throw error;
      const updatedOrder = Array.isArray(data) ? data[0] : data;
      if (!updatedOrder?.status) throw new Error("The server did not return the updated order.");
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updatedOrder } : o))
      );
      await refreshOrder(orderId);

      let notificationMessage = null;
      if (["PLACED", "PREPARING", "READY_TO_PICK_UP", "RIDER_ON_THE_WAY"].includes(newStatus)) {
        notificationMessage = await sendStatusSms(orderId, newStatus);
      }
      if (["DELIVERY_COMPLETED", "COMPLETED"].includes(newStatus)) {
        const paymentNotificationMessage = await sendPaymentNotification(orderId, "COMPLETION");
        notificationMessage = notificationMessage || paymentNotificationMessage;
      }
      setStatusActionMessage({
        type: notificationMessage ? "warning" : "success",
        text: notificationMessage || `Order moved to ${STATUS_META[newStatus]?.label || newStatus}.`,
      });
    } catch (err) {
      await refreshOrder(orderId);
      setStatusActionMessage({
        type: "error",
        orderId,
        nextStatus: newStatus,
        text: getStatusErrorMessage(err),
      });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const requestStatusUpdate = (orderId, order, nextStatus) => {
    if (statusUpdatingId || !nextStatus) return;
    setStatusConfirmModal({
      orderId,
      currentStatus: order.status,
      nextStatus,
      orderNumber: String(order.id || "").split("-")[0].toUpperCase(),
    });
  };

  const confirmStatusUpdate = () => {
    if (!statusConfirmModal || statusUpdatingId) return;
    const { orderId, nextStatus } = statusConfirmModal;
    setStatusConfirmModal(null);
    void handleUpdateStatus(orderId, nextStatus);
  };

  const sendStatusSms = async (orderId, status) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const smsRes = await fetch("/api/orders/status-sms", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData?.session?.access_token || ""}`,
          },
          body: JSON.stringify({ orderId, status }),
        });
      const smsData = await smsRes.json().catch(() => ({}));
      if (smsData.skipped && smsRes.status === 409) {
        console.info("[Orders] SMS skipped because the order status changed before notification.");
        return "Order status updated, but the customer notification was skipped because the order changed again.";
      }
      if (!smsRes.ok) {
        console.warn("[Orders] SMS notification failed:", smsData);
        return `Order status updated, but the customer notification failed: ${smsData.error || "try again later"}.`;
      }
      if (smsData.skipped) return `Order status updated, but the customer notification was not sent: ${smsData.reason}.`;
    } catch {
      return "Order status updated, but the customer notification service is temporarily unavailable.";
    }
    return null;
  };

  const handleCancelOrder = async () => {
    if (!cancelModal || cancelling) return;
    setCancelling(true);
    setStatusActionMessage(null);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          cancel_reason: cancelReason || "Cancelled by shop owner",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", cancelModal.orderId);

      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === cancelModal.orderId ? { ...o, status: "CANCELLED", cancel_reason: cancelReason } : o));
      await sendStatusSms(cancelModal.orderId, "CANCELLED");
      setCancelModal(null);
      setCancelReason("");
      setStatusActionMessage({ type: "success", text: "Order cancelled. Review the refund section if the customer has already paid." });
    } catch (err) {
      setStatusActionMessage({ type: "error", text: "We could not cancel this order. It may have changed already; close this message and retry from the order." });
    } finally {
      setCancelling(false);
    }
  };

  const handleRefundFile = (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setStatusActionMessage({ type: "error", text: "Please choose a PNG, JPG, or WebP image for the refund proof." });
      return;
    }
    setStatusActionMessage(null);
    setRefundFile(file);
    setRefundPreview(URL.createObjectURL(file));
  };

  const closeRefundModal = () => {
    if (uploadingRefund) return;
    setRefundModal(null);
    setRefundFile(null);
    setRefundPreview(null);
    setRefundDragActive(false);
  };

  const handleUploadRefund = async () => {
    if (uploadingRefund) return;
    if (!refundModal || !refundFile) {
      setStatusActionMessage({ type: "error", text: "Please select a proof image before submitting the refund." });
      return;
    }
    setUploadingRefund(true);
    setStatusActionMessage(null);
    try {
      const optimizedRefund = await optimizeImageForUpload(refundFile);
      const fileExt = getUploadExtension(optimizedRefund);
      const filePath = `refunds/${refundModal.orderId}/${Date.now()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage.from(PRIVATE_ASSETS_BUCKET).upload(filePath, optimizedRefund, {
        cacheControl: "31536000",
        contentType: optimizedRefund.type,
      });
      if (uploadErr) throw uploadErr;

      const storageRef = toStorageRef(PRIVATE_ASSETS_BUCKET, filePath);

      const { error } = await supabase
        .from("orders")
        .update({
          status: "REFUNDED",
          refund_proof_url: storageRef,
          refunded_at: new Date().toISOString(),
        })
        .eq("id", refundModal.orderId);

      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === refundModal.orderId ? { ...o, status: "REFUNDED", refund_proof_url: storageRef } : o));
      setRefundModal(null);
      setRefundFile(null);
      setRefundPreview(null);
      setStatusActionMessage({ type: "success", text: "Refund proof uploaded and the order is now marked refunded." });
    } catch (err) {
      setStatusActionMessage({ type: "error", text: "We could not upload the refund proof. Check the file and try again." });
    } finally {
      setUploadingRefund(false);
    }
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredOrders = orders.filter(o => {
    if (activeTab === "PENDING" && !["PLACED", "PENDING"].includes(o.status)) return false;
    if (activeTab === "PREPARING" && o.status !== "PREPARING") return false;
    if (activeTab === "READY" && !["READY_TO_PICK_UP", "RIDER_ON_THE_WAY"].includes(o.status)) return false;
    if (activeTab === "COMPLETED" && !["COMPLETED", "DELIVERY_COMPLETED"].includes(o.status)) return false;
    if (activeTab === "CANCELLED" && !["CANCELLED", "REFUNDED", "REFUND_PENDING", "REFUND_CONFIRMED"].includes(o.status)) return false;
    if (!normalizedSearch) return true;
    const orderNumber = String(o.id || "").split("-")[0];
    const searchableText = [
      orderNumber,
      o.status,
      o.customer_name,
      o.customer_profile?.full_name,
      o.customer_profile?.email,
      o.customer_phone,
      o.customer_profile?.phone,
      ...(o.items || []).flatMap((item) => [item.name, item.selected_specs?.size, item.selected_specs?.material, item.selected_specs?.quality]),
    ].filter(Boolean).join(" ").toLowerCase();
    return searchableText.includes(normalizedSearch);
  });

  const needsActionCount = orders.filter((order) => ["PENDING", "PLACED", "PREPARING"].includes(order.status)).length;
  const newOrderCount = orders.filter((order) => ["PENDING", "PLACED"].includes(order.status)).length;
  const inProductionCount = orders.filter((order) => order.status === "PREPARING").length;
  const readyCount = orders.filter((order) => ["READY_TO_PICK_UP", "RIDER_ON_THE_WAY"].includes(order.status)).length;
  const completedCount = orders.filter((order) => ["COMPLETED", "DELIVERY_COMPLETED"].includes(order.status)).length;
  const refundCount = orders.filter((order) => ["CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_CONFIRMED"].includes(order.status)).length;
  const hasActiveFilters = Boolean(normalizedSearch || activeTab !== "ALL");

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE));
  const pageStart = (currentPage - 1) * ORDER_PAGE_SIZE;
  const visibleOrders = filteredOrders.slice(pageStart, pageStart + ORDER_PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const resetFilters = () => {
    setSearchQuery("");
    setActiveTab("ALL");
    setCurrentPage(1);
  };

  const emptyStateTitle = orders.length === 0
    ? "No orders yet."
    : normalizedSearch
      ? `No orders match “${searchQuery.trim()}”.`
      : `No ${activeTab === "PREPARING" ? "in-production" : activeTab.toLowerCase()} orders right now.`;
  const emptyStateDescription = orders.length === 0
    ? "New customer orders will appear here when they are placed."
    : normalizedSearch
      ? "Try a different order number, customer, email, phone, or item."
      : "Choose another status filter or reset the filters to see more orders.";

  if (loading) {
    return <OwnerPageSkeleton rows={4} />;
  }

  return (
    <>
      {viewReceipt && <ReceiptModal order={viewReceipt} onClose={() => setViewReceipt(null)} isOwner={true} initialDocType={viewDocType} />}

      {/* Downpayment Receipt Popup */}
      {viewDpReceipt && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setViewDpReceipt(null)}>
          <div className="dialog-surface max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-900">Payment proof</h3>
              <button onClick={() => setViewDpReceipt(null)} className="p-1 text-slate-400 hover:text-slate-800"><X size={18} /></button>
            </div>
            {viewDpReceipt.contentType === "application/pdf" ? (
              <iframe src={viewDpReceipt.url} title={viewDpReceipt.name || "Payment proof PDF"} className="h-[60vh] w-full rounded-xl border border-slate-200" />
            ) : (
              <img src={viewDpReceipt.url} alt={viewDpReceipt.name || "Payment proof"} className="w-full h-auto rounded-xl max-h-[60vh] object-contain border border-slate-200" />
            )}
            <a href={viewDpReceipt.url} download={viewDpReceipt.name || "payment-proof"} target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 transition-colors hover:bg-slate-100">Download proof</a>
          </div>
        </div>
      )}

      {remainingPaymentModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="remaining-payment-review-title" onClick={() => !paymentUpdatingId && setRemainingPaymentModal(null)}>
          <div className="dialog-surface w-full max-w-md space-y-5 p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#EC008C]">Payment review</p>
                <h3 id="remaining-payment-review-title" className="mt-1 text-lg font-black tracking-tight text-slate-950">
                  {remainingPaymentModal.decision === "REJECT" ? "Reject remaining payment?" : remainingPaymentModal.decision === "MANUAL" ? "Confirm payment manually?" : "Approve remaining payment?"}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">This action records the review and updates the customer’s payment status immediately.</p>
              </div>
              <button type="button" onClick={() => setRemainingPaymentModal(null)} disabled={Boolean(paymentUpdatingId)} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40" aria-label="Close payment review"><X size={18} /></button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Order</span><strong className="text-slate-950">#{getOrderNumber(remainingPaymentModal.order)}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3"><span className="text-slate-500">Amount to confirm</span><strong className="text-[#EC008C]">{formatPesoAmount(remainingPaymentModal.remainingBalance)}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3"><span className="text-slate-500">Submitted method</span><strong className="text-slate-950">{remainingPaymentModal.order.remaining_payment_method || "Manual confirmation"}</strong></div>
            </div>
            <div>
              <label htmlFor="remaining-payment-review-reason" className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Note or reason (optional)</label>
              <textarea id="remaining-payment-review-reason" value={remainingPaymentReason} onChange={(event) => setRemainingPaymentReason(event.target.value)} maxLength={500} rows={3} placeholder={remainingPaymentModal.decision === "REJECT" ? "Tell the customer what needs to be corrected" : "Add a note for the payment record"} className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 outline-none focus:border-[#00AFC0] focus:ring-2 focus:ring-[#00AFC0]/20" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setRemainingPaymentModal(null)} disabled={Boolean(paymentUpdatingId)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleReviewRemainingPayment} disabled={Boolean(paymentUpdatingId)} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${remainingPaymentModal.decision === "REJECT" ? "bg-[#EC008C] hover:bg-[#c90076]" : "bg-[#1A1A1A] hover:bg-[#007C82]"}`}>{paymentUpdatingId ? "Saving..." : remainingPaymentModal.decision === "REJECT" ? "Reject payment" : remainingPaymentModal.decision === "MANUAL" ? "Confirm manually" : "Approve payment"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Proof Upload Modal */}
      {refundModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={closeRefundModal}>
          <div className="dialog-surface w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-5 sm:px-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EC008C]/10 text-[#EC008C]">
                    <Upload size={21} />
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-slate-950">Upload refund proof</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">Add the payment receipt that confirms the refund was sent to the customer.</p>
                </div>
                <button type="button" onClick={closeRefundModal} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Close upload dialog">
                  <X size={19} />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-6 py-6 sm:px-7">
              <input
                id="refund-proof-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => handleRefundFile(e.target.files?.[0])}
              />
              <label
                htmlFor="refund-proof-file"
                onDragOver={(e) => { e.preventDefault(); setRefundDragActive(true); }}
                onDragLeave={() => setRefundDragActive(false)}
                onDrop={(e) => { e.preventDefault(); setRefundDragActive(false); handleRefundFile(e.dataTransfer.files?.[0]); }}
                className={`group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${refundDragActive ? "border-[#EC008C] bg-[#EC008C]/5" : "border-slate-300 bg-slate-50 hover:border-[#EC008C] hover:bg-[#EC008C]/5"}`}
              >
                {refundPreview ? (
                  <div className="w-full space-y-3">
                    <img src={refundPreview} alt="Refund proof preview" className="mx-auto max-h-48 rounded-xl border border-slate-200 object-contain shadow-sm" />
                    <p className="max-w-full break-words whitespace-normal text-center text-xs font-bold text-slate-800">{refundFile?.name}</p>
                    <p className="text-[11px] font-medium text-slate-500">Click to replace this proof image</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#EC008C] shadow-sm ring-1 ring-slate-200">
                      <Upload size={22} />
                    </div>
                    <p className="text-sm font-black text-slate-900">Choose a proof image</p>
                    <p className="mt-1 text-xs text-slate-500">Drag and drop or click to browse</p>
                  </>
                )}
              </label>
              <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-500">
                <span>PNG, JPG, or WebP</span>
                <span>Optimized up to 5 MB</span>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:px-7">
              <button type="button" onClick={closeRefundModal} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={handleUploadRefund} disabled={uploadingRefund || !refundFile} className="flex-1 rounded-xl bg-[#1A1A1A] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-40">
                {uploadingRefund ? "Uploading..." : "Submit proof"}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentConfirmModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="payment-confirm-title" onClick={() => !paymentUpdatingId && setPaymentConfirmModal(null)}>
          <div className="dialog-surface w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <CreditCard size={21} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 id="payment-confirm-title" className="text-lg font-black tracking-tight text-slate-950">Confirm payment received</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">Only confirm money that your shop has actually received for order #{paymentConfirmModal.orderNumber}.</p>
                  </div>
                  <button type="button" onClick={() => setPaymentConfirmModal(null)} disabled={Boolean(paymentUpdatingId)} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40" aria-label="Close payment confirmation"><X size={17} /></button>
                </div>

                <div className="mt-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Payment method</span><strong className="text-slate-900">{paymentConfirmModal.paymentMethod}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Remaining balance</span><strong className="text-[#EC008C]">{formatPesoAmount(paymentConfirmModal.remainingBalance)}</strong></div>
                  {paymentConfirmModal.proofPresent && <p className="border-t border-slate-200 pt-2 text-[10px] font-semibold text-amber-700">Payment proof is available. Review it before confirming.</p>}
                </div>

                <label htmlFor="payment-confirm-amount" className="mt-5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Amount received</label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500">₱</span>
                  <input id="payment-confirm-amount" type="number" min="0.01" max={paymentConfirmModal.remainingBalance} step="0.01" value={paymentAmountInput} onChange={(event) => setPaymentAmountInput(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-8 pr-3 text-sm font-black text-slate-900 outline-none focus:border-[#00AFC0] focus:ring-2 focus:ring-[#00AFC0]/20" />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">The server will reject amounts above the current balance. A partial confirmation keeps the order blocked until the rest is paid.</p>

                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={() => setPaymentConfirmModal(null)} disabled={Boolean(paymentUpdatingId)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                  <button type="button" onClick={handleConfirmPayment} disabled={Boolean(paymentUpdatingId) || !paymentAmountInput} className="flex-1 rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C] disabled:cursor-wait disabled:opacity-60">{paymentUpdatingId ? "Confirming..." : "Confirm payment"}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusConfirmModal && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-confirm-title"
          onClick={() => !statusUpdatingId && setStatusConfirmModal(null)}
        >
          <div className="dialog-surface w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#00FFFF]/20 text-[#007C82]">
                <Activity size={21} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 id="status-confirm-title" className="text-lg font-black tracking-tight text-slate-950">Update order status?</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Confirm moving order #{statusConfirmModal.orderNumber} to the next step. This action updates the customer-facing order status.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStatusConfirmModal(null)}
                    className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Close status confirmation"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Current</p>
                    <p className="mt-1 text-xs font-black text-slate-800">{STATUS_META[statusConfirmModal.currentStatus]?.label || statusConfirmModal.currentStatus}</p>
                  </div>
                  <span className="text-slate-400" aria-hidden="true">→</span>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#009FA0]">Next</p>
                    <p className="mt-1 text-xs font-black text-[#007C82]">{STATUS_META[statusConfirmModal.nextStatus]?.label || statusConfirmModal.nextStatus}</p>
                  </div>
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStatusConfirmModal(null)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmStatusUpdate}
                    disabled={Boolean(statusUpdatingId)}
                    className="flex-1 rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C] disabled:cursor-wait disabled:opacity-60"
                  >
                    {statusUpdatingId ? "Updating..." : "Yes, update status"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" onClick={() => setCancelModal(null)}>
          <div className="dialog-surface max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-slate-900">Cancel Order</h3>
            <p className="text-xs text-slate-500">Provide a reason for cancelling this order:</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Out of paper stock, equipment maintenance..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-400 h-24"
            />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setCancelModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl">Back</button>
              <button onClick={handleCancelOrder} disabled={cancelling} className="flex-1 py-2.5 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700">
                {cancelling ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewMapOrder && getDeliveryCoordinates(viewMapOrder) && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="delivery-map-title" onClick={() => setViewMapOrder(null)}>
          <div className="dialog-surface w-full max-w-3xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009FA0]">Delivery location</p>
                <h2 id="delivery-map-title" className="mt-1 text-lg font-black text-slate-950">Order #{getOrderNumber(viewMapOrder)}</h2>
                <p className="mt-1 max-w-xl break-words text-xs text-slate-500">{viewMapOrder.delivery_address || "Pinned delivery location"}</p>
              </div>
              <button type="button" onClick={() => setViewMapOrder(null)} aria-label="Close delivery map" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00AFC0]"><X size={18} /></button>
            </div>
            <div className="h-[min(65vh,420px)] p-4 sm:p-5">
              <LocationPicker {...getDeliveryCoordinates(viewMapOrder)} readOnly />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-[#F6F6F2] px-5 py-3 text-[11px] text-slate-500 sm:px-6">
              <span>Map pin from the customer’s saved delivery location.</span>
              <a href={`https://www.openstreetmap.org/?mlat=${getDeliveryCoordinates(viewMapOrder).lat}&mlon=${getDeliveryCoordinates(viewMapOrder).lng}#map=16/${getDeliveryCoordinates(viewMapOrder).lat}/${getDeliveryCoordinates(viewMapOrder).lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-black text-[#007C82] hover:underline"><ExternalLink size={13} /> Open map</a>
            </div>
          </div>
        </div>
      )}

      <main data-tour="owner-orders" className="owner-orders-page min-h-screen overflow-x-hidden bg-[#F6F6F2] font-sans text-slate-900 pb-20">

        {/* Header */}
        <section className="relative overflow-hidden bg-[#1A1A1A] px-4 pb-7 pt-8 text-white sm:px-8 sm:pb-8 sm:pt-9 lg:px-10">
          <div className="cmyk-bar absolute left-0 right-0 top-0" />
          <div className="relative mx-auto flex max-w-[1600px] flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#00FFFF]">Order workspace</p>
              <h1 className="mt-2 text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-5xl">Orders</h1>
              <p className="mt-3 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">Review new work, move jobs through production, and keep every order action in one place.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 sm:min-w-28">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/55">Total orders</p>
                <p className="mt-0.5 text-xl font-black leading-none text-white">{orders.length}</p>
              </div>
              <button
                type="button"
                onClick={refreshOrders}
                disabled={refreshing}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-black text-white transition-colors hover:border-[#00FFFF] hover:bg-[#00FFFF]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF] disabled:cursor-wait disabled:opacity-60"
                aria-label="Refresh orders"
              >
                <RefreshCcw size={15} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </section>

        {/* Orders Table & Cards */}
        <section className="mx-auto max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8">
          {ordersLoadError && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
              <span className="flex items-center gap-2"><AlertCircle size={15} /> {ordersLoadError}</span>
              <button type="button" onClick={refreshOrders} disabled={refreshing} className="rounded-lg bg-white px-3 py-1.5 font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50">{refreshing ? "Retrying..." : "Retry"}</button>
            </div>
          )}
          {statusActionMessage && (
            <div
              role={statusActionMessage.type === "error" ? "alert" : "status"}
              aria-live="polite"
              className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold ${statusActionMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : statusActionMessage.type === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-800"}`}
            >
              <span className="flex items-center gap-2">
                {statusActionMessage.type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                {statusActionMessage.text}
              </span>
              {statusActionMessage.type === "error" && statusActionMessage.orderId && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(statusActionMessage.orderId, statusActionMessage.nextStatus)}
                  disabled={Boolean(statusUpdatingId)}
                  className="rounded-lg bg-white px-3 py-1.5 font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                >
                  Retry update
                </button>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ["New orders", newOrderCount, "Needs review", "border-amber-200 bg-amber-50"],
              ["In production", inProductionCount, "Being printed", "border-cyan-200 bg-cyan-50"],
              ["Ready", readyCount, "Pickup or delivery", "border-yellow-300 bg-yellow-50"],
              ["Completed", completedCount, "Finished orders", "border-emerald-200 bg-emerald-50"],
              ["Refunds / cancelled", refundCount, "Review if needed", "border-rose-200 bg-rose-50"],
            ].map(([label, count, hint, tone]) => (
              <div key={label} className={`rounded-2xl border px-3.5 py-3 ${tone}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className="text-2xl font-black leading-none text-slate-900">{count}</p>
                  <p className="text-right text-[10px] font-semibold text-slate-500">{hint}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-[#D8D6CE] bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-[#009FA0]" />
                <div>
                  <p className="text-xs font-black text-slate-900">Find an order</p>
                  <p className="text-[10px] text-slate-500">Search by order number, customer, or item.</p>
                </div>
              </div>
              <div className="relative w-full lg:max-w-sm">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search orders"
                  aria-label="Search orders"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-xs font-medium outline-none transition-colors focus:border-[#00AFC0] focus:bg-white"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear order search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X size={14} /></button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {[
                ["ALL", `All orders · ${orders.length}`],
                ["PENDING", `Needs action · ${needsActionCount}`],
                ["PREPARING", `In production · ${inProductionCount}`],
                ["READY", `Ready · ${readyCount}`],
                ["COMPLETED", `Completed · ${completedCount}`],
                ["CANCELLED", `Refunds / cancelled · ${refundCount}`],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  aria-pressed={activeTab === tab}
                  className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${activeTab === tab ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:border-[#00AFC0] hover:bg-[#EFFFFF]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <p className="text-[11px] text-slate-500">
                {hasActiveFilters ? `Showing ${filteredOrders.length} matching order${filteredOrders.length === 1 ? "" : "s"}.` : "Showing the latest orders for your shop."}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-[#A30061] transition-colors hover:bg-[#EC008C]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C]"
                >
                  <X size={13} /> Reset search and filters
                </button>
              )}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-[#C8C6BD] bg-white p-10 text-center text-xs font-medium text-slate-500">
              <ShoppingBag size={25} className="mx-auto text-[#009FA0]" aria-hidden="true" />
              <p className="mt-3 text-sm font-black text-slate-800">{emptyStateTitle}</p>
              <p className="mt-1">{emptyStateDescription}</p>
              {hasActiveFilters && (
                <button type="button" onClick={resetFilters} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#EC008C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C]">
                  Reset search and filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {visibleOrders.map((o) => {
                const payment = getOrderPaymentSummary(o);
                const paymentProofReference = o.remaining_payment_proof_url || o.receipt_url || o.payment_proof_url;
                const initialPaymentOutstanding = payment.downpayment > payment.confirmedAmount + 0.009;
                const deliveryCoordinates = getDeliveryCoordinates(o);
                const nextStatus = getNextStatus(o);
                const completionBlocked = ["COMPLETED", "DELIVERY_COMPLETED"].includes(nextStatus) && !payment.isPaymentConfirmed;
                const paymentActionsAvailable = !["CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_CONFIRMED", ...COMPLETED_STATUSES].includes(o.status);
                const isExpanded = expandedOrderId === o.id;
                const customerName = o.customer_profile?.full_name || o.customer_name || "Customer";
                const customerEmail = o.customer_profile?.email || o.customer_email || "Email not provided";
                const customerPhone = o.customer_phone || o.customer_profile?.phone || "Phone not provided";
                const deliveryLabel = o.delivery_type === "DELIVERY" ? "Delivery" : "Store pickup";
                const taxAmount = Number(o.tax_amount);
                const discountAmount = Number(o.discount_amount);
                return (
                  <article key={o.id} className={`overflow-hidden rounded-2xl border border-[#D8D6CE] bg-white transition-[filter,box-shadow] duration-300 hover:shadow-sm ${COMPLETED_STATUSES.includes(o.status) ? "grayscale" : ""}`}>
                    <div className={`h-1 ${COMPLETED_STATUSES.includes(o.status) ? "bg-slate-300" : "bg-[#00AFC0]"}`} />
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="break-all text-sm font-black text-slate-950">Order #{getOrderNumber(o)}</h2>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${STATUS_META[o.status]?.className || "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                              {STATUS_META[o.status]?.label || String(o.status || "Unknown").replaceAll("_", " ")}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">Placed on {formatManilaDateTime(o.created_at)}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                            <span className="inline-flex min-w-0 items-center gap-1.5 font-black text-slate-800">
                              <UserRound size={14} className="shrink-0 text-[#00AFC0]" />
                              <span className="break-words">{customerName}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-slate-600">
                              <Phone size={14} className="shrink-0 text-[#EC008C]" />
                              <span className="break-all">{customerPhone}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          {nextStatus && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFFFFF] px-2.5 py-1.5 text-[10px] font-black text-[#007C82] ring-1 ring-[#00AFC0]/30">
                              <Clock size={13} /> Next: {getNextActionLabel(nextStatus, o.delivery_type)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}
                            aria-expanded={isExpanded}
                            aria-controls={`order-details-${o.id}`}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-800 transition-colors hover:border-[#00AFC0] hover:bg-[#EFFFFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00AFC0]"
                          >
                            {isExpanded ? "Hide details" : "View details"}
                            <ChevronDown size={15} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7" aria-label={`Order ${getOrderNumber(o)} summary`}>
                        <div className="rounded-xl bg-[#F6F6F2] px-3 py-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Fulfillment</p>
                          <p className="mt-1 inline-flex items-center gap-1 text-xs font-black text-slate-900"><Truck size={13} className="text-[#009FA0]" /> {deliveryLabel}</p>
                        </div>
                        <div className="rounded-xl bg-[#F6F6F2] px-3 py-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Total</p>
                          <p className="mt-1 text-sm font-black text-slate-950">{formatPesoAmount(payment.total)}</p>
                        </div>
                        <div className="rounded-xl bg-[#F6F6F2] px-3 py-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Downpayment</p>
                          <p className="mt-1 text-sm font-black text-emerald-700">{formatPesoAmount(payment.downpayment)}</p>
                        </div>
                        <div className="rounded-xl bg-[#F6F6F2] px-3 py-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Balance</p>
                            <p className={`mt-1 text-sm font-black ${payment.isPaidInFull ? "text-emerald-700" : "text-[#EC008C]"}`}>
                              {payment.isPaidInFull ? "Paid in full" : formatPesoAmount(payment.balance)}
                            </p>
                        </div>
                        <div className="rounded-xl bg-[#F6F6F2] px-3 py-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Payment status</p>
                          <p className={`mt-1 truncate text-xs font-black ${payment.isPaymentConfirmed ? "text-emerald-700" : payment.paymentProofPresent ? "text-amber-700" : "text-[#EC008C]"}`}>
                            {payment.statusLabel}
                          </p>
                        </div>
                        <div className="rounded-xl bg-[#F6F6F2] px-3 py-2.5 sm:col-span-2 lg:col-span-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Primary action</p>
                          <p className={`mt-1 truncate text-xs font-black ${completionBlocked ? "text-[#EC008C]" : "text-slate-900"}`}>{completionBlocked ? "Confirm payment first" : nextStatus ? getNextActionLabel(nextStatus, o.delivery_type) : "No further status action"}</p>
                        </div>
                      </div>

                      <div className={`mt-3 flex flex-col gap-3 rounded-xl border-l-4 px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${payment.isPaymentConfirmed ? "border-emerald-500 bg-emerald-50" : payment.remainingPaymentRejected ? "border-rose-400 bg-rose-50" : payment.remainingPaymentPending || payment.paymentProofPresent ? "border-amber-400 bg-amber-50" : "border-[#EC008C] bg-rose-50"}`} aria-label="Payment status and actions">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CreditCard size={15} className={payment.isPaymentConfirmed ? "text-emerald-700" : payment.remainingPaymentRejected ? "text-rose-700" : "text-[#EC008C]"} aria-hidden="true" />
                            <p className="text-xs font-black text-slate-900">{payment.statusLabel}{payment.isPaymentConfirmed ? " · Paid in full" : ""}</p>
                            {payment.remainingPaymentPending && <span className="text-[10px] font-semibold text-amber-800">Customer submission needs review</span>}
                            {!payment.remainingPaymentPending && payment.paymentProofPresent && !payment.isPaymentConfirmed && <span className="text-[10px] font-semibold text-slate-600">Proof available for review</span>}
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                            {payment.isPaymentConfirmed
                              ? "Payment has been confirmed. You can move the order to its final status."
                                : initialPaymentOutstanding
                                  ? "Review and confirm the initial downpayment before requesting or approving the remaining balance."
                                : payment.remainingPaymentPending
                                ? "Review the customer’s proof or payment declaration. Approve only after the money is actually received."
                                : payment.remainingPaymentRejected
                                  ? `The customer can resubmit this payment${o.remaining_payment_rejection_reason ? `: ${o.remaining_payment_rejection_reason}` : "."}`
                                : payment.paymentProofPresent
                                  ? "Review the proof and confirm only the amount you actually received."
                                : "The order cannot be completed until payment is received and confirmed."}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {payment.paymentProofPresent && <button type="button" onClick={() => openPaymentProof(o)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"><Eye size={14} /> Review proof</button>}
                          {paymentActionsAvailable && initialPaymentOutstanding && !payment.isPaymentConfirmed && payment.canConfirm && <button type="button" onClick={() => requestPaymentConfirmation(o, payment)} disabled={paymentUpdatingId === o.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#1A1A1A] px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-[#EC008C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C] disabled:cursor-wait disabled:opacity-50"><CheckCircle size={14} /> Confirm initial payment</button>}
                          {paymentActionsAvailable && !initialPaymentOutstanding && payment.remainingPaymentPending && <>
                            <button type="button" onClick={() => requestRemainingPaymentReview(o, payment, "REJECT")} disabled={paymentUpdatingId === o.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-[11px] font-black text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-wait disabled:opacity-50">Reject</button>
                            <button type="button" onClick={() => requestRemainingPaymentReview(o, payment, "APPROVE")} disabled={paymentUpdatingId === o.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-wait disabled:opacity-50">Approve payment</button>
                          </>}
                          {paymentActionsAvailable && !initialPaymentOutstanding && !payment.isPaymentConfirmed && payment.balance > 0 && <button type="button" onClick={() => handleRequestRemainingPayment(o, payment)} disabled={paymentUpdatingId === o.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#EC008C]/40 bg-white px-3 py-2 text-[11px] font-black text-[#A30061] transition-colors hover:bg-[#EC008C]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C] disabled:cursor-wait disabled:opacity-50"><MessageSquare size={14} /> {paymentUpdatingId === o.id ? "Sending..." : "Request remaining payment"}</button>}
                          {paymentActionsAvailable && !initialPaymentOutstanding && !payment.isPaymentConfirmed && payment.balance > 0 && !payment.remainingPaymentPending && <button type="button" onClick={() => requestRemainingPaymentReview(o, payment, "MANUAL")} disabled={paymentUpdatingId === o.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#1A1A1A] px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-[#EC008C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C] disabled:cursor-wait disabled:opacity-50"><CheckCircle size={14} /> Confirm full payment</button>}
                        </div>
                      </div>

                      <div className="mt-4">
                        <StatusProgress
                          status={o.status}
                          deliveryType={o.delivery_type}
                          payment={payment}
                          onRequestUpdateStatus={(nextStatus) => requestStatusUpdate(o.id, o, nextStatus)}
                          isUpdating={statusUpdatingId === o.id}
                          onCancel={["PENDING", "PLACED", "PREPARING"].includes(o.status) ? () => setCancelModal({ orderId: o.id }) : undefined}
                        />
                      </div>

                      {isExpanded && (
                        <div id={`order-details-${o.id}`} className="mt-5 space-y-4 border-t border-slate-200 pt-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009FA0]">Order details</p>
                              <p className="mt-1 text-xs text-slate-500">Items, fulfillment, payment, and customer information for this order.</p>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">Order ID: {o.id}</span>
                          </div>

                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                            <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2" aria-labelledby={`items-${o.id}`}>
                              <div className="flex items-center justify-between gap-3">
                                <h3 id={`items-${o.id}`} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700"><Package size={15} className="text-[#009FA0]" /> Items ordered</h3>
                                <span className="text-[11px] font-bold text-slate-500">{(o.items || []).length} item{(o.items || []).length === 1 ? "" : "s"}</span>
                              </div>
                              <div className="mt-3 space-y-2">
                                {(o.items || []).length > 0 ? (o.items || []).map((it, idx) => (
                                  <div key={idx} className="rounded-xl border border-slate-100 bg-[#F6F6F2] p-3 text-xs">
                                    <div className="flex items-start justify-between gap-3">
                                      <span className="min-w-0 break-words"><strong className="text-slate-900">{it.name || "Print item"}</strong> × {it.quantity || 1}</span>
                                      <span className="shrink-0 font-black text-slate-900">{formatPesoAmount(Number(it.price) * (it.quantity || 1))}</span>
                                    </div>
                                    {it.selected_specs && (
                                      <div className="mt-2 space-y-0.5 rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-medium text-slate-600">
                                        {it.selected_specs.size && <div>Size: <span className="font-semibold text-slate-900">{it.selected_specs.size}</span></div>}
                                        {it.selected_specs.material && <div>Material: <span className="font-semibold text-slate-900">{it.selected_specs.material}</span></div>}
                                        {it.selected_specs.quality && <div>Quality: <span className="font-semibold text-slate-900">{it.selected_specs.quality}</span></div>}
                                        {it.selected_specs.notes && <div className="break-words text-amber-800 italic">Notes: {it.selected_specs.notes}</div>}
                                      </div>
                                    )}
                                  </div>
                                )) : <p className="rounded-xl bg-[#F6F6F2] p-3 text-xs text-slate-500">No item details were saved with this order.</p>}
                              </div>
                            </section>

                            <section className="rounded-xl border border-slate-200 bg-[#F6F6F2] p-4" aria-label="Payment summary">
                              <h3 className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700"><CreditCard size={15} className="text-[#EC008C]" /> Payment summary · Total &amp; Balance</h3>
                              <div className="mt-3 space-y-2 text-xs">
                                <div className="flex justify-between gap-3 text-slate-600"><span>Total</span><strong className="text-slate-950">{formatPesoAmount(payment.total)}</strong></div>
                                <div className="flex justify-between gap-3 text-slate-600"><span>Downpayment</span><strong className="text-slate-900">{formatPesoAmount(payment.downpayment)}</strong></div>
                                <div className="flex justify-between gap-3 text-slate-600"><span>Confirmed paid</span><strong className="text-emerald-700">{formatPesoAmount(payment.confirmedAmount)}</strong></div>
                                {Number.isFinite(taxAmount) && taxAmount > 0 && <div className="flex justify-between gap-3 text-slate-600"><span>Tax / VAT</span><strong className="text-slate-900">{formatPesoAmount(taxAmount)}</strong></div>}
                                {Number.isFinite(discountAmount) && discountAmount > 0 && <div className="flex justify-between gap-3 text-slate-600"><span>Discount</span><strong className="text-slate-900">-{formatPesoAmount(discountAmount)}</strong></div>}
                                {o.delivery_type === "DELIVERY" && <div className="flex justify-between gap-3 text-slate-600"><span>Delivery fee</span><strong className="text-[#007C82]">{formatPesoAmount(o.delivery_fee)}</strong></div>}
                                <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-slate-600"><span>Balance</span><strong className={payment.isPaidInFull ? "text-emerald-700" : "text-[#EC008C]"}>{payment.isPaidInFull ? "Paid in full" : formatPesoAmount(payment.balance)}</strong></div>
                              </div>
                              <p className={`mt-3 text-[10px] font-black ${payment.isPaymentConfirmed ? "text-emerald-700" : payment.paymentProofPresent ? "text-amber-700" : "text-[#EC008C]"}`}>{payment.statusLabel}</p>
                              {!payment.isAvailable && <p className="mt-3 text-[10px] font-semibold text-amber-700">Payment details are unavailable for this order.</p>}
                            </section>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby={`customer-${o.id}`}>
                              <h3 id={`customer-${o.id}`} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700"><UserRound size={15} className="text-[#00AFC0]" /> Customer</h3>
                              <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                                <p className="break-words font-black text-slate-900">{customerName}</p>
                                <p className="break-all">{customerEmail}</p>
                                <p className="break-all">{customerPhone}</p>
                              </div>
                            </section>

                            <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby={`fulfillment-${o.id}`}>
                              <h3 id={`fulfillment-${o.id}`} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700"><MapPin size={15} className="text-[#EC008C]" /> Fulfillment</h3>
                              <div className="mt-3 space-y-2 text-xs text-slate-600">
                                <p><span className="font-bold text-slate-900">Type:</span> {deliveryLabel}</p>
                                {o.fulfillment_mode === "ADVANCE" && o.expected_fulfillment_at && <p><span className="font-bold text-slate-900">Scheduled:</span> {formatManilaDateTime(o.expected_fulfillment_at)}</p>}
                                {o.delivery_type === "DELIVERY" ? <p className="break-words"><span className="font-bold text-slate-900">Address:</span> {o.delivery_address || "Address not provided"}</p> : <p className="break-words"><span className="font-bold text-slate-900">Pickup at:</span> {ownerBusiness?.address || ownerBusiness?.name || "Your shop"}</p>}
                                {deliveryCoordinates && (
                                  <button type="button" onClick={() => setViewMapOrder(o)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#00AFC0]/40 bg-[#EFFFFF] px-2.5 py-1.5 text-[11px] font-black text-[#007C82] transition-colors hover:bg-[#00FFFF]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00AFC0]">
                                    <MapPin size={13} /> View delivery map <ExternalLink size={12} />
                                  </button>
                                )}
                              </div>
                            </section>
                          </div>

                          <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Order actions and notes">
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => { setViewDocType("RECEIPT"); setViewReceipt(o); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"><FileText size={14} /> Receipt</button>
                              <button type="button" onClick={() => { setViewDocType("QUOTATION"); setViewReceipt(o); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><FileText size={14} /> Quotation</button>
                              {paymentProofReference && <button type="button" onClick={() => openPaymentProof(o)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"><Eye size={14} /> Payment proof</button>}
                            </div>
                            <div className="mt-3 border-t border-slate-100 pt-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Notes</p>
                              <p className="mt-1 break-words text-xs leading-relaxed text-slate-600">{o.notes || o.order_notes || o.customer_notes || "No order notes."}</p>
                            </div>
                          </section>

                          {(o.status === "CANCELLED" || o.status === "REFUND_PENDING") && (
                            <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-black text-orange-900">{o.status === "REFUND_PENDING" ? "Refund requested by customer" : "Cancellation may require a refund"}</p>
                                <p className="mt-1 break-words text-[11px] leading-relaxed text-orange-800">{o.refund_reason || "Review the payment and upload proof after sending the refund."}</p>
                              </div>
                              <button type="button" onClick={() => setRefundModal({ orderId: o.id })} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#EC008C] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#c90076] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EC008C]"><RefreshCcw size={14} /> Process refund</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {filteredOrders.length > 0 && (
            <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-3xl border border-[#D8D6CE] bg-white px-5 py-4 text-xs sm:flex-row">
              <p className="text-slate-500">
                Showing <span className="font-bold text-slate-900">{pageStart + 1}–{Math.min(pageStart + ORDER_PAGE_SIZE, filteredOrders.length)}</span> of <span className="font-bold text-slate-900">{filteredOrders.length}</span> orders
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full border border-[#D8D6CE] px-3 py-2 font-bold text-slate-700 transition-colors hover:bg-[#ECECE8] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="min-w-20 text-center font-bold text-slate-900">Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full bg-[#1A1A1A] px-3 py-2 font-bold text-white transition-colors hover:bg-[#EC008C] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

      </main>
    </>
  );
}
