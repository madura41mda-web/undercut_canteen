import { motion } from "motion/react";
import { 
  ShoppingBag, 
  ChefHat, 
  LayoutDashboard, 
  Clock, 
  UtensilsCrossed, 
  Sparkles,
  Zap
} from "lucide-react";
import { sound } from "../utils/audio";

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  cartCount, 
  cartTotal, 
  openCart,
  activeOrder,
  kitchenLoad = 58 
}) {
  const navItems = [
    { id: "student", label: "Student Menu", icon: UtensilsCrossed },
    { 
      id: "tracking", 
      label: "Live Tracking", 
      icon: Clock,
      badge: activeOrder?.status === "Ready" ? "Ready" : activeOrder ? activeOrder.status : null,
      badgeColor: activeOrder?.status === "Ready" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"
    },
    { id: "kitchen", label: "Kitchen Command", icon: ChefHat },
    { id: "manager", label: "Operations & Manager", icon: LayoutDashboard },
  ];

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#090a0f]/85 border-b border-white/[0.08] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          
          {/* Brand Logo & Tagline */}
          <div 
            onClick={() => { sound.playClick(); setActiveTab("student"); }}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-shadow">
              <Zap className="w-5 h-5 fill-black stroke-black" />
              <div className="absolute -inset-0.5 rounded-xl bg-amber-400 opacity-0 group-hover:opacity-30 blur transition" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white group-hover:text-amber-300 transition-colors">
                  Smart<span className="text-amber-400">Canteen</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono tracking-wider font-semibold rounded-full bg-white/[0.06] text-amber-300/90 border border-white/10">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  PS 76
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                Predictive Queue & Pickup Intelligence
              </p>
            </div>
          </div>

          {/* Navigation Tabs with Motion Pill */}
          <nav className="hidden md:flex items-center p-1 rounded-2xl bg-[#121520] border border-white/[0.07] shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    sound.playClick();
                    setActiveTab(item.id);
                  }}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                    isActive 
                      ? "text-white" 
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNavIndicator"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/[0.12] to-white/[0.06] border border-white/15 shadow-sm"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    />
                  )}
                  <Icon className={`w-4 h-4 relative z-10 ${isActive ? "text-amber-400" : "text-slate-400"}`} />
                  <span className="relative z-10">{item.label}</span>

                  {item.badge && (
                    <span className={`relative z-10 px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-md border ${item.badgeColor} animate-pulse`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action Bar: Kitchen Pulse & Cart Button */}
          <div className="flex items-center gap-3">
            {/* Live Kitchen Load Indicator */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121520] border border-white/[0.08]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-slate-300 font-medium">
                Kitchen: <span className="font-mono text-emerald-400">{kitchenLoad}% Load</span>
              </span>
            </div>

            {/* Cart Drawer Trigger */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                sound.playClick();
                openCart();
              }}
              className="relative flex items-center gap-2.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold text-xs sm:text-sm shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35 transition-all"
            >
              <div className="relative">
                <ShoppingBag className="w-4 h-4 stroke-[2.2]" />
                {cartCount > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-extrabold text-white bg-red-600 rounded-full border border-black"
                  >
                    {cartCount}
                  </motion.span>
                )}
              </div>
              <span className="hidden sm:inline">My Cart</span>
              {cartCount > 0 && (
                <span className="font-mono font-bold bg-black/20 px-2 py-0.5 rounded-md text-[11px]">
                  ₹{cartTotal}
                </span>
              )}
            </motion.button>
          </div>

        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-white/[0.06] overflow-x-auto gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sound.playClick();
                  setActiveTab(item.id);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" : "text-slate-400"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
