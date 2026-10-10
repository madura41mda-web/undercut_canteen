import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChefHat,
  Flame,
  CheckCircle2,
  PackageCheck,
  SlidersHorizontal,
  PlusCircle,
  Archive,
  RotateCcw,
  X,
  Search,
  AlertTriangle,
  QrCode,
  Zap,
  ArrowUpDown,
  Check,
  Loader2,
  Pause,
  Play,
  Info
} from "lucide-react";
import { sound } from "../utils/audio";
import AddDishModal from "./AddDishModal";
import { can } from "../lib/role";
import { CanteenService, QUICK_PREP_MAX_MINUTES, isCancelledAutoHidden } from "../services/canteenState";

export default function KitchenCommandCenter({
  orders = [],
  menu = [],
  onUpdateOrderStatus,
  onUpdateStock,
  onAddDish,
  onArchiveItem,
  onUnarchiveItem,
  detectedBatches = [],
  kitchenCapacity = 12
}) {
  const [stockDrawerOpen, setStockDrawerOpen] = useState(false);
  const [addDishModalOpen, setAddDishModalOpen] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState(null);
  const [toast, setToast] = useState(null); // { message, type }
  const [autoHideTicker, setAutoHideTicker] = useState(0);

  // 30-second interval ticker to re-evaluate auto-hidden cancelled orders
  useEffect(() => {
    const timer = setInterval(() => {
      setAutoHideTicker((v) => v + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Verify Pickup State
  const [pickupQuery, setPickupQuery] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedOrder, setVerifiedOrder] = useState(null);
  const [verifyError, setVerifyError] = useState("");

  // Inventory Filter & Sort State
  const [stockSearch, setStockSearch] = useState("");
  const [stockCategory, setStockCategory] = useState("all");
  const [stockSort, setStockSort] = useState("low_first"); // 'low_first', 'name', 'stock_high'
  const [restockInputs, setRestockInputs] = useState({});
  const [exactInputs, setExactInputs] = useState({});
  const [stockActionLoading, setStockActionLoading] = useState({});

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Group orders by status
  const queuedOrders = useMemo(() => orders.filter(o => o.status === "Placed" || o.status === "Accepted"), [orders]);
  const preparingOrders = useMemo(() => orders.filter(o => o.status === "Preparing"), [orders]);
  const readyOrders = useMemo(() => orders.filter(o => o.status === "Ready"), [orders]);
  const cancelledOrders = useMemo(() => {
    void autoHideTicker;
    return orders.filter(o => o.status === "Cancelled" && !isCancelledAutoHidden(o));
  }, [orders, autoHideTicker]);


  // Overall load calculations
  const activeOrdersCount = queuedOrders.length + preparingOrders.length;
  const loadPercentage = Math.min(100, Math.round((activeOrdersCount / kitchenCapacity) * 100));

  // Forward action transition dispatcher
  const handleStatusChange = async (orderId, nextStatus) => {
    setSavingOrderId(orderId);
    sound.playClick();
    try {
      const res = await onUpdateOrderStatus(orderId, nextStatus);
      if (res && res.ok === false) {
        sound.playError?.();
        showToast(res.message || `Failed to transition order to ${nextStatus}.`, "error");
      } else {
        if (nextStatus === "Ready") {
          sound.playReadyBell();
        } else {
          sound.playSuccess();
        }
        // If this order was currently in the pickup verification card, update its status
        if (verifiedOrder && (verifiedOrder.id === orderId || verifiedOrder._uuid === orderId)) {
          setVerifiedOrder(prev => prev ? { ...prev, status: nextStatus } : null);
        }
      }
    } catch (err) {
      showToast(err.message || "Server error occurred while updating order.", "error");
    } finally {
      setSavingOrderId(null);
    }
  };

  // 1-Click Batch Preparation handler
  const handleBatchPrepare = async (batch) => {
    sound.playSuccess();
    for (const id of batch.orderIds) {
      const ord = orders.find(o => o.id === id);
      if (ord && (ord.status === "Placed" || ord.status === "Accepted")) {
        await handleStatusChange(id, "Preparing");
      }
    }
  };

  // Verify Pickup Lookup
  const handleVerifyPickup = async (e) => {
    e?.preventDefault();
    if (!pickupQuery.trim()) return;
    setIsVerifying(true);
    setVerifyError("");
    setVerifiedOrder(null);
    sound.playClick();

    try {
      const res = await CanteenService.verifyPickup(pickupQuery.trim());
      if (res.ok && res.order) {
        setVerifiedOrder(res.order);
      } else {
        setVerifyError(res.message || "Order not found. Please verify the token.");
      }
    } catch (err) {
      setVerifyError(err.message || "Error validating token.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Inventory Summary Stats
  const inventoryStats = useMemo(() => {
    const total = menu.length;
    let low = 0;
    let soldOut = 0;
    menu.forEach((item) => {
      if (item.isActive === false) return;
      if (item.stock === 0) {
        soldOut += 1;
      } else if (item.stock <= 3 || (item.dailyLimit > 0 && item.stock / item.dailyLimit <= 0.2)) {
        low += 1;
      }
    });
    return { total, low, soldOut };
  }, [menu]);

  // Inventory Filter & Sort
  const filteredMenu = useMemo(() => {
    return menu
      .filter((item) => {
        const matchesSearch = item.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
          (item.category && item.category.toLowerCase().includes(stockSearch.toLowerCase()));
        const matchesCategory = stockCategory === "all" || item.category === stockCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (stockSort === "low_first") {
          // Sort sold out and lowest stock first
          return a.stock - b.stock;
        } else if (stockSort === "stock_high") {
          return b.stock - a.stock;
        } else {
          return a.name.localeCompare(b.name);
        }
      });
  }, [menu, stockSearch, stockCategory, stockSort]);

  const allCategories = useMemo(() => {
    const cats = new Set();
    menu.forEach(m => { if (m.category) cats.add(m.category); });
    return Array.from(cats);
  }, [menu]);

  // Stock action handlers
  const handleMarkSoldOut = async (itemId) => {
    setStockActionLoading(prev => ({ ...prev, [itemId]: true }));
    sound.playClick();
    try {
      await onUpdateStock(itemId, 0);
      showToast("Item marked sold out for today (stock set to 0)", "success");
    } catch (err) {
      showToast(err.message || "Failed to mark item sold out", "error");
    } finally {
      setStockActionLoading(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleBackInStock = async (itemId) => {
    setStockActionLoading(prev => ({ ...prev, [itemId]: true }));
    sound.playClick();
    try {
      const res = await CanteenService.restockItem(itemId, 15);
      if (res && res.ok === false) {
        showToast(res.message || "Failed to restore stock", "error");
      } else {
        showToast("Item marked back in stock (+15 added)", "success");
      }
    } catch (err) {
      showToast(err.message || "Failed to restore stock", "error");
    } finally {
      setStockActionLoading(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleToggleAvailability = async (itemId, currentAvailability) => {
    setStockActionLoading(prev => ({ ...prev, [itemId]: true }));
    sound.playClick();
    const newAvail = !currentAvailability;
    try {
      const res = await CanteenService.setItemAvailability(itemId, newAvail);
      if (res && res.ok === false) {
        showToast(res.message || "Failed to update item availability", "error");
      } else {
        showToast(
          newAvail
            ? "Item is now available for ordering"
            : "Item marked Temporarily Unavailable (paused from ordering)",
          "success"
        );
      }
    } catch (err) {
      showToast(err.message || "Failed to update availability", "error");
    } finally {
      setStockActionLoading(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleTypedRestock = async (itemId) => {
    const amount = Number(restockInputs[itemId] || 15);
    if (!amount || amount <= 0) {
      showToast("Please enter a restock quantity greater than 0", "error");
      return;
    }
    setStockActionLoading(prev => ({ ...prev, [itemId]: true }));
    sound.playClick();
    try {
      const res = await CanteenService.restockItem(itemId, amount);
      if (res && res.ok === false) {
        showToast(res.message || "Failed to restock item", "error");
      } else {
        showToast(`Added +${amount} to stock`, "success");
        setRestockInputs(prev => ({ ...prev, [itemId]: "" }));
      }
    } catch (err) {
      showToast(err.message || "Failed to restock item", "error");
    } finally {
      setStockActionLoading(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleSetExact = async (itemId) => {
    const exact = Number(exactInputs[itemId]);
    if (isNaN(exact) || exact < 0) {
      showToast("Please enter a valid stock count (≥ 0)", "error");
      return;
    }
    setStockActionLoading(prev => ({ ...prev, [itemId]: true }));
    sound.playClick();
    try {
      const res = await CanteenService.setItemStock(itemId, exact);
      if (res && res.ok === false) {
        showToast(res.message || "Failed to set exact quantity", "error");
      } else {
        showToast(`Stock set to ${exact}`, "success");
        setExactInputs(prev => ({ ...prev, [itemId]: "" }));
      }
    } catch (err) {
      showToast(err.message || "Failed to set quantity", "error");
    } finally {
      setStockActionLoading(prev => ({ ...prev, [itemId]: false }));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      
      {/* Toast Notification Container */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-20 right-6 z-50 max-w-md p-4 rounded-2xl shadow-2xl border flex items-start gap-3 backdrop-blur-md ${
              toast.type === "error"
                ? "bg-red-950/90 border-red-500/60 text-red-200"
                : "bg-emerald-950/90 border-emerald-500/60 text-emerald-200"
            }`}
          >
            {toast.type === "error" ? (
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            ) : (
              <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs leading-relaxed">{toast.message}</div>
            <button
              onClick={() => setToast(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header & Operational Kitchen Status */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between pb-6 border-b border-white/[0.08] gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ChefHat className="w-4 h-4" />
            </div>
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">
              KITCHEN DISPLAY UNIT (KDU)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Kitchen Command Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Real-time queue balancing, item-level batching, and burner station coordination
          </p>
        </div>

        {/* Live Gauges & Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Workload Gauge */}
          <div className="px-4 py-2 rounded-2xl bg-[#121624] border border-white/10 flex items-center gap-3">
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase font-semibold">STATION WORKLOAD</div>
              <div className="text-sm font-bold text-white font-mono">
                {activeOrdersCount} / {kitchenCapacity} Slots
              </div>
            </div>
            <div className="w-12 h-12 rounded-full border-2 border-white/10 flex items-center justify-center relative font-mono text-xs font-bold text-amber-400">
              <span className="relative z-10">{loadPercentage}%</span>
              <div 
                className="absolute inset-0 rounded-full border-2 border-amber-400"
                style={{ clipPath: `polygon(0 0, 100% 0, 100% ${loadPercentage}%, 0 ${loadPercentage}%)` }}
              />
            </div>
          </div>

          {/* Add Dish Button */}
          {can("dish:add") && (
            <button
              onClick={() => {
                sound.playClick();
                setAddDishModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs sm:text-sm font-extrabold shadow-lg shadow-amber-500/20 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4 text-black" />
              <span>Add Dish</span>
            </button>
          )}

          {/* Quick Stock Management Toggle Button */}
          <button
            onClick={() => {
              sound.playClick();
              setStockDrawerOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#141826] hover:bg-[#1a2034] text-white text-xs sm:text-sm font-semibold border border-white/10 shadow-md transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <span>Manage Stock</span>
            {inventoryStats.low + inventoryStats.soldOut > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-300 border border-red-500/40 font-mono font-bold">
                {inventoryStats.low + inventoryStats.soldOut}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VERIFY PICKUP BOX (Enter or Paste Token / Order ID) */}
      <div className="mt-6 p-4 sm:p-5 rounded-3xl bg-[#0e121d] border border-amber-500/20 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                Verify Counter Pickup
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Instant Handover
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Enter or paste token (e.g. 0001 or CN-0001) or QR payload to verify order at the counter
              </p>
            </div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleVerifyPickup} className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <input
                type="text"
                placeholder="Token # or SC:... payload"
                value={pickupQuery}
                onChange={(e) => setPickupQuery(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141828] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-amber-400 placeholder:text-slate-500"
              />
              {pickupQuery && (
                <button
                  type="button"
                  onClick={() => { setPickupQuery(""); setVerifiedOrder(null); setVerifyError(""); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifying || !pickupQuery.trim()}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-amber-500/20"
            >
              {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Verify</span>
            </button>
          </form>
        </div>

        {/* Verification Result Card */}
        <AnimatePresence>
          {verifyError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{verifyError}</span>
            </motion.div>
          )}

          {verifiedOrder && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="mt-4 p-4 rounded-2xl bg-[#121626] border border-emerald-500/40 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-base font-extrabold text-amber-400">
                    Token #{verifiedOrder.token || verifiedOrder.id?.replace("CN-", "")}
                  </span>
                  <span className="font-mono text-xs bg-white/10 px-2 py-0.5 rounded text-white border border-white/10">
                    {verifiedOrder.id}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-md font-mono font-bold border ${
                    verifiedOrder.status === "Ready"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : verifiedOrder.status === "Collected"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  }`}>
                    {verifiedOrder.status}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Counter: {verifiedOrder.counter || "Counter A"}
                  </span>
                </div>

                <div className="text-xs text-slate-300">
                  Student: <strong className="text-white">{verifiedOrder.student_name || verifiedOrder.studentName || "Student"}</strong> • <span className="font-mono text-slate-300">{verifiedOrder.student_roll || verifiedOrder.studentRoll}</span>
                </div>

                <div className="text-xs text-slate-400 flex items-center gap-3 flex-wrap">
                  <span>Items: {(verifiedOrder.items || []).map(i => `${i.quantity}x ${i.name}`).join(", ")}</span>
                  <span className="font-mono font-bold text-white">Total: ₹{verifiedOrder.total_amount || verifiedOrder.total}</span>
                </div>
              </div>

              {/* Handover Action */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                {verifiedOrder.status !== "Collected" ? (
                  <button
                    onClick={() => handleStatusChange(verifiedOrder._uuid || verifiedOrder.id, "Collected")}
                    disabled={savingOrderId === (verifiedOrder._uuid || verifiedOrder.id)}
                    className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {savingOrderId === (verifiedOrder._uuid || verifiedOrder.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                    ) : (
                      <PackageCheck className="w-4 h-4 text-black stroke-[2.5]" />
                    )}
                    <span>Confirm Handover</span>
                  </button>
                ) : (
                  <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <Check className="w-4 h-4" />
                    <span>Collected & Completed</span>
                  </div>
                )}
                <button
                  onClick={() => setVerifiedOrder(null)}
                  className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-semibold"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Smart Batching Opportunity Alert Banner */}
      {detectedBatches.length > 0 && (
        <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-[#131126] to-[#0e111a] border border-purple-500/30">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-purple-400 fill-purple-400" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-purple-300">
                ACTIVE BATCHING RECOMMENDATION ({detectedBatches.length} Opportunity Available)
              </span>
            </div>
            <span className="text-[11px] font-mono text-purple-300 font-semibold bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
              Saves cooking turnaround time
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {detectedBatches.map((batch) => (
              <div
                key={batch.id}
                className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-white text-sm">
                    {batch.totalQuantity}x {batch.name}
                  </div>
                  <div className="text-xs text-purple-300 font-mono mt-0.5">
                    Across {batch.orderIds.length} orders • Saves ~{batch.timeSavedMinutes}m
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Orders: {batch.orderIds.join(", ")}
                  </div>
                </div>

                <button
                  onClick={() => handleBatchPrepare(batch)}
                  className="px-3 py-2 rounded-lg bg-purple-500 text-white font-bold text-xs hover:bg-purple-400 shrink-0 shadow-md transition-all active:scale-95"
                >
                  Start Batch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kanban Column Grid for Kitchen Statuses */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Column 1: Upcoming & Queued Orders (Placed & Accepted) */}
        <div className="flex flex-col rounded-3xl bg-[#0c0f18] border border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="font-bold text-base text-white">Upcoming / Queued</h2>
            </div>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white/[0.06] text-amber-300 border border-white/10">
              {queuedOrders.length}
            </span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto">
            {queuedOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No new pending orders in queue
              </div>
            ) : (
              queuedOrders.map((order) => {
                const isPlaced = order.status === "Placed";
                const isSaving = savingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="p-4 rounded-2xl bg-[#131624] border border-white/[0.08] hover:border-amber-500/40 transition-all shadow-md"
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-white text-sm bg-black/40 px-2 py-0.5 rounded border border-white/10">
                          {order.id}
                        </span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                          isPlaced ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                        DEADLINE: {order.promisedPickupTime}
                      </span>
                    </div>

                    {/* Student & Token */}
                    <div className="flex justify-between items-center text-xs text-slate-400 font-mono mb-3">
                      <span>{order.studentName} • <strong className="text-slate-300">{order.studentRoll}</strong></span>
                      <span className="text-amber-400 font-bold">Token #{order.token}</span>
                    </div>

                    {/* Items */}
                    <div className="space-y-1.5 py-2 border-y border-white/[0.06] my-2">
                      {order.items.map((it, i) => (
                        <div key={i} className="flex justify-between text-xs font-medium">
                          <span className="text-slate-200">
                            <strong className="text-amber-400 font-mono">{it.quantity}x</strong> {it.name}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">{it.prepTimeMinutes}m</span>
                        </div>
                      ))}
                    </div>

                    {/* Instructions */}
                    {order.instructions && order.instructions !== "None" && (
                      <div className="text-[11px] text-amber-300/90 italic mb-3">
                        Note: "{order.instructions}"
                      </div>
                    )}

                    {/* Next Action Button: Placed -> Accept, Accepted -> Start Cooking */}
                    {isPlaced ? (
                      <button
                        onClick={() => handleStatusChange(order.id, "Accepted")}
                        disabled={isSaving}
                        className="w-full mt-2 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{isSaving ? "Accepting…" : "Accept Order"}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(order.id, "Preparing")}
                        disabled={isSaving}
                        className="w-full mt-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                        ) : (
                          <Flame className="w-3.5 h-3.5 fill-black" />
                        )}
                        <span>{isSaving ? "Starting…" : "Start Cooking"}</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 2: In Cooking / Preparation (Preparing -> Mark Ready) */}
        <div className="flex flex-col rounded-3xl bg-[#0c0f18] border border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              <h2 className="font-bold text-base text-white">In Cooking / Preparation</h2>
            </div>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white/[0.06] text-cyan-300 border border-white/10">
              {preparingOrders.length}
            </span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto">
            {preparingOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No active cooking right now
              </div>
            ) : (
              preparingOrders.map((order) => {
                const isSaving = savingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="p-4 rounded-2xl bg-[#121828] border border-cyan-500/40 hover:border-cyan-400 transition-all shadow-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-white text-sm bg-black/40 px-2 py-0.5 rounded border border-white/10">
                        {order.id}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                        COOKING NOW
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-400 font-mono mb-3">
                      <span>{order.studentName} • <strong className="text-slate-300">{order.studentRoll}</strong></span>
                      <span className="text-cyan-400 font-bold">Token #{order.token}</span>
                    </div>

                    <div className="space-y-1.5 py-2 border-y border-white/[0.06] my-2">
                      {order.items.map((it, i) => (
                        <div key={i} className="flex justify-between text-xs font-medium">
                          <span className="text-white">
                            <strong className="text-cyan-400 font-mono">{it.quantity}x</strong> {it.name}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">{it.prepTimeMinutes}m</span>
                        </div>
                      ))}
                    </div>

                    {order.instructions && order.instructions !== "None" && (
                      <div className="text-[11px] text-cyan-200/90 italic mb-3">
                        Note: "{order.instructions}"
                      </div>
                    )}

                    {/* Preparing -> Mark Ready */}
                    <button
                      onClick={() => handleStatusChange(order.id, "Ready")}
                      disabled={isSaving}
                      className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                      )}
                      <span>{isSaving ? "Marking Ready…" : "Mark Ready"}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3: Ready for Pickup (Ready -> Confirm Handover) */}
        <div className="flex flex-col rounded-3xl bg-[#0c0f18] border border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <h2 className="font-bold text-base text-white">Ready for Pickup</h2>
            </div>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              {readyOrders.length}
            </span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto">
            {readyOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No orders waiting at counter
              </div>
            ) : (
              readyOrders.map((order) => {
                const isSaving = savingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="p-4 rounded-2xl bg-[#0d1e15] border border-emerald-500/50 hover:border-emerald-400 transition-all shadow-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-white text-sm bg-black/40 px-2 py-0.5 rounded border border-white/10">
                        {order.id}
                      </span>
                      <span className="font-mono font-extrabold text-emerald-400 text-sm">
                        #{order.token}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 mb-2">
                      Student: <strong className="text-white">{order.studentName}</strong> • <span className="font-mono text-slate-300">{order.studentRoll}</span>
                    </div>

                    <div className="text-xs font-mono text-emerald-300 bg-emerald-950/60 p-2 rounded-lg border border-emerald-500/30 mb-3">
                      Placed at: {order.counter}
                    </div>

                    {/* Ready -> Confirm Handover */}
                    <button
                      onClick={() => handleStatusChange(order.id, "Collected")}
                      disabled={isSaving}
                      className="w-full py-2.5 rounded-xl bg-white/[0.1] hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/10 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      ) : (
                        <PackageCheck className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>{isSaving ? "Confirming…" : "Confirm Handover"}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Cancelled Orders (summary) */}
      {cancelledOrders.length > 0 && (
        <div className="mt-6 p-4 rounded-2xl bg-[#0c0f18] border border-red-500/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <h2 className="font-bold text-sm text-slate-300">Cancelled Orders ({cancelledOrders.length})</h2>
          </div>
          <div className="space-y-2">
            {cancelledOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between text-xs text-slate-400 font-mono p-2 rounded-lg bg-white/[0.03]">
                <span className="font-bold text-red-400">{order.id}</span>
                <span>{order.studentName}</span>
                <span className="text-[11px]">{order.cancelledDuringPrep ? "During prep (no restock)" : "Cancelled"}</span>
                <span className="text-slate-500">{order.cancelReason || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KITCHEN INVENTORY REDESIGN MODAL (MANAGE STOCK) */}
      <AnimatePresence>
        {stockDrawerOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStockDrawerOpen(false)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />

            <div className="min-h-full flex items-center justify-center p-3 sm:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="relative w-full max-w-4xl bg-[#0e111a] border border-white/10 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[90vh]"
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                      <SlidersHorizontal className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-lg sm:text-xl">
                        Manage Kitchen Stock & Quotas
                      </h3>
                      <p className="text-xs text-slate-400">
                        Real-time stock controls, typed restocks, and daily limit tracking
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStockDrawerOpen(false)}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Summary Header Metrics */}
                <div className="grid grid-cols-3 gap-3 my-4">
                  <div className="p-3 rounded-2xl bg-[#131625] border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-slate-400 uppercase font-semibold">TOTAL DISHES</div>
                    <div className="text-xl font-bold font-mono text-white mt-0.5">{inventoryStats.total}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#131625] border border-amber-500/30">
                    <div className="text-[10px] font-mono text-amber-300 uppercase font-semibold">LOW STOCK (≤20%)</div>
                    <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">{inventoryStats.low}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#131625] border border-red-500/30">
                    <div className="text-[10px] font-mono text-red-300 uppercase font-semibold">SOLD OUT</div>
                    <div className="text-xl font-bold font-mono text-red-400 mt-0.5">{inventoryStats.soldOut}</div>
                  </div>
                </div>

                {/* Filters, Search & Sort Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search dish name or category…"
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#141828] border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400 placeholder:text-slate-500"
                    />
                  </div>

                  {/* Category Filter */}
                  <select
                    value={stockCategory}
                    onChange={(e) => setStockCategory(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#141828] border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400"
                  >
                    <option value="all">All Categories</option>
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {/* Sort Filter */}
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141828] border border-white/10 text-white text-xs">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={stockSort}
                      onChange={(e) => setStockSort(e.target.value)}
                      className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="low_first" className="bg-[#141828]">Low Stock First</option>
                      <option value="stock_high" className="bg-[#141828]">High Stock First</option>
                      <option value="name" className="bg-[#141828]">Name (A-Z)</option>
                    </select>
                  </div>
                </div>

                {/* Scrollable Inventory Items List */}
                <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1">
                  {filteredMenu.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No matching menu items found.
                    </div>
                  ) : (
                    filteredMenu.map((item) => {
                      const isArchived = item.isActive === false;
                      const isSoldOut = !isArchived && item.stock === 0;
                      const isLow = !isArchived && item.stock > 0 && (item.stock <= 3 || (item.dailyLimit > 0 && item.stock / item.dailyLimit <= 0.2));
                      const isQuickPrep = (item.prepTimeMinutes || 0) <= QUICK_PREP_MAX_MINUTES;
                      const dailyLimit = item.dailyLimit || 1;
                      const stockPercent = Math.min(100, Math.round((item.stock / dailyLimit) * 100));
                      const isLoading = stockActionLoading[item.id] || false;

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                            isArchived
                              ? "bg-[#10121a]/80 border-white/[0.04] opacity-70"
                              : isSoldOut
                              ? "bg-red-950/10 border-red-500/30"
                              : isLow
                              ? "bg-amber-950/10 border-amber-500/30"
                              : "bg-[#121625] border-white/[0.06]"
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                            
                            {/* Left: Dish Info */}
                            <div className="flex items-center gap-3.5 flex-1 min-w-0">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-12 h-12 rounded-xl object-cover bg-slate-800 shrink-0 border border-white/10"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-white text-sm truncate">{item.name}</h4>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
                                    {item.category}
                                  </span>

                                  {/* Quick Prep Badge */}
                                  {isQuickPrep && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                                      <Zap className="w-3 h-3 text-emerald-400" />
                                      Quick Prep (≤{QUICK_PREP_MAX_MINUTES}m)
                                    </span>
                                  )}

                                  {/* Status Chip */}
                                  {isArchived ? (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold">
                                      Archived
                                    </span>
                                  ) : item.isAvailable === false ? (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                      Temporarily Unavailable
                                    </span>
                                  ) : isSoldOut ? (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold">
                                      Sold out
                                    </span>
                                  ) : isLow ? (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                      Low Stock
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                                      In Stock
                                    </span>
                                  )}
                                </div>

                                {/* Stock progress bar & metrics */}
                                <div className="mt-2 flex items-center gap-3">
                                  <div className="w-32 sm:w-44 bg-white/10 h-2 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isSoldOut ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-emerald-500"
                                      }`}
                                      style={{ width: `${stockPercent}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-mono font-bold text-white">
                                    {item.stock} / {item.dailyLimit} limit ({stockPercent}%)
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-mono">
                                    ⏱ {item.prepTimeMinutes}m prep
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto justify-end">
                              {!isArchived && (
                                <>
                                  {/* Availability State 1: Sold out for today vs Back in stock */}
                                  {item.stock > 0 ? (
                                    <div className="relative group">
                                      <button
                                        onClick={() => handleMarkSoldOut(item.id)}
                                        disabled={isLoading}
                                        className="px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-500/40 text-xs font-bold transition-all disabled:opacity-50"
                                      >
                                        Mark sold out
                                      </button>
                                      {/* Info Tooltip */}
                                      <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 bg-black/95 text-slate-300 text-[10px] px-2 py-1 rounded shadow-lg border border-white/10 whitespace-nowrap z-30">
                                        <Info className="w-3 h-3 text-red-400" />
                                        Sold out for today: sets stock to 0
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="relative group">
                                      <button
                                        onClick={() => handleBackInStock(item.id)}
                                        disabled={isLoading}
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all disabled:opacity-50"
                                      >
                                        Back in stock
                                      </button>
                                      {/* Info Tooltip */}
                                      <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 bg-black/95 text-slate-300 text-[10px] px-2 py-1 rounded shadow-lg border border-white/10 whitespace-nowrap z-30">
                                        <Info className="w-3 h-3 text-emerald-400" />
                                        Back in stock: restores stock to +15
                                      </div>
                                    </div>
                                  )}

                                  {/* Availability State 2: Temporarily unavailable (paused, stock preserved) */}
                                  <div className="relative group">
                                    <button
                                      onClick={() => handleToggleAvailability(item.id, item.isAvailable !== false)}
                                      disabled={isLoading}
                                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1 ${
                                        item.isAvailable === false
                                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                                          : "bg-slate-800/80 text-slate-300 border-white/10 hover:bg-slate-700/80"
                                      }`}
                                    >
                                      {item.isAvailable === false ? (
                                        <>
                                          <Play className="w-3 h-3 text-amber-400 fill-amber-400" />
                                          <span>Resume</span>
                                        </>
                                      ) : (
                                        <>
                                          <Pause className="w-3 h-3 text-slate-400" />
                                          <span>Pause</span>
                                        </>
                                      )}
                                    </button>
                                    {/* Info Tooltip */}
                                    <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 bg-black/95 text-slate-300 text-[10px] px-2.5 py-1 rounded shadow-lg border border-white/10 whitespace-nowrap z-30">
                                      <Info className="w-3 h-3 text-amber-400" />
                                      {item.isAvailable === false
                                        ? "Currently paused. Click to make available for ordering again."
                                        : "Temporarily unavailable: Pauses ordering & hides item while preserving stock count."}
                                    </div>
                                  </div>

                                  {/* Restock by typed amount */}
                                  <div className="flex items-center gap-1 bg-[#151928] p-1 rounded-xl border border-white/10">
                                    <input
                                      type="number"
                                      min="1"
                                      placeholder="+15"
                                      value={restockInputs[item.id] ?? ""}
                                      onChange={(e) => setRestockInputs({ ...restockInputs, [item.id]: e.target.value })}
                                      className="w-14 px-2 py-1 rounded-lg bg-black/40 text-white font-mono text-xs border border-white/10 focus:outline-none focus:border-amber-400 text-center"
                                    />
                                    <button
                                      onClick={() => handleTypedRestock(item.id)}
                                      disabled={isLoading}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold transition-all disabled:opacity-50 shadow-sm"
                                    >
                                      +Restock
                                    </button>
                                  </div>

                                  {/* Set exact quantity */}
                                  <div className="flex items-center gap-1 bg-[#151928] p-1 rounded-xl border border-white/10">
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="Qty"
                                      value={exactInputs[item.id] ?? ""}
                                      onChange={(e) => setExactInputs({ ...exactInputs, [item.id]: e.target.value })}
                                      className="w-14 px-2 py-1 rounded-lg bg-black/40 text-white font-mono text-xs border border-white/10 focus:outline-none focus:border-cyan-400 text-center"
                                    />
                                    <button
                                      onClick={() => handleSetExact(item.id)}
                                      disabled={isLoading}
                                      className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-extrabold transition-all disabled:opacity-50 shadow-sm"
                                    >
                                      Set
                                    </button>
                                  </div>
                                </>
                              )}

                              {/* Manager-only Archive / Unarchive */}
                              {can("dish:archive") && (
                                isArchived ? (
                                  <button
                                    onClick={async () => {
                                      sound.playClick();
                                      if (onUnarchiveItem) await onUnarchiveItem(item.id);
                                    }}
                                    className="px-2 py-1.5 rounded-lg bg-blue-950/60 border border-blue-500/40 text-blue-300 hover:bg-blue-900/60 text-xs font-semibold flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Unarchive</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      sound.playClick();
                                      if (onArchiveItem) await onArchiveItem(item.id);
                                    }}
                                    className="px-2 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-600/50 text-zinc-300 hover:bg-zinc-700/80 text-xs font-semibold flex items-center gap-1"
                                  >
                                    <Archive className="w-3 h-3" />
                                    <span>Archive</span>
                                  </button>
                                )
                              )}
                            </div>

                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                  <div className="text-xs text-slate-400 font-mono">
                    Changes broadcast to student terminals in real-time.
                  </div>
                  <button
                    onClick={() => setStockDrawerOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 text-black font-extrabold text-xs hover:bg-amber-400 shadow-md shadow-amber-500/20"
                  >
                    Done Managing
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Dish Modal */}
      <AddDishModal
        isOpen={addDishModalOpen}
        onClose={() => setAddDishModalOpen(false)}
        onAddDish={onAddDish}
        existingMenu={menu}
      />

    </div>
  );
}
