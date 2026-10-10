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
  FileText
} from "lucide-react";
import { sound } from "../utils/audio";

export default function ManagerDashboard({
  menu = [],
  orders = [],
  settings = {},
  onUpdateSettings,
  onUpdateMenuItem,
  onArchiveItem,
  onUnarchiveItem
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [capacity, setCapacity] = useState(settings.maxKitchenCapacity || 12);
  const [rushMultiplier, setRushMultiplier] = useState(settings.rushMultiplier || 1.25);
  const [savedSettingsNotice, setSavedSettingsNotice] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [editError, setEditError] = useState("");

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }, []);

  // Computed metrics from real data
  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const completedOrders = orders.filter((o) => o.status === "Collected");
  const activeOrders = useMemo(() => {
    return orders.filter((o) => o.status !== "Collected" && o.status !== "Cancelled");
  }, [orders]);

  const hourlyRushData = [
    { hour: "9 AM", orders: 12, label: "Breakfast" },
    { hour: "11 AM", orders: 28, label: "Snacks" },
    { hour: "1 PM", orders: 65, label: "Peak Lunch", highlight: true },
    { hour: "3 PM", orders: 24, label: "Tea Break" },
    { hour: "5 PM", orders: 42, label: "Evening" },
    { hour: "7 PM", orders: 31, label: "Dinner Prep" },
  ];

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    sound.playSuccess();
    await onUpdateSettings({
      maxKitchenCapacity: Number(capacity),
      rushMultiplier: Number(rushMultiplier)
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

    // Clamp stock to new daily limit
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      
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
            Configure priority scheduling rules, inventory quotas, and kitchen throughput capacity
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121624] border border-white/10 text-xs text-slate-300 font-mono">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Today: {todayFormatted}</span>
          </div>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#0e121d] border border-white/[0.08] hover:border-amber-500/30 transition-all">
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
            <span>Active transactions</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0e121d] border border-white/[0.08] hover:border-amber-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase font-semibold">ORDERS FULFILLED</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-3">
            {completedOrders.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Across {orders.length} total orders
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0e121d] border border-white/[0.08] hover:border-amber-500/30 transition-all">
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
            Capacity: {settings.maxKitchenCapacity || 12} max
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0e121d] border border-white/[0.08] hover:border-amber-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase font-semibold">ON-TIME PICKUP SLA</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-3">
            94.2%
          </div>
          <div className="text-xs text-purple-300 mt-1">
            Guaranteed slot accuracy
          </div>
        </div>
      </div>

      {/* Control Panels Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Kitchen Capacity & Rush Rules Config */}
        <div className="p-6 rounded-3xl bg-[#0e111a] border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-bold text-white">Capacity & Rush Rule Controls</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400 uppercase">ALGORITHM WEIGHTS</span>
          </div>
          <p className="text-xs text-slate-400 mb-6">
            Configure dynamic limits to dynamically space student pickup slots and protect burner stations during peak lunch rushes.
          </p>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2 text-xs">
                <label className="text-slate-300 font-medium">Max Kitchen Concurrent Order Capacity</label>
                <span className="font-mono text-amber-400 font-bold">{capacity} orders</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>5 Orders (Light)</span>
                <span>15 Orders (Standard)</span>
                <span>30 Orders (Heavy Rush)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 text-xs">
                <label className="text-slate-300 font-medium">Rush Hour Turnaround Multiplier</label>
                <span className="font-mono text-cyan-400 font-bold">{rushMultiplier}x</span>
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
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>1.0x (Regular Pace)</span>
                <span>1.25x (Recommended)</span>
                <span>2.0x (Double Buffer)</span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
              {savedSettingsNotice ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Parameters updated live in backend!
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Affects slot calculations in student carts immediately.
                </span>
              )}

              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all disabled:opacity-50"
              >
                {isSavingSettings ? "Saving…" : "Save Rules"}
              </button>
            </div>
          </div>
        </div>

        {/* Campus Hourly Rush Distribution */}
        <div className="p-6 rounded-3xl bg-[#0e111a] border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-white">Peak Hours Order Volume</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400 uppercase">CAMPUS ANALYTICS</span>
          </div>
          <p className="text-xs text-slate-400 mb-6">
            Hourly throughput tracking enables kitchen staff to pre-batch ingredients before rush hours.
          </p>

          <div className="flex items-end justify-between h-44 gap-2 pt-4 px-2">
            {hourlyRushData.map((d, i) => {
              const heightPercent = Math.round((d.orders / 70) * 100);

              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div className="font-mono text-[10px] text-slate-400 font-bold">{d.orders}</div>
                  <div className="w-full max-w-[42px] bg-[#141826] rounded-t-lg relative overflow-hidden flex flex-col justify-end h-32 border border-white/5">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${heightPercent}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 }}
                      className={`w-full rounded-t-md ${
                        d.highlight 
                          ? "bg-gradient-to-t from-amber-500 to-amber-400 shadow-lg shadow-amber-500/20" 
                          : "bg-gradient-to-t from-cyan-600 to-cyan-400"
                      }`}
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 font-semibold">{d.hour}</div>
                  <div className="text-[9px] text-slate-400 truncate max-w-[50px]">{d.label}</div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Read-Only Live Order Overview (Manager Audit) */}
      <div className="mt-8 p-6 rounded-3xl bg-[#0e111a] border border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.06] mb-4 gap-2">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-lg font-bold text-white">Active Queue Overview (Read-Only)</h3>
              <p className="text-xs text-slate-400">
                Auditing live queue status. Order advancement controls are restricted to Kitchen Staff.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-amber-400 font-bold px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            {activeOrders.length} Active Orders
          </span>
        </div>

        {activeOrders.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No active orders currently in the kitchen queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 font-mono uppercase tracking-wider">
                  <th className="py-3 px-3">Order Token</th>
                  <th className="py-3 px-3">Student</th>
                  <th className="py-3 px-3">Items Ordered</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Pickup Time</th>
                  <th className="py-3 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {activeOrders.map((ord) => {
                  const itemsSummary = (ord.items || [])
                    .map((it) => `${it.quantity}x ${it.name}`)
                    .join(", ");

                  return (
                    <tr key={ord.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-3 font-mono font-bold text-amber-400">
                        {ord.id}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-white">{ord.studentName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{ord.studentRoll}</div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-300 max-w-xs truncate" title={itemsSummary}>
                        {itemsSummary || "1x Meal"}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          ord.priority === "CRITICAL"
                            ? "bg-red-500/20 text-red-300 border border-red-500/40"
                            : ord.priority === "HIGH"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-slate-800 text-slate-300 border border-white/10"
                        }`}>
                          {ord.priority || "NORMAL"}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          ord.status === "Ready"
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                            : ord.status === "Preparing"
                            ? "bg-amber-950/60 text-amber-300 border-amber-500/40"
                            : "bg-cyan-950/60 text-cyan-300 border-cyan-500/40"
                        }`}>
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-300">
                        {ord.promisedPickupTime || "Soon"}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-white">
                        ₹{ord.totalAmount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Menu Inventory & Daily Quantity Limits Table */}
      <div className="mt-8 p-6 rounded-3xl bg-[#0e111a] border border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.06] mb-4 gap-2">
          <div>
            <h3 className="text-lg font-bold text-white">Food Availability & Daily Quota Management</h3>
            <p className="text-xs text-slate-400">
              Audit current counter stocks, price caps, preparation times, and archive status
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {menu.length} registered menu items
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-slate-400 font-mono uppercase tracking-wider">
                <th className="py-3 px-3">Item Name</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Price</th>
                <th className="py-3 px-3">Prep Time</th>
                <th className="py-3 px-3">Remaining Stock</th>
                <th className="py-3 px-3">Daily Limit</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {menu.map((item) => {
                const isArchived = item.isActive === false;
                const isSoldOut = item.stock <= 0;
                const isLow = item.stock > 0 && item.stock <= 3;

                return (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-white/[0.02] transition-colors ${isArchived ? "opacity-60 bg-black/20" : ""}`}
                  >
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-8 h-8 rounded-lg object-cover bg-slate-800 shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{item.name}</span>
                            {isArchived && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                Archived
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{item.counter}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-slate-400">{item.category}</td>
                    <td className="py-3.5 px-3 font-mono font-bold text-white">₹{item.price}</td>
                    <td className="py-3.5 px-3 font-mono text-amber-400">{item.prepTimeMinutes} mins</td>
                    <td className="py-3.5 px-3 font-mono font-bold">
                      <span className={isArchived ? "text-zinc-500" : isSoldOut ? "text-red-400" : isLow ? "text-amber-400" : "text-emerald-400"}>
                        {item.stock} left
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-400">{item.dailyLimit}</td>
                    <td className="py-3.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        isArchived
                          ? "bg-zinc-800 text-zinc-400 border-zinc-700"
                          : isSoldOut 
                          ? "bg-red-950/60 text-red-300 border-red-500/30"
                          : isLow 
                          ? "bg-amber-950/60 text-amber-300 border-amber-500/30"
                          : "bg-emerald-950/60 text-emerald-300 border-emerald-500/30"
                      }`}>
                        {isArchived ? "Archived" : isSoldOut ? "Sold Out" : isLow ? "Low Stock" : "In Stock"}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {/* Edit item details */}
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

                        {/* Archive / Unarchive Manager Action */}
                        {isArchived ? (
                          <button
                            onClick={async () => {
                              sound.playClick();
                              if (onUnarchiveItem) await onUnarchiveItem(item.id);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 border border-blue-500/40 text-blue-300 inline-flex items-center gap-1 font-medium transition-colors"
                            title="Unarchive dish"
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
                            title="Archive dish (hides from student menu)"
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
      </div>

      {/* Edit Item Modal */}
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
