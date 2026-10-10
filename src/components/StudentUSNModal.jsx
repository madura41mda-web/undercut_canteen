import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  GraduationCap, 
  X, 
  Check, 
  AlertTriangle, 
  User, 
  ArrowRight 
} from "lucide-react";
import { sound } from "../utils/audio";
import { 
  USN_REGEX, 
  NAME_REGEX,
  getStoredStudentUSN, 
  setStoredStudentUSN, 
  getStoredStudentName, 
  setStoredStudentName 
} from "../services/canteenState";

export default function StudentUSNModal({
  isOpen,
  onClose,
  onSave,
  canDismiss = true,
  title = "Student USN Identification",
  subtitle = "Enter your college USN and Name to order, track and collect food"
}) {
  const [yearDigits, setYearDigits] = useState("");
  const [rollDigits, setRollDigits] = useState("");
  const [studentName, setStudentName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState("");

  const yearInputRef = useRef(null);
  const rollInputRef = useRef(null);

  // Initialize from sessionStorage on open
  useEffect(() => {
    if (isOpen) {
      const stored = getStoredStudentUSN();
      const storedName = getStoredStudentName();
      setStudentName(storedName || "");
      setNameTouched(false);
      setError("");

      if (stored && USN_REGEX.test(stored)) {
        // e.g. 1GA24CS012 -> year: 24, roll: 012
        setYearDigits(stored.slice(3, 5));
        setRollDigits(stored.slice(7, 10));
      } else {
        setYearDigits("");
        setRollDigits("");
      }

      // Auto-focus first input
      setTimeout(() => {
        yearInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleYearChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
    setYearDigits(val);
    setError("");

    // Auto-advance focus to 3-digit roll input when 2 digits are entered
    if (val.length === 2) {
      rollInputRef.current?.focus();
    }
  };

  const handleRollChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
    setRollDigits(val);
    setError("");
  };

  const handleRollKeyDown = (e) => {
    if (e.key === "Backspace" && rollDigits.length === 0) {
      yearInputRef.current?.focus();
    }
  };

  const fullUSN = `1GA${yearDigits}CS${rollDigits}`;
  const isUSNValid = USN_REGEX.test(fullUSN);
  const cleanName = studentName.trim();
  const isNameValid = NAME_REGEX.test(cleanName);

  const getNameErrorMessage = () => {
    if (!cleanName) return "Student name is required.";
    if (cleanName.length < 2) return "Name must be at least 2 characters.";
    if (cleanName.length > 50) return "Name cannot exceed 50 characters.";
    if (!NAME_REGEX.test(cleanName)) return "Only letters, spaces, dots, hyphens and apostrophes allowed.";
    return "";
  };

  const nameError = (nameTouched || studentName.length > 0) ? getNameErrorMessage() : "";

  const handleSubmit = (e) => {
    e?.preventDefault();
    setNameTouched(true);
    setError("");

    if (yearDigits.length !== 2 || rollDigits.length !== 3 || !isUSNValid) {
      setError("Please enter a valid 5-digit USN (e.g. 1GA24CS012).");
      return;
    }

    if (!isNameValid) {
      setError(getNameErrorMessage() || "Please enter a valid student name.");
      return;
    }

    sound.playSuccess();
    setStoredStudentUSN(fullUSN);
    setStoredStudentName(cleanName);

    if (onSave) {
      onSave(fullUSN, cleanName);
    }
    if (onClose) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-md rounded-3xl bg-[#0e111a] border border-amber-500/30 p-6 sm:p-7 shadow-2xl text-left overflow-hidden"
        >
          {/* Dismiss button if allowed */}
          {canDismiss && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Modal Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                {title}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 mt-5">
            {/* USN Input Segmented Control */}
            <div>
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-2">
                College USN <span className="text-amber-400">*</span>
              </label>

              <div className="flex items-center justify-between gap-1.5 sm:gap-2 p-2 rounded-2xl bg-[#141828] border border-white/10">
                {/* 1. Fixed Prefix: 1GA */}
                <div className="px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-amber-400 font-mono font-extrabold text-sm sm:text-base select-none">
                  1GA
                </div>

                {/* 2. Year: 2-digit input */}
                <input
                  ref={yearInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  placeholder="24"
                  value={yearDigits}
                  onChange={handleYearChange}
                  className="w-14 sm:w-16 px-2 py-2.5 rounded-xl bg-[#0d101d] border border-white/15 text-white font-mono font-bold text-center text-base sm:text-lg focus:outline-none focus:border-amber-400 transition-colors"
                />

                {/* 3. Fixed Branch: CS */}
                <div className="px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-amber-400 font-mono font-extrabold text-sm sm:text-base select-none">
                  CS
                </div>

                {/* 4. Roll: 3-digit input */}
                <input
                  ref={rollInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  placeholder="012"
                  value={rollDigits}
                  onChange={handleRollChange}
                  onKeyDown={handleRollKeyDown}
                  className="flex-1 min-w-[70px] px-2 py-2.5 rounded-xl bg-[#0d101d] border border-white/15 text-white font-mono font-bold text-center text-base sm:text-lg focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              {/* USN Live Preview & Format Helper */}
              <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Format: 1GA[YY]CS[XXX]</span>
                <span className={isUSNValid ? "text-emerald-400 font-bold flex items-center gap-1" : "text-slate-500"}>
                  {isUSNValid && <Check className="w-3.5 h-3.5" />}
                  Preview: {fullUSN.length === 10 ? fullUSN : `${fullUSN}…`}
                </span>
              </div>
            </div>

            {/* Mandatory Student Name */}
            <div>
              <label htmlFor="student-name-input" className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Student Name <span className="text-amber-400">*</span></span>
                </span>
                <span className="text-[10px] text-slate-400 lowercase font-sans">
                  (2–50 letters)
                </span>
              </label>
              <input
                id="student-name-input"
                type="text"
                required
                placeholder="Enter your full name (e.g. Samarth Sharma)"
                value={studentName}
                onChange={(e) => {
                  setStudentName(e.target.value);
                  setError("");
                }}
                onBlur={() => setNameTouched(true)}
                maxLength={50}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-[#141828] border text-xs sm:text-sm text-white focus:outline-none transition-colors placeholder:text-slate-500 ${
                  nameError 
                    ? "border-red-500/60 focus:border-red-400" 
                    : isNameValid 
                      ? "border-emerald-500/40 focus:border-emerald-400" 
                      : "border-white/10 focus:border-amber-400"
                }`}
              />
              {nameError && (
                <p className="mt-1 text-[11px] text-red-400 font-medium">
                  {nameError}
                </p>
              )}
            </div>

            {/* Error Message Alert */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={!isUSNValid || !isNameValid}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <span>Save & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
