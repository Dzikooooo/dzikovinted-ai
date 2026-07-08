import { useEffect, useMemo, useState } from "react";
import { Search, ArrowUpRight, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { MarketOpportunity } from "../../lib/types";
import { StatCard } from "../../components/ui/StatCard";

type SortBy = "score" | "profit" | "roi" | "created_at" | "price_found";
type CategoryFilter = "all" | "Sneakers" | "Jackets" | "Sweat" | "Fleece" | "Jeans" | "Shoes";

export default function Opportunities() {
  const [products, setProducts] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [minRoi, setMinRoi] = useState(false);
  const [minProfit, setMinProfit] = useState(false);

  useEffect(() => {
    loadProducts();
  }, [sortBy]);

  async function loadProducts() {
    setLoading(true);

    const { data, error } = await supabase
      .from("market_opportunities")
      .select("*")
      .order(sortBy, { ascending: false });

    if (error) console.error(error);
    if (data) setProducts(data);

    setLoading(false);
  }

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

  const getBadge = (roi: number) => {
    if (roi >= 150) return "Exceptionnel";
    if (roi >= 100) return "Excellent";
    if (roi >= 80) return "Bon deal";
    return "Correct";
  };

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
            <div
              key={item.id}
              className="bg-surface-alt rounded-2xl border border-white/5 hover:border-neon-500/40 transition overflow-hidden"
            >
              <div className="h-44 bg-dark-400 border-b border-white/10">
                <img
                  src={item.image ?? undefined}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                  <h2 className="text-base font-black line-clamp-2 min-h-[48px]">
                      {item.title}
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                      {item.brand} · {item.category}
                    </p>
                  </div>

                  <span className="bg-neon-500/10 border border-neon-500/20 text-neon-500 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
  ROI {Number(item.roi).toFixed(0)}%
</span>
                </div>

                <span className="inline-flex mt-4 bg-neon-500/10 border border-neon-500/20 text-neon-500 text-xs font-bold px-2.5 py-1 rounded-full">
                  {getBadge(Number(item.roi))}
                </span>

                <div className="grid grid-cols-2 gap-3 mt-5">
  <Metric
    label="Prix"
    value={`${Number(item.price_found).toFixed(0)}€`}
  />

  <Metric
    label="Valeur"
    value={`${Number(item.market_price).toFixed(0)}€`}
  />

  <Metric
    label="Profit"
    value={`+${Number(item.profit).toFixed(0)}€`}
    green
  />

  <Metric
    label="ROI"
    value={`+${Number(item.roi).toFixed(0)}%`}
    green
  />

  <Metric
    label="Confiance"
    value={`${item.confidence ?? "--"}%`}
  />

  <Metric
    label="Source"
    value={item.price_source ?? "IA"}
  />
</div>

                <div className="mt-5 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-neon-500 rounded-full"
                    style={{ width: `${Math.min(Number(item.score || 0), 100)}%` }}
                  />
                </div>

                <a
                  href={item.vinted_url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 bg-neon-500 text-black px-5 py-3 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-neon-600 transition"
                >
                  Voir l’annonce
                  <ArrowUpRight size={18} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
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

function Metric({
  label,
  value,
  green = false,
}: {
  label: string;
  value: string | number;
  green?: boolean;
}) {
  return (
    <div className="bg-dark-400 border border-white/5 rounded-xl p-3">
      <p className="text-gray-500 text-xs">{label}</p>
      <h3 className={`${green ? "text-neon-500" : "text-white"} text-2xl font-black mt-1`}>
      {value}
      </h3>
    </div>
  );
}
