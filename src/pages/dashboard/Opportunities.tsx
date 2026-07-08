import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Heart, RefreshCw, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { MarketOpportunity } from "../../lib/types";
import { StatCard } from "../../components/ui/StatCard";

type SortBy = "score" | "profit" | "roi" | "created_at" | "price_found";
type CategoryFilter = "all" | "Sneakers" | "Jackets" | "Sweat" | "Fleece" | "Jeans" | "Shoes";

const TIERS = [
  { min: 150, label: "Exceptionnel", className: "bg-neon-500 text-black" },
  { min: 100, label: "Excellent", className: "bg-neon-500/15 text-neon-500 border border-neon-500/30" },
  { min: 80, label: "Bon deal", className: "bg-blue-400/15 text-blue-400 border border-blue-400/30" },
  { min: 0, label: "Correct", className: "bg-white/10 text-gray-300 border border-white/10" },
];

function getTier(roi: number) {
  return TIERS.find((t) => roi >= t.min) ?? TIERS[TIERS.length - 1];
}

export default function Opportunities() {
  const [products, setProducts] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [minRoi, setMinRoi] = useState(false);
  const [minProfit, setMinProfit] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("market_opportunities")
      .select("*")
      .order(sortBy, { ascending: false });

    if (error) console.error(error);
    if (data) setProducts(data);

    setLoading(false);
  }, [sortBy]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  async function scanNow() {
    setLoading(true);
    await loadProducts();
    setLoading(false);
  }

  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (minRoi && Number(item.roi) < 100) return false;
      if (minProfit && Number(item.profit) < 40) return false;
      return true;
    });
  }, [products, category, minRoi, minProfit]);

  const stats = useMemo(() => {
    const count = filteredProducts.length;
    const avgProfit =
      count === 0
        ? 0
        : filteredProducts.reduce((sum, item) => sum + Number(item.profit || 0), 0) / count;

    const avgRoi =
      count === 0
        ? 0
        : filteredProducts.reduce((sum, item) => sum + Number(item.roi || 0), 0) / count;

    const bestProfit =
      count === 0
        ? 0
        : Math.max(...filteredProducts.map((item) => Number(item.profit || 0)));

    return {
      count,
      avgProfit: Math.round(avgProfit),
      avgRoi: Math.round(avgRoi),
      bestProfit: Math.round(bestProfit),
    };
  }, [filteredProducts]);

  const categories: CategoryFilter[] = [
    "all",
    "Sneakers",
    "Jackets",
    "Sweat",
    "Fleece",
    "Jeans",
    "Shoes",
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1">
            Scanner <span className="text-neon-500">Vinted</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Les meilleures opportunités détectées en temps réel.
          </p>
        </div>

        <button
          onClick={scanNow}
          disabled={loading}
          className="bg-neon-500 text-black px-6 py-3 rounded-xl font-bold flex gap-2 items-center justify-center disabled:opacity-50 hover:bg-neon-600 transition"
        >
          {loading ? <RefreshCw size={20} className="animate-spin" /> : <Search size={20} />}
          {loading ? "Scan..." : "Scanner maintenant"}
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard size="lg" label="Opportunités" value={stats.count} />
        <StatCard size="lg" label="Profit moyen" value={`+${stats.avgProfit}€`} />
        <StatCard size="lg" label="ROI moyen" value={`+${stats.avgRoi}%`} />
        <StatCard size="lg" label="Meilleur deal" value={`+${stats.bestProfit}€`} />
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${
                category === cat
                  ? "bg-neon-500 text-black border-neon-500"
                  : "bg-surface-alt text-gray-400 border-white/10 hover:text-white"
              }`}
            >
              {cat === "all" ? "Toutes" : cat}
            </button>
          ))}

          <button
            onClick={() => setMinRoi(!minRoi)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${
              minRoi
                ? "bg-neon-500 text-black border-neon-500"
                : "bg-surface-alt text-gray-400 border-white/10 hover:text-white"
            }`}
          >
            ROI +100%
          </button>

          <button
            onClick={() => setMinProfit(!minProfit)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${
              minProfit
                ? "bg-neon-500 text-black border-neon-500"
                : "bg-surface-alt text-gray-400 border-white/10 hover:text-white"
            }`}
          >
            Profit +40€
          </button>
        </div>

        <div className="flex bg-surface-alt border border-white/10 rounded-xl overflow-hidden">
          <SortButton label="Score" active={sortBy === "score"} onClick={() => setSortBy("score")} />
          <SortButton label="Profit" active={sortBy === "profit"} onClick={() => setSortBy("profit")} />
          <SortButton label="ROI" active={sortBy === "roi"} onClick={() => setSortBy("roi")} />
          <SortButton label="Prix" active={sortBy === "price_found"} onClick={() => setSortBy("price_found")} />
          <SortButton label="Récent" active={sortBy === "created_at"} onClick={() => setSortBy("created_at")} />
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="bg-surface-alt border border-white/10 rounded-2xl p-10 text-center">
          <h2 className="text-2xl font-black">Aucune opportunité</h2>
          <p className="text-gray-500 mt-2">Lance un scan ou modifie tes filtres.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-5">
          {filteredProducts.map((item) => (
            <OpportunityCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ item }: { item: MarketOpportunity }) {
  const roi = Number(item.roi || 0);
  const tier = getTier(roi);
  const favourites = item.favourites ?? 0;

  return (
    <div className="group bg-surface-alt rounded-2xl border border-white/5 hover:border-neon-500/40 hover:-translate-y-1 transition-all duration-300 overflow-hidden hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
      <div className="relative h-44 bg-dark-400 border-b border-white/10 overflow-hidden">
        <img
          src={item.image ?? undefined}
          alt={item.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className={`absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full ${tier.className}`}>
          {tier.label}
        </span>
        {favourites > 0 && (
          <span className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            <Heart className="w-3 h-3 fill-current" />
            {favourites}
          </span>
        )}
      </div>

      <div className="p-5">
        <h2 className="text-base font-black line-clamp-2 min-h-[48px]">{item.title}</h2>
        <p className="text-gray-500 text-sm mt-1">
          {item.brand} · {item.category}
        </p>

        <div className="flex items-center gap-2 mt-4 text-sm">
          <span className="text-gray-400 font-medium">{Number(item.price_found).toFixed(0)}€</span>
          <ArrowRight className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
          <span className="text-gray-200 font-semibold">{Number(item.market_price).toFixed(0)}€ estimés</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-dark-400 border border-white/5 rounded-xl p-3">
            <p className="text-gray-500 text-xs">Profit</p>
            <h3 className="text-neon-500 text-2xl font-black mt-1">
              +{Number(item.profit).toFixed(0)}€
            </h3>
          </div>
          <div className="bg-dark-400 border border-white/5 rounded-xl p-3">
            <p className="text-gray-500 text-xs">ROI</p>
            <h3 className="text-neon-500 text-2xl font-black mt-1">
              +{roi.toFixed(0)}%
            </h3>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1.5">
            <span>Score IA</span>
            <span>{Math.round(Number(item.score || 0))}/100</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-neon-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(Number(item.score || 0), 100)}%` }}
            />
          </div>
        </div>

        <p className="text-[11px] text-gray-600 mt-3">
          Confiance {item.confidence ?? "--"}% · {item.price_source ?? "estimation IA"}
        </p>

        <a
          href={item.vinted_url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="mt-4 bg-neon-500 text-black px-5 py-3 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-neon-600 hover:shadow-[0_0_20px_rgba(255,196,0,0.3)] transition-all"
        >
          Voir l'annonce
          <ArrowUpRight size={18} />
        </a>
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-bold transition ${
        active ? "bg-neon-500 text-black" : "text-gray-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
