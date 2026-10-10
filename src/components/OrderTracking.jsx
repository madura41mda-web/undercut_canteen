import { useState, useEffect } from "react";
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
  Sparkles,
  Volume2,
  RefreshCw,
  Bell,
  XCircle,
  AlertTriangle,
  Trash2
} from "lucide-react";
import confetti from "canvas-confetti";
import { sound } from "../utils/audio";

const TIMELINE_STEPS = [
  { key: "Placed",    label: "Order Placed",      desc: "Sent to kitchen queue",         icon: Clock        },
  { key: "Accepted",  label: "Accepted",           desc: "Chef confirmed ingredients",    icon: CheckCircle2 },
  { key: "Preparing", label: "In Kitchen",         desc: "Active cooking on burner/wok",  icon: ChefHat      },
  { key: "Ready",     label: "Ready for Pickup",   desc: "Waiting at serving counter",    icon: Bell         },
  { key: "Collected", label: "Order Collected",    desc: "Handed over to student",        icon: PackageCheck },
];

const STATUS_ORDER = ["Placed", "Accepted", "Preparing", "Ready", "Collected"];

export default function OrderTracking({
  orders = [],
  activeOrderId,
  onSelectOrder,
  onUpdateStatus,
  onCancelOrder,
  onNewOrderClick,
  onDemoReset,
}) {
  const [copiedToken, setCopiedToken] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const currentOrder = orders.find((o) => o.id === activeOrderId) || orders[0];

  const isCancelled = currentOrder?.status === "Cancelled";
  const currentStepIndex = currentOrder
    ? STATUS_ORDER.indexOf(currentOrder.status)
    : 0;

  const isReady     = currentOrder?.status === "Ready";
  const isCollected = currentOrder?.status === "Collected";
  const canCancel   = currentOrder &&
    ["Placed", "Accepted", "Preparing"].includes(currentOrder.status);

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

  // Advance forward only — no backwards cycling.
  const advanceNextStatus = async () => {
    if (!currentOrder || isCancelled) return;
    const nextIdx = currentStepIndex + 1;
    if (nextIdx >= STATUS_ORDER.length) return; // Already at Collected — no-op.
    const nextStatus = STATUS_ORDER[nextIdx];
    sound.playClick();
    await onUpdateStatus(currentOrder.id, nextStatus);
  };

  const handleCancel = async () => {
    if (!currentOrder) return;
    setIsCancelling(true);
    setCancelError("");
    const res = await onCancelOrder(currentOrder.id, "Cancelled by student");
    setIsCancelling(false);
    if (res?.ok) {
      setCancelConfirm(false);
    } else {
      setCancelError(res?.reason === "illegal_transition"
        ? "This order can no longer be cancelled."
        : (res?.message || "Could not cancel. Please try again."));
    }
  };

  if (!currentOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Clock className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white">No active orders right now</h3>
        <p className="text-sm text-slate-400 mt-2 mb-6">
          You haven't placed any canteen orders yet. Order your favourite food ahead to skip queues.
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

      {/* Top Banner */}
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[11px] font-mono text-amber-400 font-bold uppercase tracking-wider">
            LIVE CANTEEN TRACKING
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Order Status & Counter Pickup
          </h1>
        </div>

        {/* Multi-Order Switcher Pill */}
        {orders.length > 1 && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#121624] border border-white/10 overflow-x-auto">
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  sound.playClick();
                  onSelectOrder(o.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                  o.id === currentOrder.id
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {o.id}
                {o.status === "Ready" && " ⚡"}
                {o.status === "Cancelled" && " ✕"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cancelled State Alert */}
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
              ORDER CANCELLED
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              This order has been cancelled
            </h2>
            {currentOrder.cancelledDuringPrep && (
              <p className="text-sm text-red-300/90 mt-2">
                ⚠ Cancelled during preparation — stock could not be restored.
              </p>
            )}
            {currentOrder.cancelReason && (
              <p className="text-xs text-slate-400 mt-1">Reason: {currentOrder.cancelReason}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ready for Pickup Alert */}
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
                  : "bg-amber-500/20 text-amber-300 border-amber-500/40"
              }`}>
                {isCancelled ? "Cancelled" : `${currentOrder.priority} Priority`}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Student: {currentOrder.studentName} ({currentOrder.studentRoll})
            </p>
          </div>

          {/* Token Box with Quick Copy */}
          <div className="flex items-center gap-3">
            <div className={`p-3 sm:p-4 rounded-2xl border text-right ${
              isCancelled ? "bg-[#141826] border-red-500/30" : "bg-[#141826] border-amber-500/30"
            }`}>
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-semibold">
                PICKUP TOKEN
              </div>
              <div className={`font-mono text-2xl sm:text-3xl font-extrabold tracking-wider ${
                isCancelled ? "text-red-400 line-through" : "text-amber-400"
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

        {/* Stepper Timeline */}
        {!isCancelled && (
          <div className="py-8">
            <div className="relative">
              <div className="hidden sm:block absolute top-1/2 left-0 right-0 h-1 bg-[#1a1f30] -translate-y-1/2 z-0" />
              <div
                className="hidden sm:block absolute top-1/2 left-0 h-1 bg-gradient-to-r from-amber-500 to-emerald-400 -translate-y-1/2 z-0 transition-all duration-700"
                style={{ width: `${(currentStepIndex / (TIMELINE_STEPS.length - 1)) * 100}%` }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 sm:gap-2 relative z-10">
                {TIMELINE_STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const isPassed = idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  return (
                    <div key={step.key} className="flex sm:flex-col items-center sm:items-center gap-3 text-left sm:text-center">
                      <motion.div
                        animate={isCurrent ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                        transition={{ duration: 1.5, repeat: isCurrent ? Infinity : 0 }}
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all shrink-0 ${
                          isCurrent
                            ? "bg-amber-500 text-black border-amber-300 shadow-lg shadow-amber-500/30"
                            : isPassed
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/60"
                            : "bg-[#111422] text-slate-400 border-white/10"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </motion.div>
                      <div>
                        <div className={`text-xs sm:text-sm font-bold leading-tight ${
                          isCurrent ? "text-amber-300" : isPassed ? "text-white" : "text-slate-400"
                        }`}>
                          {step.label}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {step.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Counter Directions & ETA Stats Grid */}
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${isCancelled ? "mt-6" : "pt-6"} border-t border-white/[0.08]`}>
          <div className="p-4 rounded-2xl bg-[#131625] border border-white/[0.06]">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-1">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span>COLLECTION COUNTER</span>
            </div>
            <div className="text-lg font-bold text-white">{currentOrder.counter}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Pickup window: {currentOrder.promisedPickupTime}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#131625] border border-white/[0.06]">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-1">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>TIME REMAINING</span>
            </div>
            <div className="text-lg font-bold font-mono text-cyan-300">
              {isCancelled
                ? "—"
                : isCollected
                ? "Completed"
                : isReady
                ? "Ready Now"
                : `~${currentOrder.estimatedMinutesRemaining} mins`}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Promised: {currentOrder.promisedPickupTime}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#131625] border border-white/[0.06] flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400 mb-1">DIGITAL COUNTER PASS</div>
              <div className="text-xs font-semibold text-white">Tap to display QR</div>
              <div className="text-[10px] text-slate-400">Scan at smart dispenser</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300">
              <QrCode className="w-7 h-7 text-amber-400" />
            </div>
          </div>
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

        {/* Hackathon Demo Controller */}
        <div className="mt-6 p-4 rounded-2xl bg-amber-500/[0.04] border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Hackathon Demo Controller:</strong> Simulate kitchen status progression in real time.
            </span>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={advanceNextStatus}
              disabled={isCancelled || isCollected}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/15 text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 border border-white/10 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {isCancelled
                  ? "Cancelled"
                  : isCollected
                  ? "Collected ✓"
                  : `→ ${STATUS_ORDER[currentStepIndex + 1] || "Done"}`}
              </span>
            </button>

            <button
              onClick={async () => { sound.playClick(); await onDemoReset?.(); }}
              className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/10 text-slate-400 hover:text-white text-xs font-mono flex items-center gap-1.5 border border-white/10 transition-all active:scale-95"
              title="Reset all demo orders and restore stock"
            >
              <RefreshCw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
