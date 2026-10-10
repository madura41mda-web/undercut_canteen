import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import Navbar from "./components/Navbar";
import StudentHome from "./components/StudentHome";
import CartDrawer from "./components/CartDrawer";
import CheckoutModal from "./components/CheckoutModal";
import OrderTracking from "./components/OrderTracking";
import KitchenCommandCenter from "./components/KitchenCommandCenter";
import ManagerDashboard from "./components/ManagerDashboard";
import MotionFoodBackground from "./components/MotionFoodBackground";
import { CanteenService } from "./services/canteenState";
import { sound } from "./utils/audio";
import { RefreshCw, Zap, ShieldCheck, Loader2 } from "lucide-react";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("student");
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({});
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [feasibleSlots, setFeasibleSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ── Initial load & Realtime subscription ──────────────────────────────
  useEffect(() => {
    let unsub = null;

    async function boot() {
      try {
        await CanteenService.init();
        syncFromCache();
        setIsLoading(false);
      } catch (err) {
        console.error("[App] boot error:", err);
        setLoadError("Could not connect to the backend. Check your .env and Supabase settings.");
        setIsLoading(false);
      }
    }

    function syncFromCache() {
      setMenu(CanteenService.getMenu());
      setOrders(CanteenService.getOrders());
      setSettings(CanteenService.getSettings());
      const active = CanteenService.getActiveOrder();
      if (active) setActiveOrderId(active.id);
    }

    unsub = CanteenService.subscribe(syncFromCache);
    boot();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // ── Pickup slot refresh whenever cart changes ─────────────────────────
  useEffect(() => {
    if (!cart.length) {
      setFeasibleSlots([]);
      return;
    }
    CanteenService.calculateFeasibleSlots(cart).then(setFeasibleSlots);
  }, [cart, orders]);

  // ── Derived values ────────────────────────────────────────────────────
  const cartCount = cart.reduce((acc, i) => acc + i.quantity, 0);
  const cartTotal = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const activeOrder =
    orders.find((o) => o.id === activeOrderId) || orders[0] || null;
  const detectedBatches = CanteenService.detectBatches();

  // ── Cart operations (synchronous, no backend) ─────────────────────────
  const handleAddToCart = useCallback((item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        if (existing.quantity >= item.stock) return prev;
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const handleUpdateCartQuantity = useCallback((itemId, newQty) => {
    if (newQty <= 0) {
      setCart((prev) => prev.filter((i) => i.id !== itemId));
      return;
    }
    const menuItem = menu.find((m) => m.id === itemId);
    if (menuItem && newQty > menuItem.stock) return;
    setCart((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i))
    );
  }, [menu]);

  const handleRemoveCartItem = useCallback((itemId) => {
    setCart((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  // ── Order confirmation (async) ─────────────────────────────────────────
  const handleConfirmOrder = useCallback(async (orderData) => {
    const result = await CanteenService.createOrder(orderData);
    if (result.ok) {
      setCart([]);
      setCartOpen(false);
      setActiveOrderId(result.order.id);
      CanteenService.setActiveOrderId(result.order.id);
      setActiveTab("tracking");
    }
    return result; // CheckoutModal uses this to show errors / slot adjustments
  }, []);

  // ── Status updates (async) ─────────────────────────────────────────────
  const handleUpdateOrderStatus = useCallback(async (orderId, nextStatus) => {
    const res = await CanteenService.updateOrderStatus(orderId, nextStatus);
    if (res && !res.ok) {
      console.warn("[App] status update failed:", res);
    }
  }, []);

  const handleCancelOrder = useCallback(async (orderId, reason) => {
    const res = await CanteenService.cancelOrder(orderId, reason);
    return res;
  }, []);

  // ── Stock and item updates (async) ────────────────────────────────────
  const handleUpdateStock = useCallback(async (itemId, newStock) => {
    if (newStock === 0) {
      await CanteenService.updateMenuItemStock(itemId, 0);
    } else {
      // Restock: use the restock RPC to add the amount.
      const current = menu.find((m) => m.id === itemId);
      const toAdd = newStock - (current?.stock ?? 0);
      if (toAdd > 0) {
        await CanteenService.restockItem(itemId, toAdd);
      } else if (toAdd < 0) {
        await CanteenService.updateMenuItemStock(itemId, newStock);
      }
    }
  }, [menu]);

  const handleUpdateMenuItem = useCallback(async (item) => {
    await CanteenService.updateMenuItem(item);
  }, []);

  // ── Settings (async) ──────────────────────────────────────────────────
  const handleUpdateSettings = useCallback(async (newSettings) => {
    await CanteenService.updateSettings(newSettings);
  }, []);

  // ── Demo reset (async) ────────────────────────────────────────────────
  const handleDemoReset = useCallback(async () => {
    sound.playClick();
    await CanteenService.demoReset();
    setCart([]);
    setActiveOrderId(null);
  }, []);

  // ── Loading screen ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#08090d] flex items-center justify-center flex-col gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <div className="text-center">
          <div className="font-extrabold text-white text-lg tracking-tight">
            Smart<span className="text-amber-400">Canteen</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Connecting to kitchen backend…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#08090d] flex items-center justify-center flex-col gap-4 px-4">
        <div className="max-w-md text-center">
          <div className="font-extrabold text-white text-lg mb-2">
            Smart<span className="text-amber-400">Canteen</span>
          </div>
          <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-300 text-sm">
            {loadError}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Create a <code className="text-amber-400">.env</code> file from{" "}
            <code className="text-amber-400">.env.example</code> with your Supabase URL and anon key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#08090d] text-[#f1f3f9] flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200 overflow-x-hidden">

      {/* Background Animated Food Elements in Motion */}
      <MotionFoodBackground />

      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cartCount={cartCount}
        cartTotal={cartTotal}
        openCart={() => setCartOpen(true)}
        activeOrder={activeOrder}
      />

      {/* Main Content Area with View Transitions */}
      <main className="relative z-10 flex-1">
        <AnimatePresence mode="wait">
          {activeTab === "student" && (
            <motion.div
              key="student"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <StudentHome
                menu={menu}
                cart={cart}
                onAddToCart={handleAddToCart}
                onUpdateCartQuantity={handleUpdateCartQuantity}
                onOpenCart={() => setCartOpen(true)}
                onNavigateToTracking={() => setActiveTab("tracking")}
                activeOrder={activeOrder}
              />
            </motion.div>
          )}

          {activeTab === "tracking" && (
            <motion.div
              key="tracking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <OrderTracking
                orders={orders}
                activeOrderId={activeOrderId}
                onSelectOrder={(id) => {
                  setActiveOrderId(id);
                  CanteenService.setActiveOrderId(id);
                }}
                onUpdateStatus={handleUpdateOrderStatus}
                onCancelOrder={handleCancelOrder}
                onNewOrderClick={() => setActiveTab("student")}
                onDemoReset={handleDemoReset}
              />
            </motion.div>
          )}

          {activeTab === "kitchen" && (
            <motion.div
              key="kitchen"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <KitchenCommandCenter
                orders={orders}
                menu={menu}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onUpdateStock={handleUpdateStock}
                detectedBatches={detectedBatches}
                kitchenCapacity={settings.maxKitchenCapacity || 12}
              />
            </motion.div>
          )}

          {activeTab === "manager" && (
            <motion.div
              key="manager"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <ManagerDashboard
                menu={menu}
                orders={orders}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onUpdateMenuItem={handleUpdateMenuItem}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
        feasibleSlots={feasibleSlots}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        feasibleSlots={feasibleSlots}
        onConfirmOrder={handleConfirmOrder}
      />

      {/* Modern High-End Footer */}
      <footer className="border-t border-white/[0.08] bg-[#07080c] py-10 px-4 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="font-extrabold text-white text-sm tracking-tight">
                Smart<span className="text-amber-400">Canteen</span> System
              </div>
              <p className="text-xs text-slate-400">
                Problem Statement 76 • College Hackathon Edition
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap justify-center font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Supabase Realtime Backend
            </span>
            <span>•</span>
            <span>Motion & Spring UI</span>
            <span>•</span>
            <span>Live Queue Scheduling</span>
          </div>

          {/* Demo Reset Button */}
          <button
            onClick={handleDemoReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-slate-400 hover:text-white text-xs font-mono transition-colors border border-white/10"
            title="Reset all demo orders and restore stock"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </footer>

    </div>
  );
}
