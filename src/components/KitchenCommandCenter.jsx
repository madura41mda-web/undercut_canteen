import { useState, useMemo } from "react";
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
  X
} from "lucide-react";
import { sound } from "../utils/audio";
import AddDishModal from "./AddDishModal";
import { can } from "../lib/role";

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

  // Group orders by status
  const queuedOrders = useMemo(() => orders.filter(o => o.status === "Placed" || o.status === "Accepted"), [orders]);
  const preparingOrders = useMemo(() => orders.filter(o => o.status === "Preparing"), [orders]);
  const readyOrders = useMemo(() => orders.filter(o => o.status === "Ready"), [orders]);
  const cancelledOrders = useMemo(() => orders.filter(o => o.status === "Cancelled"), [orders]);

  // Overall load calculations
  const activeOrdersCount = queuedOrders.length + preparingOrders.length;
  const loadPercentage = Math.min(100, Math.round((activeOrdersCount / kitchenCapacity) * 100));

  const handleStatusChange = async (orderId, nextStatus) => {
    sound.playClick();
    if (nextStatus === "Ready") {
      sound.playReadyBell();
    }
    await onUpdateOrderStatus(orderId, nextStatus);
  };

  // 1-Click Batch Preparation handler
  const handleBatchPrepare = async (batch) => {
    sound.playSuccess();
    // Advance all orders in this batch to 'Preparing' if they are still placed/accepted
    for (const id of batch.orderIds) {
      const ord = orders.find(o => o.id === id);
      if (ord && (ord.status === "Placed" || ord.status === "Accepted")) {
        await onUpdateOrderStatus(id, "Preparing");
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      
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
            <span>Manage Stock (86'd Items)</span>
          </button>
        </div>
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
        
        {/* Column 1: Upcoming & Queued Orders */}
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
              queuedOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl bg-[#131624] border border-white/[0.08] hover:border-amber-500/40 transition-all shadow-md"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-white text-sm bg-black/40 px-2 py-0.5 rounded border border-white/10">
                      {order.id}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      DEADLINE: {order.promisedPickupTime}
                    </span>
                  </div>

                  {/* Student & Token */}
                  <div className="flex justify-between items-center text-xs text-slate-400 font-mono mb-3">
                    <span>{order.studentName}</span>
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

                  {/* Advance Button */}
                  <button
                    onClick={() => handleStatusChange(order.id, "Preparing")}
                    className="w-full mt-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                  >
                    <Flame className="w-3.5 h-3.5 fill-black" />
                    <span>Start Cooking</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: In Preparation (Active Burners) */}
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
              preparingOrders.map((order) => (
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
                    <span>{order.studentName}</span>
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

                  <button
                    onClick={() => handleStatusChange(order.id, "Ready")}
                    className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Food Ready (Ring Student)</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Ready for Pickup */}
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
              readyOrders.map((order) => (
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
                    Student: <strong className="text-white">{order.studentName}</strong>
                  </div>

                  <div className="text-xs font-mono text-emerald-300 bg-emerald-950/60 p-2 rounded-lg border border-emerald-500/30 mb-3">
                    Placed at: {order.counter}
                  </div>

                  <button
                    onClick={() => handleStatusChange(order.id, "Collected")}
                    className="w-full py-2.5 rounded-xl bg-white/[0.1] hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/10 active:scale-95 transition-all"
                  >
                    <PackageCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Confirm Handover (Collected)</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Cancelled Orders (collapsed summary) */}
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

      {/* Quick Stock Drawer / Modal */}
      <AnimatePresence>
        {stockDrawerOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStockDrawerOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />

            <div className="min-h-full flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-xl bg-[#0e111a] border border-white/10 rounded-3xl p-6 shadow-2xl"
              >
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <SlidersHorizontal className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-white text-lg">Kitchen Live Inventory Controls</h3>
                  </div>
                  <button
                    onClick={() => setStockDrawerOpen(false)}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-400 mt-2 mb-4">
                  Quickly 86 items or restore stock in real time during peak lunch rush. Changes reflect immediately in student menus.
                </p>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {menu.map((item) => {
                    const isArchived = item.isActive === false;
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          isArchived
                            ? "bg-[#10121a]/90 border-white/[0.04] opacity-75"
                            : "bg-[#131624] border-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-10 h-10 rounded-lg object-cover bg-slate-800"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs">{item.name}</span>
                              {isArchived && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  Archived
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Stock: <strong className={item.stock === 0 ? "text-red-400" : "text-amber-400"}>{item.stock} left</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isArchived && (
                            item.stock > 0 ? (
                              <button
                                onClick={async () => {
                                  sound.playClick();
                                  await onUpdateStock(item.id, 0);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 text-xs font-bold transition-colors"
                              >
                                Mark 86
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  sound.playClick();
                                  await onUpdateStock(item.id, 15);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 text-xs font-bold transition-colors"
                              >
                                Restock (+15)
                              </button>
                            )
                          )}

                          {/* Manager-only Archive / Unarchive capability */}
                          {can("dish:archive") && (
                            isArchived ? (
                              <button
                                onClick={async () => {
                                  sound.playClick();
                                  if (onUnarchiveItem) await onUnarchiveItem(item.id);
                                }}
                                className="px-2 py-1.5 rounded-lg bg-blue-950/60 border border-blue-500/40 text-blue-300 hover:bg-blue-900/60 text-xs font-semibold flex items-center gap-1 transition-colors"
                                title="Restore item to menu"
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
                                className="px-2 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-600/50 text-zinc-300 hover:bg-zinc-700/80 text-xs font-semibold flex items-center gap-1 transition-colors"
                                title="Hide item from students"
                              >
                                <Archive className="w-3 h-3" />
                                <span>Archive</span>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 pt-3 border-t border-white/[0.08] text-right">
                  <button
                    onClick={() => setStockDrawerOpen(false)}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400"
                  >
                    Done
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
