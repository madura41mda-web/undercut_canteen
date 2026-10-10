// Curated high quality food items for floating background in motion
const FLOATING_FOODS = [
  {
    name: "Crispy Dosa",
    prep: "8m prep",
    price: "₹65",
    img: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400&auto=format&fit=crop&q=70",
    pos: "top-[12%] left-[4%]",
    floatClass: "animate-float-slow",
    scale: 0.95
  },
  {
    name: "Paneer Roll",
    prep: "10m prep",
    price: "₹85",
    img: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=400&auto=format&fit=crop&q=70",
    pos: "top-[18%] right-[5%]",
    floatClass: "animate-float-reverse",
    scale: 1.05
  },
  {
    name: "Cold Brew Coffee",
    prep: "3m prep",
    price: "₹45",
    img: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&auto=format&fit=crop&q=70",
    pos: "top-[52%] left-[2%]",
    floatClass: "animate-float-horizontal",
    scale: 0.9
  },
  {
    name: "Veg Hakka Noodles",
    prep: "9m prep",
    price: "₹75",
    img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&auto=format&fit=crop&q=70",
    pos: "top-[64%] right-[3%]",
    floatClass: "animate-float-slow",
    scale: 0.95
  },
  {
    name: "Samosa Chaat",
    prep: "5m prep",
    price: "₹40",
    img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&auto=format&fit=crop&q=70",
    pos: "top-[82%] left-[8%]",
    floatClass: "animate-float-reverse",
    scale: 0.85
  },
  {
    name: "Brownie Shake",
    prep: "4m prep",
    price: "₹60",
    img: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&auto=format&fit=crop&q=70",
    pos: "top-[85%] right-[9%]",
    floatClass: "animate-float-horizontal",
    scale: 0.9
  }
];

const MARQUEE_ITEMS = [
  { name: "Dum Biryani", img: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&auto=format&fit=crop&q=60" },
  { name: "Chole Bhature", img: "https://images.unsplash.com/photo-1626132647523-66f5bf380027?w=300&auto=format&fit=crop&q=60" },
  { name: "Masala Dosa", img: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=300&auto=format&fit=crop&q=60" },
  { name: "Paneer Tikka Roll", img: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=300&auto=format&fit=crop&q=60" },
  { name: "Cold Brew", img: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=300&auto=format&fit=crop&q=60" },
  { name: "Grilled Sandwich", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=300&auto=format&fit=crop&q=60" },
  { name: "Idli Vada Sambar", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=300&auto=format&fit=crop&q=60" },
  { name: "Hakka Noodles", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=300&auto=format&fit=crop&q=60" },
];

export default function MotionFoodBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      {/* 1. shadcn/ui Inspired Subtle Grid Overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-40 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black_80%)]" />

      {/* 2. Ambient Radial Glow Spheres */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-gradient-to-b from-amber-500/12 via-amber-500/[0.03] to-transparent rounded-full blur-3xl" />
      <div className="absolute top-[40%] -left-32 w-80 h-80 bg-cyan-500/[0.04] rounded-full blur-3xl" />
      <div className="absolute top-[60%] -right-32 w-80 h-80 bg-amber-500/[0.05] rounded-full blur-3xl" />

      {/* 3. Subtle Infinite Floating Marquee Stream in Hero Background (Low Opacity) */}
      <div className="absolute top-12 left-0 right-0 opacity-[0.07] rotate-[-2deg] scale-105 overflow-hidden py-4">
        <div className="flex gap-6 w-max animate-marquee-drift">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/[0.05] border border-white/10 shrink-0"
            >
              <img
                src={item.img}
                alt={item.name}
                className="w-12 h-12 rounded-xl object-cover grayscale contrast-125"
              />
              <span className="font-mono text-xs font-bold text-white tracking-wider uppercase">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute top-48 left-0 right-0 opacity-[0.05] rotate-[1.5deg] scale-105 overflow-hidden py-4">
        <div className="flex gap-6 w-max animate-marquee-drift-reverse">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/[0.05] border border-white/10 shrink-0"
            >
              <img
                src={item.img}
                alt={item.name}
                className="w-12 h-12 rounded-xl object-cover grayscale contrast-125"
              />
              <span className="font-mono text-xs font-bold text-white tracking-wider uppercase">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Ambient Floating Food Image Cards with Motion Drifting Physics */}
      <div className="hidden lg:block absolute inset-0">
        {FLOATING_FOODS.map((food, i) => (
          <div
            key={i}
            className={`absolute ${food.pos} ${food.floatClass} transition-opacity duration-700`}
            style={{ transform: `scale(${food.scale})` }}
          >
            <div className="relative group p-2 rounded-2xl bg-[#0e121d]/75 backdrop-blur-md border border-white/[0.08] shadow-2xl shadow-black/80 flex items-center gap-3 w-52 opacity-35 hover:opacity-80 transition-opacity">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-white/10">
                <img
                  src={food.img}
                  alt={food.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-xs truncate">
                  {food.name}
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-0.5">
                  <span className="text-amber-400 font-semibold">{food.prep}</span>
                  <span className="font-bold text-white">{food.price}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
