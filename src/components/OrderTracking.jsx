import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  Clock,
  ChefHat,
  PackageCheck,
  MapPin,
  QrCode,
  Copy,
  Check,
  Volume2,
  XCircle,
  AlertTriangle,
  Trash2,
  X,
  Timer,
  Hourglass
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import confetti from "canvas-confetti";
import { sound } from "../utils/audio";

const TIMELINE_STEPS = [
  { key: "Placed",    label: "Order Placed",      desc: "Sent to kitchen queue",         icon: Clock        },
  { key: "Accepted",  label: "Accepted",           desc: "Chef confirmed ingredients",    icon: CheckCircle2 },
  { key: "Preparing", label: "In Kitchen",         desc: "Active cooking on burner/wok",  icon: ChefHat      },
  { key: "Ready",     label: "Ready for Pickup",   desc: "Waiting at serving counter",    icon: BellPlaceholder },
  { key: "Collected", label: "Order Collected",    desc: "Handed over to student",        icon: PackageCheck },
];

function BellPlaceholder(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

const STATUS_ORDER = ["Placed", "Accepted", "Preparing", "Ready", "Collected"];

function formatTimeRemaining(placedAt, expiryMinutes = 10) {
  if (!placedAt) return `${expiryMinutes}:00`;
  const placedTime = new Date(placedAt).getTime();
  const expiryTime = placedTime + expiryMinutes * 60 * 1000;
  const now = Date.now();
  const diff = Math.max(0, expiryTime - now);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function OrderTracking({
  orders = [],
  activeOrderId,
  studentUSN,
  onSelectOrder,
  onCancelOrder,
  onNewOrderClick,
}) {
  const [copiedToken, setCopiedToken] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [showQRModal, setShowQRModal] = useState(false);
  const [timeRemainingStr, setTimeRemainingStr] = useState("10:00");

  // 1. Persistent dismissed order IDs per USN in localStorage
  const storageKey = `smartcanteen_dismissed_orders_${(studentUSN || "guest").toUpperCase()}`;
  
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn("Could not read dismissed orders from localStorage:", e);
      return [];
    }
  });

  // Re-sync dismissed IDs when studentUSN changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      setDismissedIds(stored ? JSON.parse(stored) : []);
    } catch (e) {
      console.warn("Could not read dismissed orders from localStorage:", e);
    }
  }, [storageKey]);

  const handleDismissOrder = (orderId) => {
    sound.playClick();
    setDismissedIds((prev) => {
      const updated = Array.from(new Set([...prev, orderId]));
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (e) {
        console.warn("Could not write dismissed orders to localStorage:", e);
      }
      return updated;
    });
  };

  // Student tracking shows ONLY that USN's orders (excluding dismissed)
  const studentOrders = useMemo(() => {
    const raw = studentUSN
      ? orders.filter(
          (o) => (o.studentRoll || "").trim().toUpperCase() === studentUSN.trim().toUpperCase()
        )
      : orders;
    return raw.filter((o) => !dismissedIds.includes(o.id) && !dismissedIds.includes(o._uuid));
  }, [orders, studentUSN, dismissedIds]);

  const currentOrder = studentOrders.find((o) => o.id === activeOrderId) || studentOrders[0];

  const isPendingApproval = currentOrder?.status === "pending_approval";
  const isCancelled = currentOrder?.status === "Cancelled";
  const isReady     = currentOrder?.status === "Ready";

  const currentStepIndex = currentOrder
    ? STATUS_ORDER.indexOf(currentOrder.status)
    : 0;

  // Cancellation allowed for pending_approval, Placed, Accepted, and Preparing
  const canCancel = currentOrder &&
    ["pending_approval", "Placed", "Accepted", "Preparing"].includes(currentOrder.status);

  // Live 1-second countdown ticker for pending counter payment
  useEffect(() => {
    if (!isPendingApproval || !currentOrder?.placedAt) return;
    const interval = setInterval(() => {
      setTimeRemainingStr(formatTimeRemaining(currentOrder.placedAt, 10));
    }, 1000);
    setTimeRemainingStr(formatTimeRemaining(currentOrder.placedAt, 10));
    return () => clearInterval(interval);
  }, [isPendingApproval, currentOrder?.placedAt]);

  // Trigger audio bell and celebration confetti when status is Ready.
  useEffect(() => {
    if (isReady) {
      sound.playReadyBell();
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.5 } });
    }
  }, [isReady]);

  const copyToken = () => {
    if (!currentOrder) return;
    navigator.clipboard?.writeText(currentOrder.token || currentOrder.id);
    setCopiedToken(true);
    sound.playClick();
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleCancel = async () => {
    if (!currentOrder) return;
    setIsCancelling(true);
    setCancelError("");
    const res = await onCancelOrder(currentOrder.id, "Cancelled by student", studentUSN);
    setIsCancelling(false);
    if (res?.ok) {
      setCancelConfirm(false);
    } else {
      setCancelError(
        res?.reason === "forbidden_usn_mismatch"
          ? "Unauthorized: You can only cancel your own orders."
          : res?.reason === "illegal_transition"
          ? "This order can no longer be cancelled."
          : (res?.message || "Could not cancel. Please try again.")
      );
    }
  };

  if (!currentOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Clock className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white">No active orders right now</h3>
        <p className="text-sm text-slate-400 mt-2 mb-6">
          {studentUSN
            ? `No orders found for USN ${studentUSN}. Order your favourite food ahead to skip queues.`
            : "You haven't placed any canteen orders yet. Order your favourite food ahead to skip queues."}
        </p>
        <button
          onClick={onNewOrderClick}
          className="px-6 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 shadow-lg shadow-amber-500/25"
        >
          Explore Food Menu
        </button>
      </div>
    );
  }

  // Payload: "SC:<orderId>:<token>"
  const qrPayload = `SC:${currentOrder._uuid || currentOrder.id}:${currentOrder.token || currentOrder.id}`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

      {/* Top Banner */}
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[11px] font-mono text-amber-400 font-bold uppercase tracking-wider">
            LIVE CANTEEN TRACKING {studentUSN ? `• ${studentUSN}` : ""}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Order Status & Counter Pickup
          </h1>
        </div>

        {/* Multi-Order Switcher Pill */}
        {studentOrders.length > 1 && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#121624] border border-white/10 overflow-x-auto">
            {studentOrders.map((o) => {
              const isOrdCancelled = o.status === "Cancelled";
              const isSelected = o.id === currentOrder.id;

              return (
                <div
                  key={o.id}
                  onClick={() => {
                    sound.playClick();
                    onSelectOrder(o.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-amber-500 text-black shadow-sm"
                      : "text-slate-400 hover:text-white bg-white/[0.04]"
                  }`}
                >
                  <span>{o.id}</span>
                  {o.status === "pending_approval" && <span>⏳</span>}
                  {o.status === "Ready" && <span>⚡</span>}

                  {/* ✕ button ONLY on Cancelled/Rejected/Expired tabs */}
                  {isOrdCancelled && (
                    <button
                      type="button"
                      title="Dismiss cancelled order from view"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDismissOrder(o.id);
                      }}
                      className={`p-0.5 rounded hover:bg-black/30 transition-colors ${
                        isSelected ? "text-black hover:text-red-900" : "text-red-400 hover:text-red-300"
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          AWAITING COUNTER CONFIRMATION ALERT (Pay-at-Counter)
      ──────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isPendingApproval && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-amber-950/90 via-[#22180c] to-amber-900/40 border-2 border-amber-500 shadow-2xl shadow-amber-500/20 text-center relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 text-xs font-mono font-bold uppercase mb-3 animate-pulse">
              <Hourglass className="w-3.5 h-3.5" />
              AWAITING COUNTER CONFIRMATION
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Pay ₹{currentOrder.totalAmount} at {currentOrder.counter || "Counter"}
            </h2>
            <p className="text-sm text-amber-200/90 mt-2 max-w-lg mx-auto">
              Please walk up to the designated counter and pay in cash to confirm your order. Your dish ingredients are reserved for you.
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/50 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold">
                <Timer className="w-4 h-4 text-amber-400" />
                <span>Time to confirm payment: <strong>{timeRemainingStr}</strong></span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ────────────────────────────────────────────────────────────────────
          CANCELLED / EXPIRED / REJECTED ALERT
      ──────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isCancelled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-red-950/90 via-[#1a0d0d] to-red-900/40 border-2 border-red-500 shadow-2xl shadow-red-500/20 text-center relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-red-400/20 rounded-full blur-3xl pointer-events-none" />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-400/20 text-red-300 border border-red-400/40 text-xs font-mono font-bold uppercase mb-3">
              <XCircle className="w-3.5 h-3.5" />
              {currentOrder.cancelReason?.includes("Expired")
                ? "ORDER EXPIRED"
                : currentOrder.cancelReason?.includes("Reject") || currentOrder.cancelReason?.includes("declined")
                ? "PAYMENT DECLINED / REJECTED"
                : "ORDER CANCELLED"}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {currentOrder.cancelReason?.includes("Expired")
                ? "Counter Payment Timed Out"
                : currentOrder.cancelReason?.includes("Reject")
                ? "Order Rejected at Counter"
                : "This order has been cancelled"}
            </h2>
            {currentOrder.cancelledDuringPrep && (
              <p className="text-sm text-red-300/90 mt-2">
                ⚠ Cancelled during preparation — stock could not be restored.
              </p>
            )}
            {currentOrder.cancelReason && (
              <p className="text-xs text-slate-300 mt-2">
                Reason: {currentOrder.cancelReason}
              </p>
            )}

            {/* Dismiss Button */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => handleDismissOrder(currentOrder.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
                <span>Dismiss Cancelled Order</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ────────────────────────────────────────────────────────────────────
          READY FOR PICKUP ALERT
      ──────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isReady && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-emerald-950/90 via-[#0d2218] to-emerald-900/40 border-2 border-emerald-400 shadow-2xl shadow-emerald-500/20 text-center relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 text-xs font-mono font-bold uppercase mb-3 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              HOT FOOD IS READY NOW
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Order Ready at {currentOrder.counter}!
            </h2>
            <p className="text-sm sm:text-base text-emerald-200/90 mt-2 max-w-lg mx-auto">
              Please walk up to the designated counter and show your 4-digit pickup token below.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => sound.playReadyBell()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-medium border border-emerald-500/40"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Play Chime
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Order Card */}
      <div className="rounded-3xl bg-[#0e121d] border border-white/[0.08] shadow-2xl p-6 sm:p-8">

        {/* Token, Time, and Counter Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-white/[0.08] gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-slate-400">Order ID:</span>
              <span className="font-mono font-bold text-white text-base bg-white/[0.06] px-2.5 py-0.5 rounded-md border border-white/10">
                {currentOrder.id}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-md font-mono font-semibold border ${
                isCancelled
                  ? "bg-red-500/20 text-red-300 border-red-500/40"
                  : isPendingApproval
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
              }`}>
                {isCancelled
                  ? "Cancelled"
                  : isPendingApproval
                  ? "Pending Counter Approval"
                  : `${currentOrder.priority} Priority`}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Student: {currentOrder.studentName} ({currentOrder.studentRoll})
            </p>
          </div>

          {/* Token Box with Quick Copy */}
          <div className="flex items-center gap-3">
            <div className={`p-3 sm:p-4 rounded-2xl border text-right ${
              isCancelled
                ? "bg-[#141826] border-red-500/30"
                : isPendingApproval
                ? "bg-[#141826] border-amber-500/30"
                : "bg-[#141826] border-emerald-500/30"
            }`}>
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-semibold">
                PICKUP TOKEN
              </div>
              <div className={`font-mono text-2xl sm:text-3xl font-extrabold tracking-wider ${
                isCancelled ? "text-red-400 line-through" : isPendingApproval ? "text-amber-400" : "text-emerald-400"
              }`}>
                #{currentOrder.token || currentOrder.id.replace("CN-", "")}
              </div>
            </div>
            <button
              onClick={copyToken}
              className="p-3 rounded-2xl bg-white/[0.06] hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition-colors"
              title="Copy token"
            >
              {copiedToken ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="py-8">
          <div className="relative flex items-center justify-between">
            {/* Background Line */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/[0.06] z-0" />
            
            {/* Active Progress Line */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-amber-500 to-emerald-400 z-0 transition-all duration-500"
              style={{
                width: isPendingApproval ? "0%" : `${(Math.max(0, currentStepIndex) / (TIMELINE_STEPS.length - 1)) * 100}%`,
              }}
            />

            {TIMELINE_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isPast = !isPendingApproval && idx < currentStepIndex;
              const isCurrent = !isPendingApproval && idx === currentStepIndex;

              return (
                <div key={step.key} className="relative z-10 flex flex-col items-center group">
                  <div
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 ${
                      isPast
                        ? "bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20"
                        : isCurrent
                        ? "bg-amber-500 border-amber-300 text-black shadow-lg shadow-amber-500/30 scale-110"
                        : "bg-[#141724] border-white/10 text-slate-500"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="mt-2.5 text-center hidden sm:block">
                    <div className={`text-xs font-bold ${isCurrent ? "text-amber-400" : isPast ? "text-white" : "text-slate-500"}`}>
                      {step.label}
                    </div>
                    <div className="text-[10px] text-slate-400 max-w-[80px] leading-tight mt-0.5">
                      {step.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Counter Info & Digital Pass */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/[0.08]">
          <div className="p-4 rounded-2xl bg-[#111422] border border-white/[0.06] flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">COLLECTION COUNTER</div>
              <div className="text-sm font-bold text-white mt-0.5">{currentOrder.counter || "Counter 1"}</div>
              <div className="text-[11px] text-slate-400">
                {isPendingApproval
                  ? "Pay cash here to confirm order"
                  : `Estimated Pickup: ${currentOrder.promisedPickupTime || "Ready soon"}`}
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowQRModal(true)}
            className="p-4 rounded-2xl bg-[#111422] hover:bg-[#15192b] border border-white/[0.06] hover:border-amber-500/30 transition-all flex items-center justify-between text-left group"
          >
            <div>
              <div className="text-xs font-mono text-slate-400 mb-1">DIGITAL COUNTER PASS</div>
              <div className="text-xs font-semibold text-white group-hover:text-amber-400 transition-colors">Tap to display QR</div>
              <div className="text-[10px] text-slate-400">Scan at counter or kiosk</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/5 group-hover:bg-amber-500/10 border border-white/10 group-hover:border-amber-500/30 flex items-center justify-center text-slate-300 transition-colors">
              <QrCode className="w-7 h-7 text-amber-400" />
            </div>
          </button>
        </div>

        {/* Ordered Items Breakdown */}
        <div className="mt-6 p-4 rounded-2xl bg-[#111422] border border-white/[0.06]">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold mb-3">
            Items in this order ({currentOrder.items.length})
          </h4>
          <div className="space-y-2">
            {currentOrder.items.map((it, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-400">{it.quantity}x</span>
                  <span className="text-slate-200 font-medium">{it.name}</span>
                </div>
                <span className="font-mono text-slate-400">₹{it.price * it.quantity}</span>
              </div>
            ))}
          </div>

          {currentOrder.instructions && currentOrder.instructions !== "None" && (
            <div className="mt-3 pt-3 border-t border-white/[0.06] text-xs text-slate-400">
              <span className="text-amber-400/90 font-medium">Notes for Kitchen:</span> "{currentOrder.instructions}"
            </div>
          )}
        </div>

        {/* Cancel Order Section */}
        {canCancel && (
          <div className="mt-6">
            {!cancelConfirm ? (
              <button
                onClick={() => { sound.playClick(); setCancelConfirm(true); setCancelError(""); }}
                className="w-full py-2.5 rounded-xl bg-red-950/30 hover:bg-red-950/50 text-red-400 hover:text-red-300 text-xs font-mono font-semibold flex items-center justify-center gap-2 border border-red-500/30 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Cancel This Order
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/40 space-y-3">
                <div className="flex items-center gap-2 text-red-300 text-xs font-semibold">
                  <AlertTriangle className="w-4 h-4" />
                  {currentOrder.status === "Preparing"
                    ? "This order is already being prepared. Cancelling will NOT restore stock. Proceed?"
                    : currentOrder.status === "pending_approval"
                    ? "Cancel this unpaid counter order and release reserved items?"
                    : "Are you sure you want to cancel this order?"}
                </div>
                {cancelError && (
                  <div className="text-[11px] text-red-400">{cancelError}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={isCancelling}
                    className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all active:scale-95 disabled:opacity-60"
                  >
                    {isCancelling ? "Cancelling…" : "Yes, Cancel Order"}
                  </button>
                  <button
                    onClick={() => { setCancelConfirm(false); setCancelError(""); }}
                    className="flex-1 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-300 font-semibold text-xs"
                  >
                    Keep Order
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* QR Code Modal */}
      <AnimatePresence>
        {showQRModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm rounded-3xl bg-[#0f121d] border border-amber-500/30 p-6 text-center shadow-2xl overflow-hidden"
            >
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => setShowQRModal(false)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-400 font-bold uppercase tracking-wider mb-3">
                <QrCode className="w-3.5 h-3.5" />
                COUNTER PICKUP PASS
              </div>

              <h3 className="text-xl font-bold text-white mb-1">
                Order #{currentOrder.token || currentOrder.id}
              </h3>
              <p className="text-xs text-slate-400 mb-6 font-mono">
                {currentOrder.studentRoll} • {currentOrder.counter}
              </p>

              <div className="p-4 bg-white rounded-2xl mx-auto w-fit shadow-xl border-4 border-amber-400">
                <QRCodeSVG
                  value={qrPayload}
                  size={190}
                  level="H"
                  includeMargin={false}
                />
              </div>

              <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                Present this QR code to the cashier or dispenser scanner at {currentOrder.counter}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
