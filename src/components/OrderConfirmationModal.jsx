import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { 
  CheckCircle2, 
  Clock, 
  QrCode, 
  ArrowRight, 
  Maximize2, 
  X, 
  Check, 
  Copy 
} from "lucide-react";
import { sound } from "../utils/audio";

export default function OrderConfirmationModal({
  isOpen,
  order,
  onTrackOrder,
  onClose,
}) {
  const [zoomQR, setZoomQR] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  if (!isOpen || !order) return null;

  const qrPayload = `SC:${order._uuid || order.id}:${order.token || order.id}`;

  const handleCopy = () => {
    sound.playClick();
    navigator.clipboard?.writeText(order.token || order.id);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleProceedToTrack = () => {
    sound.playClick();
    onTrackOrder();
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-confirmed-title"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25 }}
            className="relative w-full max-w-lg bg-[#0e111a] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-left"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header: Success Celebration */}
            <div className="text-center pb-5 border-b border-white/[0.08]">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 id="order-confirmed-title" className="text-2xl font-black text-white tracking-tight">
                Order Placed Successfully!
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Kitchen received your order. Tracking starts at <strong className="text-amber-400 font-mono">Order Placed</strong>.
              </p>
            </div>

            {/* Token & Pickup Banner */}
            <div className="mt-5 p-4 rounded-2xl bg-[#131726] border border-amber-500/30 flex items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                  PICKUP TOKEN
                </span>
                <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-0.5 flex items-center gap-2">
                  <span>#{order.token || order.id}</span>
                  <button
                    onClick={handleCopy}
                    className="text-xs text-slate-400 hover:text-white p-1 rounded-md bg-white/5 transition-colors"
                    title="Copy token"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">
                  ID: {order._uuid ? `${order._uuid.substring(0, 8)}…` : order.id}
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-1 justify-end text-[10px] font-mono uppercase text-emerald-400 font-semibold">
                  <Clock className="w-3 h-3" />
                  <span>PROMISED WINDOW</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white font-mono mt-0.5">
                  {order.promisedPickupTime || "Soon"}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {order.counter || "Counter 1"}
                </div>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="mt-5 p-4 rounded-2xl bg-[#111422] border border-white/[0.06] flex flex-col items-center text-center">
              <div 
                onClick={() => { sound.playClick(); setZoomQR(true); }}
                className="p-3 rounded-2xl bg-white shadow-xl cursor-pointer hover:scale-105 transition-transform group relative"
                title="Tap to enlarge QR Code"
              >
                <QRCodeSVG 
                  value={qrPayload} 
                  size={120} 
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
                <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                  <Maximize2 className="w-6 h-6" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => { sound.playClick(); setZoomQR(true); }}
                className="mt-2.5 text-xs text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Tap to display full-screen QR</span>
              </button>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                Kitchen scans this token at handover counter
              </span>
            </div>

            {/* Order Items Breakdown */}
            <div className="mt-5 space-y-2 max-h-36 overflow-y-auto pr-1">
              {order.items?.map((it, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-white/[0.04]">
                  <span className="text-slate-200">
                    <strong className="text-amber-400 font-mono">{it.quantity}x</strong> {it.name}
                  </span>
                  <span className="font-mono text-slate-400">₹{it.price * it.quantity}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-white/[0.08] flex justify-between items-center">
              <span className="text-xs text-slate-400 font-mono">Total Paid</span>
              <span className="text-base font-extrabold text-white font-mono">₹{order.totalAmount}</span>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleProceedToTrack}
                className="flex-2 py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all active:scale-95"
              >
                <span>Track My Order</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </motion.div>
        </div>

        {/* Full-Screen QR Modal */}
        {zoomQR && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoomQR(false)}
              className="fixed inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative z-10 p-8 rounded-3xl bg-[#0e111a] border border-white/15 text-center max-w-sm w-full shadow-2xl"
            >
              <div className="p-4 rounded-2xl bg-white inline-block shadow-2xl mx-auto">
                <QRCodeSVG value={qrPayload} size={220} level="H" />
              </div>
              <div className="mt-4 font-mono font-bold text-white text-lg">
                Token #{order.token || order.id}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                {qrPayload}
              </p>
              <button
                onClick={() => setZoomQR(false)}
                className="mt-6 px-6 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
}
