import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  PlusCircle, 
  X, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  IndianRupee, 
  Hash, 
  Loader2,
  Upload
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { QUICK_PREP_MAX_MINUTES } from "../services/canteenState";
import { sound } from "../utils/audio";

export const DEFAULT_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80";

const DEFAULT_COUNTERS = [
  "Counter 1 (South Specials)",
  "Counter 2 (Grill & Wraps)",
  "Counter 3 (Curries)",
  "Counter 4 (Beverage Bar)",
];

export default function AddDishModal({
  isOpen,
  onClose,
  onAddDish,
  existingMenu = [],
}) {
  const modalRef = useRef(null);

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");
  const [isVeg, setIsVeg] = useState(true);

  // The 8-Minute Question
  const [isQuickPrep, setIsQuickPrep] = useState(true);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(6);

  const [price, setPrice] = useState("");
  const [dailyLimit, setDailyLimit] = useState(40);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [imageMode, setImageMode] = useState("upload"); // "upload" | "url"
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);
  const [counter, setCounter] = useState(DEFAULT_COUNTERS[0]);
  const [calories, setCalories] = useState("");

  // Validation & Submission
  const [clientError, setClientError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Extract unique existing categories
  const categoriesList = useMemo(() => {
    const set = new Set();
    existingMenu.forEach((m) => {
      if (m.category && m.category !== "All Items") set.add(m.category);
    });
    return Array.from(set).length > 0
      ? Array.from(set)
      : ["Quick Bites", "South Indian", "North Indian", "Bowls & Wok", "Beverages"];
  }, [existingMenu]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setCategory(categoriesList[0] || "Quick Bites");
      setIsNewCategory(false);
      setNewCategoryText("");
      setIsVeg(true);
      setIsQuickPrep(true);
      setPrepTimeMinutes(6);
      setPrice("");
      setDailyLimit(40);
      setDescription("");
      setImage("");
      setImageMode("upload");
      setIsUploadingImage(false);
      setUploadError("");
      setCounter(DEFAULT_COUNTERS[0]);
      setCalories("");
      setClientError("");
      setServerError("");
      setImageError(false);
      setIsSaving(false);
    }
  }, [isOpen, categoriesList]);

  // Re-clamp prep time when 8-minute answer toggles
  const handleQuickPrepToggle = (answerYes) => {
    sound.playClick();
    setIsQuickPrep(answerYes);
    if (answerYes) {
      setPrepTimeMinutes((prev) => (prev > QUICK_PREP_MAX_MINUTES ? QUICK_PREP_MAX_MINUTES : Math.max(1, prev)));
    } else {
      setPrepTimeMinutes((prev) => (prev <= QUICK_PREP_MAX_MINUTES ? 12 : Math.min(30, prev)));
    }
  };

  // Keyboard accessibility: ESC to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap inside modal
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }
  }, [isOpen]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setImageError(false);

    // Validate size (up to 2 MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 2 MB.`);
      return;
    }

    // Validate type (jpg, png, webp)
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const validExts = ["jpg", "jpeg", "png", "webp"];

    if (!validMimes.includes(file.type) && !validExts.includes(ext)) {
      setUploadError("Unsupported format. Please upload JPG, PNG, or WebP.");
      return;
    }

    // Immediate local preview object
    const localUrl = URL.createObjectURL(file);
    setImage(localUrl);

    setIsUploadingImage(true);
    sound.playClick();

    try {
      const fileName = `${crypto.randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
      const { error } = await supabase.storage
        .from("dish-images")
        .upload(fileName, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (error) {
        console.warn("Storage upload error:", error);
        setUploadError(`Storage upload note: ${error.message || "Failed"}. Using local preview.`);
      } else {
        const { data: publicUrlData } = supabase.storage
          .from("dish-images")
          .getPublicUrl(fileName);

        if (publicUrlData?.publicUrl) {
          setImage(publicUrlData.publicUrl);
        }
      }
    } catch (err) {
      console.warn("Upload exception:", err);
      setUploadError(`Storage notice: ${err.message || "Not available"}. Using local preview.`);
    } finally {
      setIsUploadingImage(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setClientError("");
    setServerError("");

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) {
      setClientError("Dish name must be between 2 and 60 characters.");
      return;
    }

    const finalCategory = isNewCategory ? newCategoryText.trim() : category.trim();
    if (!finalCategory) {
      setClientError("Please choose or enter a valid category.");
      return;
    }

    // Duplicate name check against active items
    const duplicate = existingMenu.find(
      (m) => m.isActive && m.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setClientError(`A dish named "${trimmedName}" already exists on the active menu.`);
      return;
    }

    const numPrice = Number(price);
    if (!numPrice || numPrice <= 0 || numPrice > 5000) {
      setClientError("Price must be greater than ₹0 and at most ₹5000.");
      return;
    }

    const numPrep = Number(prepTimeMinutes);
    if (isQuickPrep && (numPrep < 1 || numPrep > QUICK_PREP_MAX_MINUTES)) {
      setClientError(`Quick Prep dish time must be between 1 and ${QUICK_PREP_MAX_MINUTES} minutes.`);
      return;
    }
    if (!isQuickPrep && (numPrep <= QUICK_PREP_MAX_MINUTES || numPrep > 30)) {
      setClientError(`Standard dish preparation time must be between 9 and 30 minutes.`);
      return;
    }

    const numDailyLimit = Number(dailyLimit);
    if (numDailyLimit < 0 || numDailyLimit > 500) {
      setClientError("Daily quantity limit must be between 0 and 500.");
      return;
    }

    setIsSaving(true);
    sound.playClick();

    const payload = {
      name: trimmedName,
      category: finalCategory,
      price: numPrice,
      prepTimeMinutes: numPrep,
      dailyLimit: numDailyLimit,
      isVeg,
      description: description.trim(),
      image: (image && !imageError) ? image.trim() : DEFAULT_PLACEHOLDER_IMAGE,
      counter: counter.trim(),
      calories: calories ? Number(calories) : null,
    };

    const res = await onAddDish(payload);
    setIsSaving(false);

    if (res && !res.ok) {
      setServerError(res.error || "Failed to add dish to server.");
      sound.playError();
    } else {
      sound.playSuccess();
      setToastMessage(`"${trimmedName}" added successfully!`);
      setTimeout(() => {
        setToastMessage("");
        onClose();
      }, 1000);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-dish-title"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl bg-[#0e111a] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-left"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-5 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="add-dish-title" className="text-xl font-bold text-white tracking-tight">
                    Add New Dish
                  </h2>
                  <p className="text-xs text-slate-400">
                    Create a live canteen dish with instant Realtime menu propagation
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error notifications */}
            {clientError && (
              <div className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{clientError}</span>
              </div>
            )}

            {serverError && (
              <div className="mt-4 p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>Server Error: {serverError}</span>
              </div>
            )}

            {toastMessage && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{toastMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              
              {/* 1. Dish name (required) */}
              <div>
                <label htmlFor="dish-name" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  1. Dish Name <span className="text-amber-400">*</span>
                </label>
                <input
                  id="dish-name"
                  type="text"
                  required
                  placeholder="e.g. Schezwan Fried Noodles"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setClientError("");
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#131624] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500 transition-colors"
                />
              </div>

              {/* 2. Category (select + "New category...") */}
              <div>
                <label htmlFor="dish-category" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  2. Category <span className="text-amber-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    id="dish-category"
                    value={isNewCategory ? "__new__" : category}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setIsNewCategory(true);
                      } else {
                        setIsNewCategory(false);
                        setCategory(e.target.value);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#131624] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/60"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__new__">+ New category...</option>
                  </select>

                  {isNewCategory && (
                    <motion.input
                      initial={{ opacity: 0, x: 5 }}
                      animate={{ opacity: 1, x: 0 }}
                      type="text"
                      placeholder="Enter new category name"
                      value={newCategoryText}
                      onChange={(e) => setNewCategoryText(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#131624] border border-amber-500/40 text-white text-sm focus:outline-none focus:border-amber-500"
                    />
                  )}
                </div>
              </div>

              {/* 3. Veg / Non-veg toggle */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  3. Dietary Classification <span className="text-amber-400">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsVeg(true)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      isVeg
                        ? "bg-emerald-950/50 border-emerald-500/50 text-emerald-300 shadow-sm"
                        : "bg-[#131624] border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span>Vegetarian (Pure Veg)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsVeg(false)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      !isVeg
                        ? "bg-red-950/50 border-red-500/50 text-red-300 shadow-sm"
                        : "bg-[#131624] border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span>Non-Vegetarian / Egg</span>
                  </button>
                </div>
              </div>

              {/* 4. THE 8-MINUTE QUESTION, prominent, before prep time */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#171a2b] via-[#141724] to-[#121520] border border-amber-500/30 shadow-inner">
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono">
                      4. THE 8-MINUTE QUESTION
                    </span>
                  </div>

                  {/* Live Badge Preview */}
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">Student Badge Preview:</span>
                    {isQuickPrep ? (
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                        ⚡ {prepTimeMinutes} Mins
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/10 font-medium">
                        Standard Prep ({prepTimeMinutes}m)
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm font-semibold text-white mb-3">
                  Can this dish be ready in 8 minutes or less?
                </p>

                {/* Yes / No Toggle */}
                <div 
                  role="group" 
                  aria-label="Can this dish be ready in 8 minutes or less" 
                  className="grid grid-cols-2 gap-3"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isQuickPrep}
                    onClick={() => handleQuickPrepToggle(true)}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      isQuickPrep
                        ? "bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20"
                        : "bg-[#0f121d] border-white/10 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span>⚡ Yes (&le; 8 Mins)</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isQuickPrep}
                    onClick={() => handleQuickPrepToggle(false)}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      !isQuickPrep
                        ? "bg-slate-200 text-black border-white shadow-md"
                        : "bg-[#0f121d] border-white/10 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span>No (9 - 30 Mins)</span>
                  </button>
                </div>

                {/* Prep time slider / input with bounds note */}
                <div className="mt-4 pt-3 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label htmlFor="prep-time-input" className="text-xs font-medium text-slate-300 block">
                      Preparation Time: <strong className="text-amber-400 font-mono text-sm">{prepTimeMinutes} Mins</strong>
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isQuickPrep
                        ? "⚡ Will show under the 'Quick Prep' student filter (1-8 mins)"
                        : "⏳ Standard dish: will not appear under the Quick Prep filter (9-30 mins)"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="prep-time-input"
                      type="number"
                      min={isQuickPrep ? 1 : 9}
                      max={isQuickPrep ? QUICK_PREP_MAX_MINUTES : 30}
                      value={prepTimeMinutes}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (isQuickPrep) {
                          setPrepTimeMinutes(Math.max(1, Math.min(QUICK_PREP_MAX_MINUTES, val)));
                        } else {
                          setPrepTimeMinutes(Math.max(9, Math.min(30, val)));
                        }
                      }}
                      className="w-20 px-3 py-1.5 rounded-lg bg-[#0e111a] border border-white/15 text-white font-mono text-center text-sm font-bold focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-400">minutes</span>
                  </div>
                </div>
              </div>

              {/* 5. Price & 6. Daily quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dish-price" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    5. Price in Rupees (₹) <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <IndianRupee className="w-4 h-4" />
                    </div>
                    <input
                      id="dish-price"
                      type="number"
                      required
                      min="1"
                      max="5000"
                      placeholder="e.g. 75"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#131624] border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="dish-daily-limit" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    6. Daily Quantity Limit <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Hash className="w-4 h-4" />
                    </div>
                    <input
                      id="dish-daily-limit"
                      type="number"
                      required
                      min="0"
                      max="500"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#131624] border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                </div>
              </div>

              {/* 7. Description (optional) */}
              <div>
                <label htmlFor="dish-description" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  7. Description <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="dish-description"
                  rows={2}
                  placeholder="Ingredients, culinary details, or allergen notes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#131624] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500"
                />
              </div>

              {/* 8. Dish Image (Device Upload or URL) */}
              <div className="p-4 rounded-2xl bg-[#131624] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300">
                    8. Dish Image <span className="text-slate-500 font-normal">(Device Upload or URL)</span>
                  </label>
                  <div className="flex items-center gap-1 p-0.5 bg-black/40 rounded-lg border border-white/10 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setImageMode("upload");
                      }}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        imageMode === "upload"
                          ? "bg-amber-500 text-black font-bold shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Device Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setImageMode("url");
                      }}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        imageMode === "url"
                          ? "bg-amber-500 text-black font-bold shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Image URL
                    </button>
                  </div>
                </div>

                {imageMode === "upload" ? (
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div
                      onClick={() => !isUploadingImage && fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                        uploadError
                          ? "border-red-500/50 bg-red-950/20"
                          : isUploadingImage
                          ? "border-amber-500/50 bg-amber-500/10 cursor-wait"
                          : "border-white/15 hover:border-amber-500/50 hover:bg-white/[0.02]"
                      }`}
                    >
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center justify-center py-2 text-amber-400">
                          <Loader2 className="w-6 h-6 animate-spin mb-2" />
                          <span className="text-xs font-semibold">Uploading to Supabase Storage...</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Bucket: 'dish-images'</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-2">
                          <Upload className="w-6 h-6 text-slate-400 mb-2" />
                          <span className="text-xs font-semibold text-slate-200">
                            Upload from device
                          </span>
                          <span className="text-[11px] text-slate-400 mt-1">
                            JPG, PNG, or WebP • Max 2 MB
                          </span>
                        </div>
                      )}
                    </div>
                    {uploadError && (
                      <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {uploadError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      id="dish-image"
                      type="url"
                      placeholder="https://images.unsplash.com/..."
                      value={image}
                      onChange={(e) => {
                        setImage(e.target.value);
                        setImageError(false);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f121d] border border-white/10 text-white text-xs focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500"
                    />
                  </div>
                )}

                {/* Preview and Fallback */}
                {image && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/30 border border-white/10">
                    <div className="w-12 h-12 rounded-lg bg-slate-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center relative">
                      <img
                        src={imageError ? DEFAULT_PLACEHOLDER_IMAGE : image}
                        alt="Preview"
                        onError={() => setImageError(true)}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {imageMode === "upload" ? "Uploaded Device File" : "Custom Image URL"}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate font-mono">
                        {image}
                      </div>
                      {imageError && (
                        <div className="text-[10px] text-amber-400">
                          URL failed to load — fallback placeholder image active
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImage("");
                        setImageError(false);
                        setUploadError("");
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors"
                      title="Clear image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* 9. Counter (optional) */}
              <div>
                <label htmlFor="dish-counter" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  9. Counter Station <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <select
                  id="dish-counter"
                  value={counter}
                    onChange={(e) => setCounter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#131624] border border-white/10 text-white text-xs focus:outline-none focus:border-amber-500/60"
                  >
                    {DEFAULT_COUNTERS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/[0.08] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Dish…</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-4 h-4" />
                      <span>Add Dish to Menu</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
