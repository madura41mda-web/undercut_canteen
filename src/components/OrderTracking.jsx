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
import { sanitizeErrorMessage, isCancelledAutoHidden } from "../services/canteenState";

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
  const [autoHideTicker, setAutoHideTicker] = useState(0);

  // 1. Persistent dismissed order IDs per USN in localStorage (with try/catch)
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

  // Periodic 30-second re-evaluation ticker for auto-hiding cancelled orders older than 5 minutes
  useEffect(() => {
    const timer = setInterval(() => {
      setAutoHideTicker((v) => v + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

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

  // Student tracking shows ONLY that USN's orders (excluding dismissed & auto-hidden after 5 mins)
  const studentOrders = useMemo(() => {
    const raw = studentUSN
      ? orders.filter(
          (o) => (o.studentRoll || "").trim().toUpperCase() === studentUSN.trim().toUpperCase()
        )
      : orders;
    void autoHideTicker;
    return raw.filter((o) => {
      if (dismissedIds.includes(o.id) || dismissedIds.includes(o._uuid)) return false;
      // Auto-hide Cancelled / Rejected / Expired orders 5 minutes after cancelledAt
      if (isCancelledAutoHidden(o)) return false;
      return true;
    });
  }, [orders, studentUSN, dismissedIds, autoHideTicker]);

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
    try {
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
            : sanitizeErrorMessage(res?.message || res?.reason)
        );
      }
    } catch (err) {
      setIsCancelling(false);
      setCancelError(sanitizeErrorMessage(err));
    }
  };

  if (!currentOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Clock className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white">No active orders right now</h3>
        <p className="text-sm text-slate-400 mt-2 mb-6">
          {studentUSN
            ? `No active orders found for USN ${studentUSN}. Order your favourite food ahead to skip queues.`
            : "You haven't placed any canteen orders yet. Order your favourite food ahead to skip queues."}
        </p>
        <button
          onClick={onNewOrderClick}
          className="px-6 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 shadow-lg shadow-amber-500/25 cursor-pointer"
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
              Please walk up to the counter and pay in cash to confirm your order. Your dish ingredients are reserved for you.
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-all active:scale-95 cursor-pointer"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-medium border border-emerald-500/40 cursor-pointer"
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

        {/* Header with Token & Live Minutes Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400">PICKUP TOKEN</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 font-mono">
                {currentOrder.counter}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-3xl sm:text-4xl font-extrabold text-amber-400 tracking-wider">
                {currentOrder.id}
              </span>
              <button
                onClick={copyToken}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Copy token"
              >
                {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShowQRModal(true)}
                className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors flex items-center gap-1.5 text-xs font-mono"
                title="Show Pickup QR Code"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">Show QR</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isPendingApproval ? (
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Pending Counter Payment</span>
                <span className="font-mono text-xl font-bold text-amber-400">
                  {timeRemainingStr}
                </span>
              </div>
            ) : !isCancelled && !isReady && currentOrder.status !== "Collected" ? (
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Estimated Pickup In</span>
                <span className="font-mono text-2xl font-bold text-emerald-400">
                  ~{currentOrder.estimatedMinutesRemaining} mins
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Progress Timeline */}
        <div className="py-8">
          <div className="relative">
            <div className="hidden sm:block absolute top-5 left-8 right-8 h-1 bg-white/10 rounded-full">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-700"
                style={{
                  width: isCancelled
                    ? "0%"
                    : `${(Math.max(0, currentStepIndex) / (TIMELINE_STEPS.length - 1)) * 100}%`,
                }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 sm:gap-2">
              {TIMELINE_STEPS.map((step, idx) => {
                const isStepPassed = !isCancelled && idx <= currentStepIndex;
                const isStepCurrent = !isCancelled && idx === currentStepIndex;
                const StepIcon = step.icon;

                return (
                  <div key={step.key} className="flex sm:flex-col items-center sm:items-center gap-4 sm:gap-2 text-left sm:text-center relative">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all z-10 ${
                        isStepCurrent
                          ? "bg-amber-500 text-black ring-4 ring-amber-500/20 scale-110 shadow-lg shadow-amber-500/30"
                          : isStepPassed
                          ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                          : "bg-[#141724] border border-white/10 text-slate-500"
                      }`}
                    >
                      <StepIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className={`text-xs font-bold leading-tight ${isStepCurrent ? "text-amber-400" : isStepPassed ? "text-white" : "text-slate-500"}`}>
                        {step.label}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
                        {step.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Order Details & Summary */}
        <div className="pt-6 border-t border-white/[0.08] space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#141724] border border-white/[0.06] space-y-2">
              <div className="text-xs font-mono text-slate-400">STUDENT & PICKUP LOCATION</div>
              <div className="text-sm font-bold text-white">{currentOrder.studentName} ({currentOrder.studentRoll})</div>
              <div className="text-xs text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{currentOrder.counter || "Main Counter"} • Promised {currentOrder.promisedPickupTime}</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#141724] border border-white/[0.06] space-y-2">
              <div className="text-xs font-mono text-slate-400">PAYMENT & INSTRUCTIONS</div>
              <div className="text-sm font-bold text-white flex items-center justify-between">
                <span>{currentOrder.paymentMethod}</span>
                <span className="font-mono text-amber-400 font-extrabold">₹{currentOrder.totalAmount}</span>
              </div>
              <div className="text-xs text-slate-400">
                Note: {currentOrder.instructions || "None"}
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="p-4 rounded-2xl bg-[#141724] border border-white/[0.06]">
            <div className="text-xs font-mono text-slate-400 mb-2">ORDER ITEMS</div>
            <div className="space-y-1.5">
              {currentOrder.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-200">
                  <span>{item.quantity}x {item.name}</span>
                  <span className="font-mono text-slate-400">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Order Cancellation Zone */}
        {canCancel && (
          <div className="mt-6 pt-6 border-t border-white/[0.08] flex items-center justify-between flex-wrap gap-4">
            <div>
              <span className="text-xs text-slate-400 block">Need to cancel this order?</span>
              <span className="text-[11px] text-slate-500">
                {currentOrder.status === "Preparing"
                  ? "Cooking in progress — food cannot be returned to stock."
                  : "Stock will be safely returned to the kitchen immediately."}
              </span>
            </div>

            {cancelConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCancelConfirm(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isCancelling}
                  className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isCancelling ? "Cancelling…" : "Confirm Cancel"}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCancelConfirm(true)}
                className="px-3.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel Order
              </button>
            )}
          </div>
        )}

        {cancelError && (
          <div className="mt-3 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{cancelError}</span>
          </div>
        )}
      </div>

      {/* QR Code Modal for Counter Scanner */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-sm rounded-3xl bg-[#0e121d] border border-amber-500/40 p-6 text-center shadow-2xl"
          >
            <button
              onClick={() => setShowQRModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto mb-3">
              <QrCode className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Pickup Verification QR</h3>
            <p className="text-xs text-slate-400 mt-1">Show this QR code to the staff at {currentOrder.counter}</p>
            <div className="mt-5 p-4 bg-white rounded-2xl inline-block shadow-inner">
              <QRCodeSVG value={qrPayload} size={180} level="M" />
            </div>
            <div className="mt-4 font-mono text-xl font-bold text-amber-400">
              Token: {currentOrder.id}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
