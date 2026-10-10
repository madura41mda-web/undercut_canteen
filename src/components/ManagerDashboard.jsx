import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  TrendingUp, 
  Clock, 
  DollarSign, 
  Sliders, 
  ShieldCheck, 
  Edit3, 
  X, 
  CheckCircle, 
  Calendar, 
  Archive, 
  RotateCcw, 
  AlertTriangle,
  FileCheck2,
  ChevronDown,
  ChevronUp,
  XCircle,
  Timer,
  Check,
  Wifi,
  WifiOff,
  Activity,
  RefreshCw,
  History,
  Search
} from "lucide-react";
import { sound } from "../utils/audio";

export default function ManagerDashboard({
  menu = [],
  orders = [],
  settings = {},
  onUpdateSettings,
  onUpdateMenuItem,
  onArchiveItem,
  onUnarchiveItem,
  onApproveOrder,
  onRejectOrder,
  realtimeStatus = "connected",
  lastUpdatedFormatted = "",
  onForceRefresh
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [capacity, setCapacity] = useState(settings.maxKitchenCapacity || 12);
  const [rushMultiplier, setRushMultiplier] = useState(settings.rushMultiplier || 1.25);
  const [pendingExpiryMinutes, setPendingExpiryMinutes] = useState(settings.pendingExpiryMinutes || 10);
  const [counterApprover, setCounterApprover] = useState(settings.counterApprover || "manager");
  
  const [isDiagnosticsExpanded, setIsDiagnosticsExpanded] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [savedSettingsNotice, setSavedSettingsNotice] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [editError, setEditError] = useState("");
  
  // Rejection modal / prompt state
  const [rejectModalOrder, setRejectModalOrder] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState({});

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }, []);

  const formatTimestamp = (ts) => {
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: settings.timezone || "Asia/Kolkata",
      });
    } catch {
      return new Date(ts).toLocaleTimeString();
    }
  };

  // 1. Approvals Inbox: Orders in 'pending_approval' status
  const pendingOrders = useMemo(() => {
    return orders.filter((o) => o.status === "pending_approval");
  }, [orders]);

  // 2. Real Today's Computed Numbers
  const todayOrders = useMemo(() => {
    return orders.filter((o) => !["Cancelled", "Rejected", "Expired"].includes(o.status));
  }, [orders]);

  // 3. Filtered orders for Order History (Today)
  const filteredHistoryOrders = useMemo(() => {
    return orders.filter((o) => {
      if (historyFilter === "active" && !["Placed", "Accepted", "Preparing", "Ready", "pending_approval"].includes(o.status)) {
        return false;
      }
      if (historyFilter === "collected" && o.status !== "Collected") {
        return false;
      }
      if (historyFilter === "cancelled" && !["Cancelled", "Rejected", "Expired"].includes(o.status)) {
        return false;
      }

      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const matchesName = o.studentName?.toLowerCase().includes(q);
        const matchesUSN = o.studentUSN?.toLowerCase().includes(q);
        const matchesCode = o.pickupCode?.toLowerCase().includes(q);
        const matchesId = o.id?.toLowerCase().includes(q);
        return matchesName || matchesUSN || matchesCode || matchesId;
      }

      return true;
    });
  }, [orders, historyFilter, historySearch]);

  const totalRevenue = useMemo(() => {
    return todayOrders.reduce((sum, o) => {
      // Don't count pending_approval as recognized revenue yet
      if (o.status === "pending_approval") return sum;
      return sum + (o.totalAmount || 0);
    }, 0);
  }, [todayOrders]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => ["Placed", "Accepted", "Preparing", "Ready"].includes(o.status));
  }, [orders]);

  const avgActualPrepTime = useMemo(() => {
    const fulfilled = orders.filter((o) => o.status === "Collected" || o.status === "Ready");
    if (fulfilled.length === 0) {
      if (todayOrders.length === 0) return "—";
      const totalEstimated = todayOrders.reduce((acc, o) => {
        const orderMax = o.items?.length ? Math.max(...o.items.map((i) => i.prepTimeMinutes || 0)) : 8;
        return acc + orderMax;
      }, 0);
      return Math.round(totalEstimated / todayOrders.length) + " mins";
    }
    const totalPrep = fulfilled.reduce((acc, o) => {
      const orderMax = o.items?.length ? Math.max(...o.items.map((i) => i.prepTimeMinutes || 0)) : 8;
      return acc + orderMax;
    }, 0);
    return Math.round(totalPrep / fulfilled.length) + " mins";
  }, [orders, todayOrders]);

  // Handle Approve
  const handleApprove = async (orderId) => {
    setActionLoading((prev) => ({ ...prev, [orderId]: true }));
    sound.playClick();
    if (onApproveOrder) {
      const res = await onApproveOrder(orderId);
      if (res && res.ok !== false) {
        sound.playSuccess();
      }
    }
    setActionLoading((prev) => ({ ...prev, [orderId]: false }));
  };

  // Handle Reject
  const handleConfirmReject = async () => {
    if (!rejectModalOrder) return;
    const orderId = rejectModalOrder.id;
    setActionLoading((prev) => ({ ...prev, [orderId]: true }));
    sound.playClick();
    if (onRejectOrder) {
      await onRejectOrder(orderId, rejectReason.trim() || "Rejected by manager at counter");
    }
    setActionLoading((prev) => ({ ...prev, [orderId]: false }));
    setRejectModalOrder(null);
    setRejectReason("");
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    sound.playSuccess();
    await onUpdateSettings({
      maxKitchenCapacity: Number(capacity),
      rushMultiplier: Number(rushMultiplier),
      pendingExpiryMinutes: Number(pendingExpiryMinutes),
      counterApprover: String(counterApprover)
    });
    setIsSavingSettings(false);
    setSavedSettingsNotice(true);
    setTimeout(() => setSavedSettingsNotice(false), 2500);
  };

  const handleSaveItemEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    setEditError("");

    if (!editingItem.price || editingItem.price <= 0 || editingItem.price > 5000) {
      setEditError("Price must be greater than ₹0 and at most ₹5000.");
      return;
    }
    if (!editingItem.prepTimeMinutes || editingItem.prepTimeMinutes < 1 || editingItem.prepTimeMinutes > 30) {
      setEditError("Prep time must be between 1 and 30 minutes.");
      return;
    }
    if (editingItem.dailyLimit == null || editingItem.dailyLimit < 0 || editingItem.dailyLimit > 500) {
      setEditError("Daily limit must be between 0 and 500.");
      return;
    }
    if (editingItem.stock < 0) {
      setEditError("Stock count cannot be negative.");
      return;
    }

    const clampedStock = Math.min(editingItem.stock, editingItem.dailyLimit);

    setIsSavingItem(true);
    sound.playClick();
    const res = await onUpdateMenuItem({
      ...editingItem,
      stock: clampedStock,
    });
    setIsSavingItem(false);

    if (res && res.ok === false) {
      setEditError(res.message || res.error || "Failed to update item.");
      sound.playError();
    } else {
      sound.playSuccess();
      setEditingItem(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-white/[0.08] gap-4">
        <div>
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">
            OPERATIONS & CANTEEN CONTROL
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Manager Executive Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Pay-at-counter order approvals, real-time metrics, capacity rules, and menu quotas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121624] border border-white/10 text-xs text-slate-300 font-mono">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Today: {todayFormatted}</span>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          0. LIVE CONNECTIVITY & SYNC DIAGNOSTICS (Manager Only, Collapsed)
      ──────────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-[#0b0e17] border border-white/[0.08] overflow-hidden">
        <div 
          onClick={() => {
            sound.playClick();
            setIsDiagnosticsExpanded(!isDiagnosticsExpanded);
          }}
          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors gap-3"
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              realtimeStatus === "connected"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : realtimeStatus === "reconnecting"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "bg-red-500/20 text-red-300 border border-red-500/30"
            }`}>
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-wide uppercase">
                  Realtime Connectivity & Diagnostics
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                  realtimeStatus === "connected"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : realtimeStatus === "reconnecting"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-red-500/20 text-red-300 border border-red-500/40"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    realtimeStatus === "connected" ? "bg-emerald-400 animate-pulse" : realtimeStatus === "reconnecting" ? "bg-amber-400" : "bg-red-400"
                  }`} />
                  {realtimeStatus === "connected" ? "Live WebSocket" : realtimeStatus === "reconnecting" ? "Fallback Polling (5s)" : "Offline"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Channel: <span className="font-mono text-slate-300">canteen-live-sync</span> • Last refresh: <span className="font-mono text-amber-400">{lastUpdatedFormatted || "Syncing…"}</span> • Pending counter: <span className="font-mono text-white font-bold">{pendingOrders.length}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="text-xs text-slate-400 font-mono">
              {isDiagnosticsExpanded ? "Hide Details" : "Inspect Diagnostics"}
            </span>
            <div className="p-1 rounded-lg bg-white/[0.05] text-slate-300">
              {isDiagnosticsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isDiagnosticsExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="p-5 border-t border-white/[0.06] bg-black/20 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#121522] border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Transport Status</span>
                  <div className="text-xs font-bold text-white mt-1 flex items-center gap-1.5">
                    {realtimeStatus === "connected" ? (
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>{realtimeStatus === "connected" ? "Subscribed (WebSocket)" : "Polling Fallback (5s)"}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Automatic backoff & retry on reconnect</p>
                </div>

                <div className="p-3 rounded-xl bg-[#121522] border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Last Refresh Time</span>
                  <div className="text-xs font-bold text-amber-300 font-mono mt-1">
                    {lastUpdatedFormatted || "Syncing…"}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Timezone: {settings.timezone || "Asia/Kolkata"}</p>
                </div>

                <div className="p-3 rounded-xl bg-[#121522] border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Pending Counter Approvals</span>
                  <div className="text-xs font-bold text-white font-mono mt-1">
                    {pendingOrders.length} order{pendingOrders.length === 1 ? "" : "s"}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Auto-expires after {settings.pendingExpiryMinutes || 10}m</p>
                </div>

                <div className="p-3 rounded-xl bg-[#121522] border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Campus Wi-Fi Resiliency</span>
                  <div className="text-xs font-bold text-emerald-400 mt-1">
                    Listeners Active
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">5s ticker + tab visibility + window focus</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between pt-2 border-t border-white/[0.04] gap-2">
                <span className="text-[11px] text-slate-400 font-mono">
                  Realtime publication: orders, order_items, menu_items, kitchen_settings
                </span>
                {onForceRefresh && (
                  <button
                    onClick={async () => {
                      sound.playClick();
                      setIsRefreshing(true);
                      await onForceRefresh();
                      setTimeout(() => setIsRefreshing(false), 500);
                    }}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-200 text-xs font-mono font-semibold border border-white/10 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-amber-400" : ""}`} />
                    <span>{isRefreshing ? "Refetching Data…" : "Trigger Instant Sync"}</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ────────────────────────────────────────────────────────────────────
          1. TOP: APPROVALS INBOX (Pay-at-Counter Orders)
      ──────────────────────────────────────────────────────────────────── */}
      <section className="p-6 rounded-3xl bg-[#0e111a] border border-amber-500/30 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Counter Payment Approvals Inbox</span>
                {pendingOrders.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-extrabold bg-amber-500 text-black animate-pulse">
                    {pendingOrders.length} PENDING
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Review cash payments at counter before releasing orders into the kitchen queue
              </p>
            </div>
          </div>

          <span className="text-xs font-mono text-slate-400">
            Auto-expires in {settings.pendingExpiryMinutes || 10}m
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="py-10 text-center">
            <ShieldCheck className="w-12 h-12 text-emerald-400/60 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-white">Approvals Inbox is Clear</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              No orders waiting for counter payment confirmation right now. New Pay-at-Counter orders will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {pendingOrders.map((ord) => {
              const itemsList = (ord.items || []).map((it) => `${it.quantity}x ${it.name}`).join(", ");
              const minutesWaiting = ord.placedAt 
                ? Math.max(0, Math.floor((Date.now() - new Date(ord.placedAt).getTime()) / 60000))
                : 0;
              const isLoading = actionLoading[ord.id];

              return (
                <div
                  key={ord.id}
                  className="p-4 rounded-2xl bg-[#141826] border border-amber-500/40 hover:border-amber-400 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-base font-extrabold text-amber-400 bg-black/40 px-2.5 py-0.5 rounded-md border border-white/10">
                        {ord.id}
                      </span>
                      <span className="font-mono text-xs text-slate-300 font-bold">
                        {ord.studentRoll}
                      </span>
                      {ord.studentName && ord.studentName !== "Student" && (
                        <span className="text-xs text-slate-400 font-medium">
                          • {ord.studentName}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {minutesWaiting}m waiting
                      </span>
                    </div>

                    <div className="text-xs text-slate-200 truncate font-medium" title={itemsList}>
                      Items: <strong className="text-white">{itemsList || "1x Meal"}</strong>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                      <span>Total Amount: <strong className="text-emerald-400 text-sm">₹{ord.totalAmount}</strong></span>
                      <span>Payment: Counter Cash</span>
                      {ord.counter && <span>Counter: {ord.counter}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
                    <button
                      onClick={() => handleApprove(ord.id)}
                      disabled={isLoading}
                      className="flex-1 lg:flex-none px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Approve</span>
                    </button>

                    <button
                      onClick={() => {
                        setRejectModalOrder(ord);
                        setRejectReason("");
                      }}
                      disabled={isLoading}
                      className="flex-1 lg:flex-none px-4 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-500/40 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ────────────────────────────────────────────────────────────────────
          2. NEXT: TODAY'S NUMBERS (Computed Real Data Only)
      ──────────────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Today's Real-Time Metrics</h2>
          <span className="text-xs text-slate-400 font-mono">Live dynamic computations</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Orders Today */}
          <div className="p-5 rounded-2xl bg-[#0e121d] border border-white/[0.08] hover:border-amber-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase font-semibold">ORDERS TODAY</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-3">
              {todayOrders.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Active & fulfilled orders
            </div>
          </div>

          {/* Metric 2: Today's Revenue */}
          <div className="p-5 rounded-2xl bg-[#0e121d] border border-white/[0.08] hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase font-semibold">TODAY'S REVENUE</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-3">
              ₹{totalRevenue}
            </div>
            <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Confirmed payment volume</span>
            </div>
          </div>

          {/* Metric 3: Active Queue */}
          <div className="p-5 rounded-2xl bg-[#0e121d] border border-white/[0.08] hover:border-cyan-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase font-semibold">ACTIVE QUEUE</span>
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-3">
              {activeOrders.length}
            </div>
            <div className="text-xs text-cyan-400 mt-1">
              Capacity: {settings.maxKitchenCapacity || 12} slots
            </div>
          </div>

          {/* Metric 4: Average Prep Time */}
          <div className="p-5 rounded-2xl bg-[#0e121d] border border-white/[0.08] hover:border-purple-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 uppercase font-semibold">AVG PREP TIME</span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Timer className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-3">
              {avgActualPrepTime}
            </div>
            <div className="text-xs text-purple-300 mt-1">
              Computed from order batch timings
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────
          3. THEN: KITCHEN SETTINGS & COUNTER APPROVAL RULES
      ──────────────────────────────────────────────────────────────────── */}
      <section className="p-6 rounded-3xl bg-[#0e111a] border border-white/[0.08]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">Kitchen Settings & Counter Rules</h2>
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase">POLICY CONFIGURATION</span>
        </div>
        <p className="text-xs text-slate-400 mb-6">
          Tune concurrent cooking capacity thresholds, rush hour buffers, counter payment timeout expiry, and role verification permissions.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Setting 1: Max Concurrent Capacity */}
          <div className="space-y-2 p-4 rounded-2xl bg-[#131625] border border-white/[0.06]">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-200 font-semibold">Concurrent Kitchen Order Capacity</label>
              <span className="font-mono text-amber-400 font-bold text-sm">{capacity} slots</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Maximum active cooking orders before the pickup scheduler automatically shifts subsequent orders to later time slots.
            </p>
          </div>

          {/* Setting 2: Rush Hour Multiplier */}
          <div className="space-y-2 p-4 rounded-2xl bg-[#131625] border border-white/[0.06]">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-200 font-semibold">Rush Hour Turnaround Multiplier</label>
              <span className="font-mono text-cyan-400 font-bold text-sm">{rushMultiplier}x</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="2.0"
              step="0.05"
              value={rushMultiplier}
              onChange={(e) => setRushMultiplier(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Multiplies preparation duration estimates during peak lunch rush periods to guarantee promised counter pickup accuracy.
            </p>
          </div>

          {/* Setting 3: Pending Order Auto-Expiry */}
          <div className="space-y-2 p-4 rounded-2xl bg-[#131625] border border-white/[0.06]">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-200 font-semibold">Pending Counter Payment Timeout</label>
              <span className="font-mono text-amber-400 font-bold text-sm">{pendingExpiryMinutes} Mins</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              value={pendingExpiryMinutes}
              onChange={(e) => setPendingExpiryMinutes(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Unpaid counter orders automatically cancel after this duration, restoring all reserved dish quantities to the active menu.
            </p>
          </div>

          {/* Setting 4: Counter Approver Role */}
          <div className="space-y-2 p-4 rounded-2xl bg-[#131625] border border-white/[0.06]">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-200 font-semibold">Counter Approver Authority</label>
              <span className="font-mono text-purple-400 font-bold text-xs uppercase">{counterApprover}</span>
            </div>
            <select
              value={counterApprover}
              onChange={(e) => setCounterApprover(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0f121d] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-400"
            >
              <option value="manager">Manager Only (Strict segregation)</option>
              <option value="kitchen_or_manager">Kitchen Staff or Manager (Flexible counter)</option>
            </select>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Specifies whether only Managers or both Kitchen Staff and Managers can approve Pay-at-Counter cash orders.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          {savedSettingsNotice ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-semibold">
              <CheckCircle className="w-4 h-4" />
              Settings updated live on Supabase backend!
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              Changes take effect immediately across all student carts and kitchen displays.
            </span>
          )}

          <button
            onClick={handleSaveSettings}
            disabled={isSavingSettings}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold shadow-md shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {isSavingSettings ? "Saving Settings…" : "Save Settings"}
          </button>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────
          4. ORDER HISTORY (TODAY) (Manager Audit Trail, Collapsed by Default)
      ──────────────────────────────────────────────────────────────────── */}
      <section className="p-6 rounded-3xl bg-[#0e111a] border border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Order History (Today)</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-white/[0.06] text-purple-300 border border-purple-500/30">
                  {orders.length} TOTAL
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Audited ledger of today's orders including cancelled and expired items (never purged)
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              setIsHistoryExpanded(!isHistoryExpanded);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#141826] hover:bg-[#1a2034] text-slate-200 text-xs font-semibold border border-white/10 transition-colors shrink-0"
          >
            <span>{isHistoryExpanded ? "Collapse History" : `Expand History (${orders.length} orders)`}</span>
            {isHistoryExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Expandable Order History Table */}
        <AnimatePresence>
          {isHistoryExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-4 border-t border-white/[0.06] overflow-hidden space-y-4"
            >
              {/* Audit notice banner */}
              <div className="p-3 rounded-2xl bg-purple-950/20 border border-purple-500/20 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <p className="text-xs text-purple-200/90 leading-relaxed">
                  <span className="font-bold">Permanent Audit Trail:</span> Cancelled, rejected, and expired orders are automatically hidden from student live tracking and the kitchen cooking queue 5 minutes after cancellation, but are retained here indefinitely for manager audits and financial reconciliations.
                </p>
              </div>

              {/* Filters and search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: "all", label: `All (${orders.length})` },
                    { id: "active", label: `Active (${activeOrders.length})` },
                    { id: "collected", label: `Collected (${orders.filter((o) => o.status === "Collected").length})` },
                    { id: "cancelled", label: `Cancelled/Rejected (${orders.filter((o) => ["Cancelled", "Rejected", "Expired"].includes(o.status)).length})` },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => {
                        sound.playClick();
                        setHistoryFilter(filter.id);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                        historyFilter === filter.id
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                          : "bg-white/[0.04] text-slate-400 hover:text-slate-200 border border-white/[0.06]"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search by name, USN, token…"
                    className="w-full sm:w-64 pl-8 pr-3 py-1.5 rounded-xl bg-[#141826] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
                  />
                  {historySearch && (
                    <button
                      onClick={() => setHistorySearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Orders Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-slate-400 font-mono uppercase tracking-wider">
                      <th className="py-3 px-3">Order / Token</th>
                      <th className="py-3 px-3">Student</th>
                      <th className="py-3 px-3">Items</th>
                      <th className="py-3 px-3">Payment</th>
                      <th className="py-3 px-3">Placed At</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredHistoryOrders.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-8 text-center text-slate-500 font-mono">
                          No orders matched the current filter or search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredHistoryOrders.map((order) => {
                        const isCancelled = ["Cancelled", "Rejected", "Expired"].includes(order.status);
                        const statusColors = {
                          pending_approval: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
                          Placed: "bg-amber-500/20 text-amber-300 border-amber-500/30",
                          Accepted: "bg-blue-500/20 text-blue-300 border-blue-500/30",
                          Preparing: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
                          Ready: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 animate-pulse",
                          Collected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          Cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
                          Rejected: "bg-rose-500/20 text-rose-300 border-rose-500/30",
                          Expired: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
                        };

                        return (
                          <tr
                            key={order.id}
                            className={`hover:bg-white/[0.02] transition-colors ${
                              isCancelled ? "bg-red-950/10" : ""
                            }`}
                          >
                            <td className="py-3 px-3 font-mono">
                              <span className="font-bold text-white">
                                #{order.pickupCode || (order.id ? order.id.slice(0, 8) : "—")}
                              </span>
                              {order.pickupSlot && (
                                <div className="text-[10px] text-slate-400 font-normal">
                                  Slot: {order.pickupSlot}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              <div className="font-semibold text-white">
                                {order.studentName || "Anonymous Student"}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">
                                {order.studentUSN || "—"}
                              </div>
                            </td>

                            <td className="py-3 px-3 text-slate-300 max-w-xs truncate">
                              {order.items?.length
                                ? order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")
                                : "—"}
                            </td>

                            <td className="py-3 px-3">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/[0.05] text-slate-300 border border-white/10">
                                {order.paymentType === "counter_cash" ? "Counter Cash" : "UPI"}
                              </span>
                            </td>

                            <td className="py-3 px-3 font-mono text-slate-300 text-[11px]">
                              {formatTimestamp(order.placed_at || order.placedAt)}
                            </td>

                            <td className="py-3 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase border ${
                                  statusColors[order.status] || "bg-white/10 text-white border-white/20"
                                }`}
                              >
                                {order.status}
                              </span>
                              {isCancelled && order.cancelled_at && (
                                <div className="text-[10px] text-red-400/80 font-mono mt-0.5">
                                  Cancelled at {formatTimestamp(order.cancelled_at)}
                                </div>
                              )}
                              {order.rejection_reason && (
                                <div className="text-[10px] text-rose-400 italic mt-0.5 max-w-xs truncate">
                                  Reason: {order.rejection_reason}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-white">
                              ₹{order.totalAmount || 0}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ────────────────────────────────────────────────────────────────────
          5. THEN: MENU ITEMS AND PRICES (Collapsed by Default)
      ──────────────────────────────────────────────────────────────────── */}
      <section className="p-6 rounded-3xl bg-[#0e111a] border border-white/[0.08]">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Menu Items, Prices & Quotas</h2>
              <p className="text-xs text-slate-400">
                Manage item pricing, stock quotas, preparation durations, and item archiving
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              setIsMenuExpanded(!isMenuExpanded);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#141826] hover:bg-[#1a2034] text-slate-200 text-xs font-semibold border border-white/10 transition-colors"
          >
            <span>{isMenuExpanded ? "Collapse Menu" : `Expand Menu (${menu.length} items)`}</span>
            {isMenuExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Expandable Menu Table */}
        <AnimatePresence>
          {isMenuExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-4 border-t border-white/[0.06] overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-slate-400 font-mono uppercase tracking-wider">
                      <th className="py-3 px-3">Dish</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">Price</th>
                      <th className="py-3 px-3">Prep Time</th>
                      <th className="py-3 px-3">Daily Quota</th>
                      <th className="py-3 px-3">Current Stock</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {menu.map((item) => {
                      const isArchived = item.isActive === false;
                      const isAvailable = item.isAvailable !== false;

                      return (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-white/[0.02] transition-colors ${
                            isArchived ? "opacity-60 bg-black/20" : ""
                          }`}
                        >
                          {/* Dish Name */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-9 h-9 rounded-lg object-cover bg-slate-800 shrink-0 border border-white/10"
                              />
                              <div>
                                <div className="font-semibold text-white flex items-center gap-1.5">
                                  <span>{item.name}</span>
                                  {item.isVeg ? (
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Vegetarian" />
                                  ) : (
                                    <span className="w-2 h-2 rounded-full bg-red-400" title="Non-Vegetarian" />
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {isArchived ? (
                                    <span className="text-zinc-400">Archived (Hidden)</span>
                                  ) : !isAvailable ? (
                                    <span className="text-amber-400">Temporarily Paused</span>
                                  ) : item.stock === 0 ? (
                                    <span className="text-red-400">Sold Out</span>
                                  ) : (
                                    <span className="text-emerald-400">Active</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 font-mono text-slate-300">
                            {item.category}
                          </td>

                          <td className="py-3.5 px-3 font-mono font-bold text-white">
                            ₹{item.price}
                          </td>

                          <td className="py-3.5 px-3 font-mono text-slate-300">
                            {item.prepTimeMinutes}m
                          </td>

                          <td className="py-3.5 px-3 font-mono text-slate-300">
                            {item.dailyLimit}
                          </td>

                          <td className="py-3.5 px-3 font-mono font-bold">
                            <span className={item.stock === 0 ? "text-red-400" : "text-emerald-400"}>
                              {item.stock} / {item.dailyLimit}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  sound.playClick();
                                  setEditingItem({ ...item });
                                  setEditError("");
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-slate-300 hover:text-white inline-flex items-center gap-1 font-medium transition-colors"
                              >
                                <Edit3 className="w-3 h-3 text-amber-400" />
                                <span>Edit</span>
                              </button>

                              {isArchived ? (
                                <button
                                  onClick={async () => {
                                    sound.playClick();
                                    if (onUnarchiveItem) await onUnarchiveItem(item.id);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 border border-blue-500/40 text-blue-300 inline-flex items-center gap-1 font-medium transition-colors"
                                  title="Restore dish to active menu"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Restore</span>
                                </button>
                              ) : (
                                <button
                                  onClick={async () => {
                                    sound.playClick();
                                    if (onArchiveItem) await onArchiveItem(item.id);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-600/50 text-zinc-300 inline-flex items-center gap-1 font-medium transition-colors"
                                  title="Archive dish (hides from student ordering)"
                                >
                                  <Archive className="w-3 h-3 text-zinc-400" />
                                  <span>Archive</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ────────────────────────────────────────────────────────────────────
          5. REJECT REASON MODAL
      ──────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {rejectModalOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[#0e111a] border border-red-500/40 rounded-3xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-400" />
                  <span>Reject Counter Order #{rejectModalOrder.id}</span>
                </h3>
                <button
                  onClick={() => setRejectModalOrder(null)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-300">
                  Rejecting this order will mark it as Cancelled and immediately restore the reserved stock.
                </p>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-semibold">
                    Rejection Reason <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Counter payment declined, student requested cancellation..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141724] border border-white/10 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="pt-3 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setRejectModalOrder(null)}
                    className="px-4 py-2 rounded-xl bg-white/[0.06] text-slate-300 text-xs font-semibold"
                  >
                    Keep Order
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReject}
                    disabled={actionLoading[rejectModalOrder.id]}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {actionLoading[rejectModalOrder.id] ? "Rejecting…" : "Confirm Rejection"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ────────────────────────────────────────────────────────────────────
          6. EDIT ITEM MODAL
      ──────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingItem(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />

            <div className="min-h-full flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-lg bg-[#0e111a] border border-white/10 rounded-3xl p-6 shadow-2xl"
              >
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                  <h3 className="font-bold text-white text-base">
                    Edit Dish: {editingItem.name}
                  </h3>
                  <button
                    onClick={() => setEditingItem(null)}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {editError && (
                  <div className="mt-3 p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{editError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveItemEdit} className="mt-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Stock Count
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={editingItem.stock}
                        onChange={(e) => setEditingItem({ ...editingItem, stock: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-[#141724] border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-amber-500/50"
                      />
                      <span className="text-[10px] text-slate-400">Clamped &le; Daily Limit</span>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Daily Quota Limit
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="500"
                        value={editingItem.dailyLimit}
                        onChange={(e) => setEditingItem({ ...editingItem, dailyLimit: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-[#141724] border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Price (₹)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="5000"
                        value={editingItem.price}
                        onChange={(e) => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-[#141724] border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Prep Time (1 - 30 Mins)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={editingItem.prepTimeMinutes}
                        onChange={(e) => setEditingItem({ ...editingItem, prepTimeMinutes: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-[#141724] border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-amber-500/50"
                      />
                      <span className="text-[10px] text-slate-400">
                        {editingItem.prepTimeMinutes <= 8 ? "⚡ Auto Quick Prep" : "Standard dish"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="px-4 py-2 rounded-xl bg-white/[0.06] text-slate-300 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingItem}
                      className="px-5 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 disabled:opacity-60"
                    >
                      {isSavingItem ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
