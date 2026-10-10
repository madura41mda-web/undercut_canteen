import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  X,
  Clock,
  CreditCard,
  Smartphone,
  Wallet,
  AlertTriangle,
  Zap,
  ShieldCheck,
  ArrowRight,
  Info,
  User
} from "lucide-react";
import confetti from "canvas-confetti";
import { sound } from "../utils/audio";
import { 
  USN_REGEX, 
  NAME_REGEX,
  getStoredStudentUSN, 
  setStoredStudentUSN, 
  getStoredStudentName, 
  setStoredStudentName,
  sanitizeErrorMessage
} from "../services/canteenState";

export default function CheckoutModal({
  isOpen,
  onClose,
  cart,
  feasibleSlots = [],
  onConfirmOrder
}) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [studentName, setStudentName] = useState(() => getStoredStudentName() || "");
  const [studentRoll, setStudentRoll] = useState(() => getStoredStudentUSN() || "");
  const [nameTouched, setNameTouched] = useState(false);
  const [usnTouched, setUsnTouched] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [slotAdjustedMsg, setSlotAdjustedMsg] = useState("");
  const [alternatives, setAlternatives] = useState(null);

  // Auto-select recommended slot when slots change and sync stored USN & Name.
  useEffect(() => {
    if (isOpen) {
      setStudentRoll(getStoredStudentUSN() || "");
      setStudentName(getStoredStudentName() || "");
      setNameTouched(false);
      setUsnTouched(false);
      setErrorMessage("");
    }
    if (feasibleSlots.length > 0 && !selectedSlot) {
      setSelectedSlot(feasibleSlots[0]);
    }
  }, [isOpen, feasibleSlots, selectedSlot]);

  if (!isOpen) return null;

  // Validate stock client-side before submitting.
  const stockErrors = cart.filter((item) => item.quantity > item.stock);
  const hasStockError = stockErrors.length > 0;

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const maxPrepTime = cart.length ? Math.max(...cart.map((i) => i.prepTimeMinutes)) : 0;

  const cleanUSN = studentRoll.trim().toUpperCase();
  const isUSNValid = USN_REGEX.test(cleanUSN);

  const cleanName = studentName.trim();
  const isNameValid = NAME_REGEX.test(cleanName);

  const getNameErrorMessage = () => {
    if (!cleanName) return "Student name is required.";
    if (cleanName.length < 2) return "Name must be at least 2 characters.";
    if (cleanName.length > 50) return "Name cannot exceed 50 characters.";
    if (!NAME_REGEX.test(cleanName)) return "Letters, spaces, dots, hyphens and apostrophes only.";
    return "";
  };

  const getUSNErrorMessage = () => {
    if (!cleanUSN) return "College USN is required.";
    if (!USN_REGEX.test(cleanUSN)) return "Must match format 1GAxxCSxxx (e.g. 1GA24CS012).";
    return "";
  };

  const nameError = (nameTouched || studentName.length > 0) ? getNameErrorMessage() : "";
  const usnError = (usnTouched || studentRoll.length > 0) ? getUSNErrorMessage() : "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNameTouched(true);
    setUsnTouched(true);
    setErrorMessage("");
    setSlotAdjustedMsg("");
    setAlternatives(null);

    if (!isUSNValid) {
      setErrorMessage("Please enter a valid college USN (Format: 1GAxxCSxxx, e.g. 1GA24CS012).");
      return;
    }

    if (!isNameValid) {
      setErrorMessage(getNameErrorMessage() || "Please enter a valid student name.");
      return;
    }

    if (hasStockError) {
      setErrorMessage("Please adjust items exceeding available kitchen stock before proceeding.");
      return;
    }

    // Persist USN & Name
    setStoredStudentUSN(cleanUSN);
    setStoredStudentName(cleanName);

    const chosenSlot = selectedSlot || feasibleSlots[0] || null;

    setIsSubmitting(true);
    sound.playClick();

    try {
      const result = await onConfirmOrder({
        items: cart,
        studentName: cleanName,
        studentRoll: cleanUSN,
        pickupSlot: chosenSlot,
        instructions: instructions.trim() || null,
        paymentMethod,
        priority: "NORMAL",
      });

      if (result.ok) {
        sound.playSuccess();
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });

        if (result.slotAdjusted) {
          setSlotAdjustedMsg(
            "Your pickup time was adjusted by the kitchen scheduler to the earliest feasible slot."
          );
        }
        setIsSubmitting(false);
        onClose();
      } else {
        setIsSubmitting(false);
        const friendly = sanitizeErrorMessage(result.message || result.reason);
        setErrorMessage(friendly);
        if (result.alternatives?.items?.length > 0) {
          setAlternatives(result.alternatives);
        }
      }
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(sanitizeErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
      />

      <div className="min-h-full flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-[#0e111a] border border-white/[0.1] rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden"
        >
          {/* Subtle glowing accent */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-3xl pointer-events-none" />

          {/* Modal Header */}
          <div className="flex items-center justify-between pb-5 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Zap className="w-5 h-5 fill-amber-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Smart Canteen Checkout</h3>
                <p className="text-xs text-slate-400">Realistic kitchen slot allocation & queue scheduling</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stock Validation Alert */}
          {hasStockError && (
            <div className="mt-4 p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Stock Validation Warning:</span>
                Some items in your cart exceed the live kitchen counter inventory. Please return to tray and decrease the quantity.
              </div>
            </div>
          )}

          {/* Slot adjusted info */}
          {slotAdjustedMsg && (
            <div className="mt-4 p-3.5 rounded-xl bg-amber-900/30 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{slotAdjustedMsg}</span>
            </div>
          )}

          {/* Server error */}
          {errorMessage && (
            <div className="mt-4 p-3.5 rounded-xl bg-red-900/30 border border-red-500/30 text-red-300 text-xs">
              <div className="font-bold mb-1 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Order Issue
              </div>
              {errorMessage}

              {/* Alternative items suggestion */}
              {alternatives?.items?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-red-500/20">
                  <div className="font-semibold text-amber-300 mb-2">
                    ✨ Available alternatives in the same category:
                  </div>
                  <div className="space-y-1">
                    {alternatives.items.map((alt) => (
                      <div key={alt.id} className="flex justify-between text-[11px] text-slate-300">
                        <span>{alt.name}</span>
                        <span className="font-mono text-emerald-400">₹{alt.price} • {alt.stock} left</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">

            {/* 1. Feasible Pickup Slot Picker */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Select Feasible Pickup Time Window
                </label>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Kitchen Capacity Verified
                </span>
              </div>

              {feasibleSlots.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs text-center">
                  Loading available slots…
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {feasibleSlots.map((slot) => {
                    const isSelected = selectedSlot?.id === slot.id;

                    return (
                      <div
                        key={slot.id}
                        onClick={() => {
                          sound.playClick();
                          setSelectedSlot(slot);
                        }}
                        className={`relative p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/15"
                            : "bg-[#141724] border-white/[0.08] text-slate-300 hover:border-white/20"
                        }`}
                      >
                        {slot.recommended && (
                          <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-400 text-black uppercase tracking-wider shadow">
                            RECOMMENDED
                          </span>
                        )}

                        <div className="font-mono text-lg font-bold">
                          {slot.time}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-1 font-medium">
                          in {slot.minutesFromNow} mins • {slot.efficiency}
                        </div>

                        <div className="mt-2 text-[10px] text-slate-400 font-mono flex items-center gap-1">
                          <span>Load:</span>
                          <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${slot.kitchenWorkloadPercent}%` }}
                            />
                          </div>
                          <span>{slot.kitchenWorkloadPercent}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Mandatory Student Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Student Name <span className="text-amber-400">*</span></span>
                  </span>
                  <span className="text-[10px] text-slate-500 lowercase">(2–50 chars)</span>
                </label>
                <input
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => {
                    setStudentName(e.target.value);
                    setErrorMessage("");
                  }}
                  onBlur={() => setNameTouched(true)}
                  placeholder="e.g. Samarth Sharma"
                  maxLength={50}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-[#141724] border text-sm text-white focus:outline-none transition-colors ${
                    nameError 
                      ? "border-red-500/60 focus:border-red-400" 
                      : isNameValid 
                        ? "border-emerald-500/40 focus:border-emerald-400" 
                        : "border-white/[0.08] focus:border-amber-500/60"
                  }`}
                />
                {nameError && (
                  <p className="mt-1 text-[11px] text-red-400 font-medium">
                    {nameError}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span>Student USN <span className="text-amber-400 font-mono">*</span></span>
                  <span className="text-[10px] text-slate-500">1GAxxCSxxx</span>
                </label>
                <input
                  type="text"
                  required
                  value={studentRoll}
                  onChange={(e) => {
                    setStudentRoll(e.target.value.toUpperCase());
                    setErrorMessage("");
                  }}
                  onBlur={() => setUsnTouched(true)}
                  placeholder="1GA24CS012"
                  maxLength={10}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-[#141724] border text-sm text-white font-mono uppercase tracking-wider focus:outline-none transition-colors ${
                    usnError 
                      ? "border-red-500/60 focus:border-red-400" 
                      : isUSNValid 
                        ? "border-emerald-500/40 focus:border-emerald-400" 
                        : "border-white/[0.08] focus:border-amber-500/60"
                  }`}
                />
                {usnError && (
                  <p className="mt-1 text-[11px] text-red-400 font-medium">
                    {usnError}
                  </p>
                )}
              </div>
            </div>

            {/* 3. Special Instructions */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Special Preparation Instructions (Optional)
              </label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Less spicy, keep chutney separate, packaging for lab..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141724] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/60"
              />
            </div>

            {/* 4. Payment Method Selection */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2.5">
                Payment Option
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "UPI", label: "UPI (Fast)", icon: Smartphone, desc: "GPay / PhonePe" },
                  { id: "Campus RFID Card", label: "Campus Card", icon: CreditCard, desc: "Tap ID Card" },
                  { id: "Counter Cash", label: "Pay at Counter", icon: Wallet, desc: "Cash on token" }
                ].map((method) => {
                  const isSelected = paymentMethod === method.id;
                  const Icon = method.icon;

                  return (
                    <div
                      key={method.id}
                      onClick={() => {
                        sound.playClick();
                        setPaymentMethod(method.id);
                      }}
                      className={`p-3 rounded-xl border cursor-pointer text-center transition-all ${
                        isSelected
                          ? "bg-amber-500/15 border-amber-500 text-white"
                          : "bg-[#141724] border-white/[0.06] text-slate-400 hover:border-white/20"
                      }`}
                    >
                      <Icon className={`w-5 h-5 mx-auto mb-1 ${isSelected ? "text-amber-400" : "text-slate-400"}`} />
                      <div className="text-xs font-bold text-white leading-tight">{method.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{method.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Order Summary Card */}
            <div className="p-4 rounded-2xl bg-[#141724] border border-white/[0.08] space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Items Ordered ({totalItemsCount}):</span>
                <span className="font-mono text-white">{cart.map((i) => `${i.quantity}x ${i.name}`).join(", ")}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Estimated Cooking Time:</span>
                <span className="font-mono text-amber-400 font-semibold">{maxPrepTime} mins (Parallel stations)</span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-white/[0.06]">
                <span>Total Payable:</span>
                <span className="font-mono text-xl text-amber-400 font-extrabold">₹{totalAmount}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-3 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-300 font-semibold text-xs sm:text-sm transition-colors"
              >
                Back to Tray
              </button>

              <button
                type="submit"
                disabled={isSubmitting || hasStockError || !isUSNValid || !isNameValid}
                className={`w-2/3 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                  hasStockError || isSubmitting || !isUSNValid || !isNameValid
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-amber-500/25 active:scale-95 cursor-pointer"
                }`}
              >
                {isSubmitting ? (
                  <span className="animate-pulse">Locking In Kitchen Slot…</span>
                ) : (
                  <>
                    <span>Confirm & Lock In Slot</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
