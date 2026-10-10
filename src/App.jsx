import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Navbar from "./components/Navbar";
import StudentHome from "./components/StudentHome";
import CartDrawer from "./components/CartDrawer";
import CheckoutModal from "./components/CheckoutModal";
import OrderTracking from "./components/OrderTracking";
import KitchenCommandCenter from "./components/KitchenCommandCenter";
import ManagerDashboard from "./components/ManagerDashboard";
import MotionFoodBackground from "./components/MotionFoodBackground";
import RoleSelectScreen from "./components/RoleSelectScreen";
import OrderConfirmationModal from "./components/OrderConfirmationModal";
import StudentUSNModal from "./components/StudentUSNModal";
import { 
  CanteenService, 
  getStoredStudentUSN, 
  getStoredStudentName 
} from "./services/canteenState";
import { RoleService, ROLES, can } from "./lib/role";
import { sound } from "./utils/audio";
import { RefreshCw, Zap, ShieldCheck, Loader2, AlertCircle, X } from "lucide-react";
import "./App.css";

export default function App() {
  const [currentRole, setCurrentRole] = useState(() => RoleService.getRole());
  const [activeTab, setActiveTab] = useState(() => {
    const role = RoleService.getRole();
    if (role === ROLES.KITCHEN) return "kitchen";
    if (role === ROLES.MANAGER) return "manager";
    return "student";
  });

  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({});
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmationOrder, setConfirmationOrder] = useState(null);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [feasibleSlots, setFeasibleSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState("disconnected");
  const [lastUpdated, setLastUpdated] = useState(() => CanteenService.getLastUpdatedFormatted());

  // ── Student USN Identity State ─────────────────────────────────────────
  const [studentUSN, setStudentUSN] = useState(() => getStoredStudentUSN() || "");
  const [_studentName, setStudentName] = useState(() => getStoredStudentName() || "");
  const [usnModalOpen, setUsnModalOpen] = useState(false);

  // Require USN entry for students before ordering / tracking
  useEffect(() => {
    if (currentRole === ROLES.STUDENT && !studentUSN) {
      setUsnModalOpen(true);
    }
  }, [currentRole, studentUSN]);

  // ── Sync Role with URL Hash & State ──────────────────────────────────
  useEffect(() => {
    function syncRoleFromHash() {
      const hash = window.location.hash.toLowerCase();
      let matchedRole = null;
      if (hash.includes("student")) matchedRole = ROLES.STUDENT;
      else if (hash.includes("kitchen")) matchedRole = ROLES.KITCHEN;
      else if (hash.includes("manager")) matchedRole = ROLES.MANAGER;

      if (matchedRole) {
        if (matchedRole !== RoleService.getRole()) {
          RoleService.setRole(matchedRole);
          setCurrentRole(matchedRole);
        }
      }
    }

    syncRoleFromHash();
    window.addEventListener("hashchange", syncRoleFromHash);
    const unsubRole = RoleService.subscribe((role) => {
      setCurrentRole(role);
    });

    return () => {
      window.removeEventListener("hashchange", syncRoleFromHash);
      unsubRole();
    };
  }, []);

  // ── Role Security Gating & Redirection (Never render unauthorized tab) ──
  useEffect(() => {
    if (!currentRole) return;
    if (currentRole === ROLES.STUDENT) {
      if (activeTab !== "student" && activeTab !== "tracking") {
        setActiveTab("student");
      }
    } else if (currentRole === ROLES.KITCHEN) {
      if (activeTab !== "kitchen") {
        setActiveTab("kitchen");
      }
    } else if (currentRole === ROLES.MANAGER) {
      if (activeTab !== "manager") {
        setActiveTab("manager");
      }
    }
  }, [currentRole, activeTab]);

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
      setRealtimeStatus(CanteenService.getRealtimeStatus());
      setLastUpdated(CanteenService.getLastUpdatedFormatted());
      const active = CanteenService.getActiveOrder();
      if (active) setActiveOrderId(active.id);
    }

    unsub = CanteenService.subscribe(syncFromCache);
    boot();

    // Auto-expire sweep every 30 seconds
    const expiryInterval = setInterval(() => {
      CanteenService.expirePendingOrders();
    }, 30000);

    return () => {
      if (unsub) unsub();
      clearInterval(expiryInterval);
    };
  }, []);

  // Chime notification and Toast for Manager when new pending counter orders arrive
  const [toast, setToast] = useState(null);
  const prevPendingCountRef = useRef(0);
  useEffect(() => {
    const pendingCount = orders.filter((o) => o.status === "pending_approval").length;
    if (pendingCount > prevPendingCountRef.current) {
      if (
        currentRole === ROLES.MANAGER ||
        (currentRole === ROLES.KITCHEN && settings.counterApprover === "kitchen_or_manager")
      ) {
        sound.playPendingAlert();
        const diff = pendingCount - prevPendingCountRef.current;
        setToast({
          id: Date.now(),
          title: "New Counter Order Arrival",
          message: `${diff} pay-at-counter order${diff > 1 ? "s" : ""} awaiting counter payment approval.`,
          count: pendingCount,
        });
      }
    }
    prevPendingCountRef.current = pendingCount;
  }, [orders, currentRole, settings.counterApprover]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Pickup slot refresh whenever cart changes ─────────────────────────
  useEffect(() => {
    if (!cart.length) {
      return;
    }
    CanteenService.calculateFeasibleSlots(cart).then((slots) => {
      setFeasibleSlots(slots);
    });
  }, [cart, orders]);

  // ── Derived values ────────────────────────────────────────────────────
  const cartCount = cart.reduce((acc, i) => acc + i.quantity, 0);
  const cartTotal = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const activeOrder =
    orders.find((o) => o.id === activeOrderId) || orders[0] || null;
  const detectedBatches = CanteenService.detectBatches();

  // Computed live kitchen load percentage
  const maxCapacity = settings.maxKitchenCapacity || 12;
  const activeOrdersCount = useMemo(() => {
    return orders.filter((o) => o.status !== "Collected" && o.status !== "Cancelled").length;
  }, [orders]);
  const kitchenLoad = Math.min(100, Math.round((activeOrdersCount / maxCapacity) * 100));

  const pendingApprovalCount = useMemo(() => {
    return orders.filter((o) => o.status === "pending_approval").length;
  }, [orders]);

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
    if (result.ok && result.order) {
      setCart([]);
      setCartOpen(false);
      setCheckoutOpen(false);
      setActiveOrderId(result.order.id);
      CanteenService.setActiveOrderId(result.order.id);
      setConfirmationOrder(result.order);
    }
    return result;
  }, []);

  // ── Status updates (async) ─────────────────────────────────────────────
  const handleUpdateOrderStatus = useCallback(async (orderId, nextStatus) => {
    const res = await CanteenService.updateOrderStatus(orderId, nextStatus);
    if (res && !res.ok) {
      console.warn("[App] status update failed:", res);
    }
    return res;
  }, []);

  const handleCancelOrder = useCallback(async (orderId, reason, usn = null) => {
    const res = await CanteenService.cancelOrder(orderId, reason, usn || studentUSN);
    return res;
  }, [studentUSN]);

  // ── Stock and item updates (async) ────────────────────────────────────
  const handleUpdateStock = useCallback(async (itemId, newStock) => {
    if (newStock === 0) {
      await CanteenService.updateMenuItemStock(itemId, 0);
    } else {
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
    return await CanteenService.updateMenuItem(item);
  }, []);

  const handleAddDish = useCallback(async (dishPayload) => {
    return await CanteenService.addMenuItem(dishPayload);
  }, []);

  const handleArchiveItem = useCallback(async (itemId) => {
    return await CanteenService.archiveMenuItem(itemId);
  }, []);

  const handleUnarchiveItem = useCallback(async (itemId) => {
    return await CanteenService.unarchiveMenuItem(itemId);
  }, []);

  // ── Approvals (async) ─────────────────────────────────────────────────
  const handleApproveOrder = useCallback(async (orderId) => {
    return await CanteenService.approveOrder(orderId);
  }, []);

  const handleRejectOrder = useCallback(async (orderId, reason) => {
    return await CanteenService.rejectOrder(orderId, reason);
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
            Create a <code className="text-amber-400">.env</code> file with your Supabase URL and anon key.
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
        openCart={() => {
          if (!studentUSN && currentRole === ROLES.STUDENT) {
            setUsnModalOpen(true);
            return;
          }
          setCartOpen(true);
        }}
        activeOrder={activeOrder}
        kitchenLoad={kitchenLoad}
        currentRole={currentRole}
        studentUSN={studentUSN}
        onChangeUSN={() => setUsnModalOpen(true)}
        onSwitchRole={() => {
          RoleService.logout();
          setCurrentRole(null);
        }}
        onLogout={() => {
          RoleService.logout();
          setCurrentRole(null);
        }}
        realtimeStatus={realtimeStatus}
        lastUpdatedFormatted={lastUpdated}
        pendingApprovalCount={pendingApprovalCount}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1">
        {/* Role Selection Screen if no role is active */}
        {!currentRole ? (
          <RoleSelectScreen
            onSelectRole={(role) => {
              RoleService.setRole(role);
              setCurrentRole(role);
              if (role === ROLES.KITCHEN) setActiveTab("kitchen");
              else if (role === ROLES.MANAGER) setActiveTab("manager");
              else setActiveTab("student");
            }}
          />
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === "student" && can("tab:student") && (
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
                  studentUSN={studentUSN}
                  onAddToCart={(item) => {
                    if (!studentUSN) {
                      setUsnModalOpen(true);
                    }
                    handleAddToCart(item);
                  }}
                  onUpdateCartQuantity={handleUpdateCartQuantity}
                  onOpenCart={() => {
                    if (!studentUSN) {
                      setUsnModalOpen(true);
                      return;
                    }
                    setCartOpen(true);
                  }}
                  onNavigateToTracking={() => {
                    if (!studentUSN) {
                      setUsnModalOpen(true);
                      return;
                    }
                    setActiveTab("tracking");
                  }}
                  activeOrder={activeOrder}
                  orders={orders}
                  kitchenCapacity={maxCapacity}
                  detectedBatches={detectedBatches}
                />
              </motion.div>
            )}

            {activeTab === "tracking" && can("tab:tracking") && (
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
                  studentUSN={studentUSN}
                  onSelectOrder={(id) => {
                    setActiveOrderId(id);
                    CanteenService.setActiveOrderId(id);
                  }}
                  onCancelOrder={handleCancelOrder}
                  onNewOrderClick={() => setActiveTab("student")}
                />
              </motion.div>
            )}

            {activeTab === "kitchen" && can("tab:kitchen") && (
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
                  onAddDish={handleAddDish}
                  onArchiveItem={handleArchiveItem}
                  onUnarchiveItem={handleUnarchiveItem}
                  detectedBatches={detectedBatches}
                  kitchenCapacity={maxCapacity}
                />
              </motion.div>
            )}

            {activeTab === "manager" && can("tab:manager") && (
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
                  onArchiveItem={handleArchiveItem}
                  onUnarchiveItem={handleUnarchiveItem}
                  onApproveOrder={handleApproveOrder}
                  onRejectOrder={handleRejectOrder}
                  realtimeStatus={realtimeStatus}
                  lastUpdatedFormatted={lastUpdated}
                  onForceRefresh={() => CanteenService.refresh()}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Cart Drawer (Students Only) */}
      {can("cart:access") && (
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
      )}

      {/* Checkout Modal (Students Only) */}
      {can("order:place") && (
        <CheckoutModal
          isOpen={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          cart={cart}
          feasibleSlots={feasibleSlots}
          onConfirmOrder={handleConfirmOrder}
        />
      )}

      {/* Order Placed Confirmation Screen */}
      <OrderConfirmationModal
        isOpen={!!confirmationOrder}
        onClose={() => {
          setConfirmationOrder(null);
          setActiveTab("tracking");
        }}
        order={confirmationOrder}
        onTrackOrder={(orderId) => {
          setConfirmationOrder(null);
          setActiveOrderId(orderId);
          setActiveTab("tracking");
        }}
      />

      {/* Student USN Modal */}
      {currentRole === ROLES.STUDENT && (
        <StudentUSNModal
          isOpen={usnModalOpen || !studentUSN}
          canDismiss={!!studentUSN}
          onClose={() => {
            if (studentUSN) setUsnModalOpen(false);
          }}
          onSave={(usn, name) => {
            setStudentUSN(usn);
            setStudentName(name);
            setUsnModalOpen(false);
          }}
        />
      )}

      {/* Footer */}
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
            <span>Role-Separated Architecture</span>
          </div>

          {/* Reset Demo Data Button (Visible to Kitchen & Manager Only) */}
          {can("demo:reset") && (
            <button
              onClick={handleDemoReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-slate-400 hover:text-white text-xs font-mono transition-colors border border-white/10"
              title="Reset all demo orders and restore stock"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Demo Data</span>
            </button>
          )}
        </div>
      </footer>

      {/* Floating Manager / Approver Toast Alert */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm w-full mx-4 sm:mx-0 p-4 rounded-2xl bg-[#121522] border border-amber-500/40 shadow-2xl shadow-black/80 flex items-start gap-3.5 backdrop-blur-xl"
            role="alert"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
              <AlertCircle className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div 
              className="flex-1 cursor-pointer"
              onClick={() => {
                sound.playClick();
                if (can("tab:manager")) setActiveTab("manager");
                else if (can("tab:kitchen")) setActiveTab("kitchen");
                setToast(null);
              }}
            >
              <h4 className="text-xs font-bold text-white tracking-wide uppercase flex items-center gap-1.5">
                <span>{toast.title}</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/30 text-amber-300 font-bold">
                  {toast.count} Pending
                </span>
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{toast.message}</p>
              <p className="text-[10px] text-amber-400/80 font-mono mt-1 underline">Click to review in approvals inbox →</p>
            </div>
            <button
              onClick={() => {
                sound.playClick();
                setToast(null);
              }}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
