import { motion } from "motion/react";
import { Clock, Plus, Minus, Flame, Check, AlertTriangle, XCircle, PauseCircle } from "lucide-react";
import { sound } from "../utils/audio";

const DEFAULT_PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80";

export default function FoodCard({ item, inCartQuantity = 0, onAdd, onUpdateQuantity }) {
  const isTemporarilyUnavailable = item.isAvailable === false;
  const isSoldOut = item.stock <= 0;
  const isLowStock = !isSoldOut && !isTemporarilyUnavailable && item.stock <= 4;
  const cannotOrder = isSoldOut || isTemporarilyUnavailable;

  const handleAdd = () => {
    if (cannotOrder) return;
    sound.playClick();
    onAdd(item);
  };

  const handleIncrement = (e) => {
    e.stopPropagation();
    if (cannotOrder || inCartQuantity >= item.stock) return;
    sound.playClick();
    onUpdateQuantity(item.id, inCartQuantity + 1);
  };

  const handleDecrement = (e) => {
    e.stopPropagation();
    sound.playClick();
    onUpdateQuantity(item.id, inCartQuantity - 1);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className={`group relative flex flex-col rounded-2xl bg-[#0f121d] border overflow-hidden transition-all duration-300 ${
        cannotOrder 
          ? "border-white/[0.05] opacity-70" 
          : "border-white/[0.08] hover:border-amber-500/40 hover:shadow-2xl hover:shadow-amber-500/10"
      }`}
    >
      {/* Food Imagery Container */}
      <div className="relative w-full h-48 sm:h-52 bg-slate-900 overflow-hidden select-none">
        <img
          src={item.image || DEFAULT_PLACEHOLDER_IMAGE}
          alt={item.name}
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.src !== DEFAULT_PLACEHOLDER_IMAGE) {
              e.currentTarget.src = DEFAULT_PLACEHOLDER_IMAGE;
            }
          }}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
            cannotOrder ? "grayscale contrast-75" : ""
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f121d] via-[#0f121d]/20 to-transparent" />

        {/* Top Floating Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
          {/* Prep Time Tag */}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium backdrop-blur-md bg-black/70 text-slate-200 border border-white/10 shadow-sm">
            <Clock className="w-3 h-3 text-amber-400" />
            {item.prepTimeMinutes} mins
          </span>

          {/* Stock Availability Pill */}
          {isTemporarilyUnavailable ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md bg-amber-950/90 text-amber-300 border border-amber-500/40">
              <PauseCircle className="w-3 h-3 text-amber-400" />
              Unavailable right now
            </span>
          ) : isSoldOut ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md bg-red-950/80 text-red-300 border border-red-500/30">
              <XCircle className="w-3 h-3 text-red-400" />
              Sold Out
            </span>
          ) : isLowStock ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md bg-amber-950/85 text-amber-300 border border-amber-500/40 animate-pulse">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              Only {item.stock} left
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
              <Check className="w-3 h-3 text-emerald-400" />
              Available
            </span>
          )}
        </div>

        {/* Batching & Special Tags */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 flex-wrap pointer-events-none">
          {item.tags?.includes("Fast Batch") && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/90 text-black shadow-md">
              <Flame className="w-3 h-3 fill-black" />
              BATCH FAST-TRACK
            </span>
          )}
          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 text-slate-300 backdrop-blur-sm border border-white/10">
            {item.category}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-amber-300 transition-colors leading-snug">
              {item.name}
            </h3>
            {/* Veg Badge */}
            <div className="mt-1 w-4 h-4 rounded border border-emerald-500 flex items-center justify-center p-0.5 shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 line-clamp-2 mb-3 leading-relaxed">
            {item.description}
          </p>

          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mb-4">
            <span className="text-amber-400/90 font-medium">★ {item.rating} ({item.reviewCount})</span>
            <span>•</span>
            <span>{item.calories} kcal</span>
            <span>•</span>
            <span className="truncate text-slate-400">{item.counter.split(" ")[0]}</span>
          </div>
        </div>

        {/* Footer: Price & Add / Quantity Controls */}
        <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">PRICE</span>
            <span className="font-mono text-lg sm:text-xl font-bold text-white tracking-tight">
              ₹{item.price}
            </span>
          </div>

          {cannotOrder ? (
            <button
              disabled
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-not-allowed border ${
                isTemporarilyUnavailable
                  ? "bg-amber-500/10 text-amber-300/80 border-amber-500/20"
                  : "bg-white/[0.05] text-slate-400 border-white/[0.08]"
              }`}
            >
              {isTemporarilyUnavailable ? "Unavailable right now" : "Sold out"}
            </button>
          ) : inCartQuantity > 0 ? (
            <div className="flex items-center rounded-xl bg-[#1a1f2e] border border-amber-500/40 p-1 shadow-md">
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={handleDecrement}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
                title="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </motion.button>
              <span className="w-8 text-center font-mono font-bold text-sm text-amber-300">
                {inCartQuantity}
              </span>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={handleIncrement}
                disabled={inCartQuantity >= item.stock}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                  inCartQuantity >= item.stock
                    ? "bg-white/[0.02] text-slate-400 cursor-not-allowed"
                    : "bg-amber-500 text-black hover:bg-amber-400"
                }`}
                title={inCartQuantity >= item.stock ? "Max stock reached" : "Increase quantity"}
              >
                <Plus className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-black font-semibold text-xs sm:text-sm hover:bg-amber-400 shadow-md shadow-amber-500/20 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add</span>
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
