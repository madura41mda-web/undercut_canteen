import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Sparkles, 
  Clock, 
  Flame, 
  Zap, 
  CheckCircle2, 
  ArrowRight,
  Filter,
  TrendingUp,
  ShieldCheck
} from "lucide-react";
import FoodCard from "./FoodCard";
import { CATEGORIES } from "../data/mockMenu";
import { sound } from "../utils/audio";

export default function StudentHome({ 
  menu, 
  cart, 
  onAddToCart, 
  onUpdateCartQuantity,
  onOpenCart,
  onNavigateToTracking,
  activeOrder
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Items");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [fastPrepOnly, setFastPrepOnly] = useState(false);

  // Cart summary
  const totalCartItems = cart.reduce((acc, i) => acc + i.quantity, 0);
  const totalCartPrice = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menu.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === "All Items" || item.category === selectedCategory;
      const matchesAvailable = onlyAvailable ? item.stock > 0 : true;
      const matchesFastPrep = fastPrepOnly ? item.prepTimeMinutes <= 8 : true;

      return matchesSearch && matchesCategory && matchesAvailable && matchesFastPrep;
    });
  }, [menu, searchQuery, selectedCategory, onlyAvailable, fastPrepOnly]);

  return (
    <div className="relative pb-24">
      {/* Background radial atmosphere inspired by motion.dev */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-96 bg-gradient-to-b from-amber-500/10 via-amber-500/[0.02] to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="pt-8 sm:pt-14 pb-10 px-4 sm:px-6 max-w-7xl mx-auto text-center">
        {/* Hackathon Problem Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#121624] border border-amber-500/30 text-amber-300 text-xs font-medium mb-6 shadow-sm"
        >
          <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Smart Canteen Order & Pickup System • Problem 76</span>
          <span className="hidden sm:inline text-slate-400">|</span>
          <span className="hidden sm:inline text-slate-300">Queue Reduction AI</span>
        </motion.div>

        {/* Hero Title */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.15]"
        >
          Skip the Long Queue.{" "}
          <span className="bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 bg-clip-text text-transparent">
            Order Ahead with Feasible Slots.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 sm:mt-6 text-sm sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed"
        >
          Browse real-time stock, pick algorithmically verified pickup windows, and collect freshly prepared food without standing in line between classes.
        </motion.p>

        {/* Quick Highlights / Operational Stats Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto"
        >
          <div className="p-3.5 rounded-xl bg-[#0f121d] border border-white/[0.07] text-left">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-mono mb-1">
              <Zap className="w-3.5 h-3.5" />
              <span>AVG WAIT TIME</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">8 – 12 Mins</div>
            <div className="text-[11px] text-slate-400">Dynamically scheduled</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0f121d] border border-white/[0.07] text-left">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>KITCHEN LOAD</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">Moderate (58%)</div>
            <div className="text-[11px] text-emerald-400">Slots on schedule</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0f121d] border border-white/[0.07] text-left">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>STOCK ACCURACY</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">Live Counter Sync</div>
            <div className="text-[11px] text-slate-400">Zero sold-out order fails</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0f121d] border border-white/[0.07] text-left">
            <div className="flex items-center gap-2 text-purple-400 text-xs font-mono mb-1">
              <Flame className="w-3.5 h-3.5" />
              <span>SMART BATCHING</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">Active (4 Batches)</div>
            <div className="text-[11px] text-purple-300">Synchronized cooking</div>
          </div>
        </motion.div>

        {/* Floating Active Order Reminder Banner if exists */}
        {activeOrder && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 max-w-4xl mx-auto p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#131726] to-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-left shadow-lg"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Clock className="w-5 h-5 animate-spin text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">Active Order In Progress</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/40 text-white font-bold">{activeOrder.id}</span>
                </div>
                <p className="text-sm font-semibold text-white mt-0.5">
                  Status: <span className="text-amber-300 underline font-mono">{activeOrder.status}</span> • Expected: {activeOrder.promisedPickupTime}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                sound.playClick();
                onNavigateToTracking();
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs sm:text-sm hover:bg-amber-400 flex items-center justify-center gap-2 shrink-0 transition-transform active:scale-95"
            >
              <span>View Live Timeline</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </section>

      {/* Interactive Menu Filtering & Search Controls */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0d101a] border border-white/[0.08] shadow-xl">
          
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search food by name, craving, counter or ingredients..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#141724] border border-white/[0.08] text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/40 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Quick Filter Checkboxes */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { sound.playClick(); setOnlyAvailable(!onlyAvailable); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  onlyAvailable
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                    : "bg-[#141724] text-slate-400 border-white/[0.06] hover:text-slate-200"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>In Stock Only</span>
              </button>

              <button
                onClick={() => { sound.playClick(); setFastPrepOnly(!fastPrepOnly); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  fastPrepOnly
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                    : "bg-[#141724] text-slate-400 border-white/[0.06] hover:text-slate-200"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Quick Prep (≤ 8 mins)</span>
              </button>
            </div>
          </div>

          {/* Category Horizontal Pills */}
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((category) => {
              const isSelected = selectedCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => {
                    sound.playClick();
                    setSelectedCategory(category);
                  }}
                  className={`relative px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                    isSelected
                      ? "text-black"
                      : "text-slate-400 hover:text-slate-200 bg-[#141724]/60 hover:bg-[#141724]"
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="categoryIndicator"
                      className="absolute inset-0 rounded-xl bg-amber-400 shadow-md shadow-amber-400/20"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{category}</span>
                </button>
              );
            })}
          </div>

        </div>
      </section>

      {/* Menu Cards Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {selectedCategory}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Showing {filteredItems.length} freshly curated canteen selections
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 hidden sm:inline">
            Live prices & realtime kitchen slot validation
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-16 text-center rounded-2xl bg-[#0d101a] border border-white/[0.06] p-8">
            <Filter className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white">No items found</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
              We couldn't find any canteen food matching your filters. Try clearing your search or category filters.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All Items");
                setOnlyAvailable(false);
                setFastPrepOnly(false);
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            <AnimatePresence>
              {filteredItems.map((item) => {
                const cartMatch = cart.find((c) => c.id === item.id);
                const quantity = cartMatch ? cartMatch.quantity : 0;

                return (
                  <FoodCard
                    key={item.id}
                    item={item}
                    inCartQuantity={quantity}
                    onAdd={onAddToCart}
                    onUpdateQuantity={onUpdateCartQuantity}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Bottom Sticky Floating Cart Bar (for quick access if cart has items) */}
      <AnimatePresence>
        {totalCartItems > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-5 left-4 right-4 max-w-xl mx-auto z-30"
          >
            <div className="p-3 sm:p-4 rounded-2xl bg-[#141824]/95 backdrop-blur-xl border border-amber-500/40 shadow-2xl shadow-black/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-black font-extrabold font-mono text-sm shadow-md">
                  {totalCartItems}
                </div>
                <div>
                  <div className="text-xs text-slate-400">Items Selected</div>
                  <div className="font-mono text-base font-bold text-white">
                    ₹{totalCartPrice}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  sound.playClick();
                  onOpenCart();
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs sm:text-sm hover:bg-amber-400 flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all active:scale-95"
              >
                <span>Select Feasible Slot</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
