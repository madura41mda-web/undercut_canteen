import { motion, AnimatePresence } from "motion/react";
import { X, Trash2, Clock, AlertTriangle, ArrowRight, ShoppingBag, ShieldCheck } from "lucide-react";
import { sound } from "../utils/audio";

export default function CartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  feasibleSlots = []
}) {
  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const maxPrepTime = cart.length ? Math.max(...cart.map(i => i.prepTimeMinutes)) : 0;
  const earliestSlot = feasibleSlots[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className="w-screen max-w-md bg-[#0c0f18] border-l border-white/[0.08] flex flex-col shadow-2xl"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Your Canteen Tray</h3>
                    <p className="text-xs text-slate-400">{cart.length} item{cart.length !== 1 ? 's' : ''} queued</p>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {cart.length === 0 ? (
                  <div className="py-20 text-center">
                    <ShoppingBag className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <h4 className="font-bold text-white text-base">Your tray is empty</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Explore the menu to add freshly prepared dishes with guaranteed pickup times.
                    </p>
                  </div>
                ) : (
                  <>
                    {cart.map((item) => {
                      const isLowStock = item.stock <= 3;
                      const isStockExceeded = item.quantity > item.stock;

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 rounded-xl bg-[#131624] border transition-colors ${
                            isStockExceeded
                              ? "border-red-500/50 bg-red-950/10"
                              : "border-white/[0.06]"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-14 h-14 rounded-lg object-cover bg-slate-800 shrink-0 border border-white/10"
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-white text-sm truncate">{item.name}</h4>
                              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                                <span className="text-amber-400 font-semibold">₹{item.price}</span>
                                <span>•</span>
                                <span>⚡ {item.prepTimeMinutes}m prep</span>
                              </div>

                              {isStockExceeded ? (
                                <div className="mt-1 text-[11px] text-red-400 flex items-center gap-1 font-semibold">
                                  <AlertTriangle className="w-3 h-3" />
                                  Only {item.stock} in stock! Reduce count.
                                </div>
                              ) : isLowStock && (
                                <div className="mt-1 text-[11px] text-amber-400/90 flex items-center gap-1">
                                  <span>Only {item.stock} left in kitchen</span>
                                </div>
                              )}
                            </div>

                            {/* Quantity Adjuster */}
                            <div className="flex items-center bg-[#1a1f30] rounded-lg border border-white/10 p-0.5 shrink-0">
                              <button
                                onClick={() => {
                                  sound.playClick();
                                  if (item.quantity === 1) {
                                    onRemoveItem(item.id);
                                  } else {
                                    onUpdateQuantity(item.id, item.quantity - 1);
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white"
                              >
                                {item.quantity === 1 ? <Trash2 className="w-3 h-3 text-red-400" /> : "-"}
                              </button>
                              <span className="w-6 text-center font-mono text-xs font-bold text-white">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => {
                                  sound.playClick();
                                  onUpdateQuantity(item.id, item.quantity + 1);
                                }}
                                disabled={item.quantity >= item.stock}
                                className={`w-6 h-6 flex items-center justify-center ${
                                  item.quantity >= item.stock ? "text-slate-400 cursor-not-allowed" : "text-amber-400 hover:text-amber-300 font-bold"
                                }`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Preparation & Feasibility Estimation Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-[#121627] to-[#161a2f] border border-amber-500/20 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          Maximum Item Prep Time:
                        </span>
                        <span className="font-mono font-bold text-white">{maxPrepTime} mins</span>
                      </div>

                      {earliestSlot && (
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-white/[0.06]">
                          <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Earliest Feasible Slot:
                          </span>
                          <span className="font-mono font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30">
                            {earliestSlot.time} ({earliestSlot.minutesFromNow}m)
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Drawer Footer */}
              {cart.length > 0 && (
                <div className="p-5 border-t border-white/[0.08] bg-[#090b12] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Tray Subtotal</span>
                    <span className="font-mono text-xl font-bold text-white">₹{totalAmount}</span>
                  </div>

                  <button
                    onClick={() => {
                      sound.playClick();
                      onProceedToCheckout();
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-sm hover:from-amber-400 hover:to-amber-500 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
                  >
                    <span>Proceed to Smart Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-[11px] text-center text-slate-400">
                    Pickup slots verified against live kitchen workload
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
