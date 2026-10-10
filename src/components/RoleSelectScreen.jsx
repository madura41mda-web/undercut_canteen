import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  UtensilsCrossed, 
  ChefHat, 
  LayoutDashboard, 
  ArrowRight, 
  Zap,
  CheckCircle2,
  Lock,
  Delete,
  X,
  AlertTriangle,
  Loader2,
  KeyRound
} from "lucide-react";
import { ROLES, ROLE_DETAILS, RoleService } from "../lib/role";
import { sound } from "../utils/audio";

export default function RoleSelectScreen({ onSelectRole }) {
  const [pinModalRole, setPinModalRole] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const cards = [
    {
      role: ROLES.STUDENT,
      icon: UtensilsCrossed,
      color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400",
      accent: "bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/25",
      badge: "Student Portal • Direct Access",
      requiresPin: false,
      features: [
        "Live dynamic menu & dish availability",
        "Capacity-guaranteed pickup slots",
        "Token tracking & preparation countdown",
      ],
    },
    {
      role: ROLES.KITCHEN,
      icon: ChefHat,
      color: "from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-400",
      accent: "bg-cyan-500 text-black hover:bg-cyan-400 shadow-cyan-500/25",
      badge: "Kitchen Staff • 6-Digit Passcode",
      requiresPin: true,
      features: [
        "Queue scheduling & burner station priority",
        "Multi-order synchronized batch cooking",
        "Instant stock & availability controls",
      ],
    },
    {
      role: ROLES.MANAGER,
      icon: LayoutDashboard,
      color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-400",
      accent: "bg-purple-500 text-white hover:bg-purple-400 shadow-purple-500/25",
      badge: "Manager Control • 6-Digit Passcode",
      requiresPin: true,
      features: [
        "Kitchen capacity & rush hour multipliers",
        "Item pricing, daily quotas & archive control",
        "Read-only queue audit & campus analytics",
      ],
    },
  ];

  // Direct selection for Student, PIN modal for Kitchen & Manager
  const handleRoleCardClick = (role) => {
    sound.playClick();
    if (role === ROLES.STUDENT) {
      RoleService.setRole(role);
      if (onSelectRole) onSelectRole(role);
    } else {
      setPinModalRole(role);
      setPin("");
      setPinError("");
    }
  };

  const handleKeyPress = useCallback((digit) => {
    sound.playClick();
    setPinError("");
    setPin((prev) => {
      if (prev.length < 6) return prev + digit;
      return prev;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    sound.playClick();
    setPinError("");
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    sound.playClick();
    setPin("");
    setPinError("");
  }, []);

  const handleSubmitPin = useCallback(async (codeToVerify) => {
    const code = codeToVerify || pin;
    if (code.length !== 6) {
      setPinError("Please enter a 6-digit PIN code.");
      return;
    }

    setIsVerifying(true);
    setPinError("");
    sound.playClick();

    try {
      const res = await RoleService.verifyPasscode(pinModalRole, code);
      if (res.ok) {
        sound.playSuccess();
        const role = pinModalRole;
        setPinModalRole(null);
        setPin("");
        if (onSelectRole) onSelectRole(role);
      } else {
        sound.playError();
        setPinError(res.message || "Invalid PIN code. Please try again.");
        setPin("");
      }
    } catch (err) {
      sound.playError();
      setPinError(err.message || "Could not verify passcode.");
      setPin("");
    } finally {
      setIsVerifying(false);
    }
  }, [pin, pinModalRole, onSelectRole]);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (pin.length === 6 && pinModalRole) {
      handleSubmitPin(pin);
    }
  }, [pin, pinModalRole, handleSubmitPin]);

  // Physical keyboard support when modal is open
  useEffect(() => {
    if (!pinModalRole) return;

    const handleKeyDown = (e) => {
      if (e.key >= "0" && e.key <= "9") {
        handleKeyPress(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Escape") {
        setPinModalRole(null);
      } else if (e.key === "Enter" && pin.length === 6) {
        handleSubmitPin();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pinModalRole, pin, handleKeyPress, handleBackspace, handleSubmitPin]);

  const activeRoleDetails = pinModalRole ? ROLE_DETAILS[pinModalRole] : null;

  return (
    <div className="relative min-h-[85vh] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-gradient-to-b from-amber-500/10 via-purple-500/5 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-3xl text-center mb-10"
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-semibold mb-4 shadow-sm">
          <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span>Stage 2: Six-Digit Passcode & Role Security</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          Select Your Smart<span className="text-amber-400">Canteen</span> Role
        </h1>
        <p className="text-slate-400 text-sm sm:text-base mt-3 max-w-xl mx-auto">
          Students enter directly. Kitchen staff and managers authenticate with a secure 6-digit role passcode.
        </p>
      </motion.div>

      {/* Three Role Cards */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          const details = ROLE_DETAILS[card.role];

          return (
            <motion.div
              key={card.role}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              whileHover={{ y: -4 }}
              className={`p-6 sm:p-7 rounded-3xl bg-[#0c0f18]/90 border ${card.color} flex flex-col justify-between shadow-xl backdrop-blur-xl relative overflow-hidden group`}
            >
              <div>
                {/* Role badge */}
                <div className="flex items-center justify-between mb-5">
                  <span className="inline-block px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-[10px] font-mono font-bold text-slate-300">
                    {card.badge}
                  </span>
                  {card.requiresPin && (
                    <span className="p-1 rounded-md bg-white/5 border border-white/10 text-slate-400" title="Passcode protected">
                      <Lock className="w-3 h-3 text-amber-400" />
                    </span>
                  )}
                </div>

                {/* Role icon */}
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Icon className="w-6 h-6 text-white" />
                </div>

                <h3 className="text-xl font-bold text-white tracking-tight">
                  {details.label}
                </h3>
                <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                  {details.desc}
                </p>

                {/* Features checklist */}
                <ul className="mt-6 space-y-2.5 border-t border-white/[0.06] pt-5">
                  {card.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleRoleCardClick(card.role)}
                className={`mt-8 w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${card.accent}`}
              >
                <span>{card.requiresPin ? `Enter PIN as ${details.label}` : `Enter as ${details.label}`}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* 6-DIGIT PIN PAD MODAL */}
      <AnimatePresence>
        {pinModalRole && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm rounded-3xl bg-[#0e111a] border border-white/10 p-6 shadow-2xl text-center overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => { setPinModalRole(null); setPin(""); setPinError(""); }}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Modal Header */}
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-3 text-amber-400">
                <KeyRound className="w-6 h-6" />
              </div>

              <h3 className="text-xl font-extrabold text-white">
                {activeRoleDetails?.label} Passcode
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Enter your 6-digit staff security PIN
              </p>

              {/* 6 PIN Dots / Display Boxes */}
              <div className="flex justify-center items-center gap-2.5 my-6">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const hasVal = pin.length > idx;
                  return (
                    <motion.div
                      key={idx}
                      animate={hasVal ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                      transition={{ duration: 0.15 }}
                      className={`w-10 h-12 rounded-xl border flex items-center justify-center text-lg font-mono font-bold transition-all ${
                        hasVal
                          ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm shadow-amber-500/20"
                          : idx === pin.length
                          ? "bg-[#141828] border-white/30 text-white animate-pulse"
                          : "bg-[#141828] border-white/10 text-slate-600"
                      }`}
                    >
                      {hasVal ? "•" : ""}
                    </motion.div>
                  );
                })}
              </div>

              {/* Error Message */}
              <AnimatePresence>
                {pinError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="mb-4 p-2.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center justify-center gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                    <span>{pinError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Numeric Keypad (1 to 9, Clear, 0, Backspace) */}
              <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto mb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={isVerifying}
                    onClick={() => handleKeyPress(String(num))}
                    className="h-12 rounded-xl bg-[#141828] hover:bg-[#1a2034] active:bg-amber-500 active:text-black border border-white/10 text-white font-mono font-bold text-lg flex items-center justify-center transition-all disabled:opacity-40"
                  >
                    {num}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={isVerifying || pin.length === 0}
                  onClick={handleClear}
                  className="h-12 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-400 hover:text-white font-mono text-xs font-semibold flex items-center justify-center transition-all disabled:opacity-30"
                >
                  Clear
                </button>

                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => handleKeyPress("0")}
                  className="h-12 rounded-xl bg-[#141828] hover:bg-[#1a2034] active:bg-amber-500 active:text-black border border-white/10 text-white font-mono font-bold text-lg flex items-center justify-center transition-all disabled:opacity-40"
                >
                  0
                </button>

                <button
                  type="button"
                  disabled={isVerifying || pin.length === 0}
                  onClick={handleBackspace}
                  className="h-12 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all disabled:opacity-30"
                >
                  <Delete className="w-4 h-4" />
                </button>
              </div>

              {/* Status Indicator / Submit */}
              {isVerifying ? (
                <div className="flex items-center justify-center gap-2 py-2 text-xs font-mono text-amber-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying credentials…</span>
                </div>
              ) : (
                <div className="text-[11px] font-mono text-slate-500">
                  Keyboard number keys (0-9) supported
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
