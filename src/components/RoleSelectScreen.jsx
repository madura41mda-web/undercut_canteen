import { motion } from "motion/react";
import { 
  UtensilsCrossed, 
  ChefHat, 
  LayoutDashboard, 
  ArrowRight, 
  Zap,
  CheckCircle2
} from "lucide-react";
import { ROLES, ROLE_DETAILS, RoleService } from "../lib/role";
import { sound } from "../utils/audio";

export default function RoleSelectScreen({ onSelectRole }) {
  const cards = [
    {
      role: ROLES.STUDENT,
      icon: UtensilsCrossed,
      color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400",
      accent: "bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/25",
      badge: "Student Portal • #/student",
      features: [
        "Live dynamic menu & dish availability",
        "Capacity-guaranteed pickup slots",
        "Token tracking & preparation countdown",
      ],
    },
    {
      role: ROLES.KITCHEN,
      icon: ChefHat,
      color: "from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-400",
      accent: "bg-cyan-500 text-black hover:bg-cyan-400 shadow-cyan-500/25",
      badge: "Kitchen Display Unit • #/kitchen",
      features: [
        "Queue scheduling & burner station priority",
        "Multi-order synchronized batch cooking",
        "Instant 86 sold-out toggles & dish additions",
      ],
    },
    {
      role: ROLES.MANAGER,
      icon: LayoutDashboard,
      color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-400",
      accent: "bg-purple-500 text-white hover:bg-purple-400 shadow-purple-500/25",
      badge: "Executive Control • #/manager",
      features: [
        "Kitchen capacity & rush hour multipliers",
        "Item pricing, daily quotas & archive control",
        "Read-only queue audit & campus analytics",
      ],
    },
  ];

  const handleChoose = (role) => {
    sound.playClick();
    RoleService.setRole(role);
    if (onSelectRole) onSelectRole(role);
  };

  return (
    <div className="relative min-h-[85vh] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-gradient-to-b from-amber-500/10 via-purple-500/5 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-3xl text-center mb-10"
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-semibold mb-4 shadow-sm">
          <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span>Stage 1: Multi-Role Experience Architecture</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          Select Your Smart<span className="text-amber-400">Canteen</span> Role
        </h1>
        <p className="text-slate-400 text-sm sm:text-base mt-3 max-w-xl mx-auto">
          Choose a persona to explore dedicated workflows designed for college campus preordering and kitchen operations.
        </p>

        {/* Note on Demo Mode */}
        <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#121624] border border-white/10 text-xs text-slate-300 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-amber-300 font-semibold">Demo mode:</span>
          <span>login arrives in the next stage. Direct hash links enabled (#/student, #/kitchen, #/manager).</span>
        </div>
      </motion.div>

      {/* Three Role Cards */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          const details = ROLE_DETAILS[card.role];

          return (
            <motion.div
              key={card.role}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              whileHover={{ y: -4 }}
              className={`p-6 sm:p-7 rounded-3xl bg-[#0c0f18]/90 border ${card.color} flex flex-col justify-between shadow-xl backdrop-blur-xl relative overflow-hidden group`}
            >
              <div>
                {/* Role badge */}
                <span className="inline-block px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-[10px] font-mono font-bold text-slate-300 mb-5">
                  {card.badge}
                </span>

                {/* Role icon */}
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Icon className="w-6 h-6 text-white" />
                </div>

                <h3 className="text-xl font-bold text-white tracking-tight">
                  {details.label}
                </h3>
                <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                  {details.desc}
                </p>

                {/* Features checklist */}
                <ul className="mt-6 space-y-2.5 border-t border-white/[0.06] pt-5">
                  {card.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleChoose(card.role)}
                className={`mt-8 w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${card.accent}`}
              >
                <span>Enter as {details.label}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}
