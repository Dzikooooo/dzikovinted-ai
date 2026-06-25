import { useEffect, useState } from "react";
import { Search, Clock, ArrowUpRight, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function Opportunities() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);

    const { data, error } = await supabase
      .from("market_opportunities")
      .select("*")
      .order("score", { ascending: false });

    if (!error && data) {
      setProducts(data);
    }

    setLoading(false);
  }

  const getBadge = (score: number) => {
    if (score >= 95) return "🔥 Excellent";
    if (score >= 85) return "🟢 Très bon";
    if (score >= 70) return "🟡 Correct";
    return "⚪ À surveiller";
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-5xl font-black">
            Scanner <span className="text-[#39FF14]">Vinted</span>
          </h1>
          <p className="text-gray-400 mt-2">
            Les meilleures opportunités détectées en temps réel.
          </p>
        </div>

        <button
          onClick={loadProducts}
          disabled={loading}
          className="bg-[#39FF14] text-black px-6 py-3 rounded-xl font-bold flex gap-2 items-center disabled:opacity-50"
        >
          {loading ? <RefreshCw size={20} className="animate-spin" /> : <Search size={20} />}
          {loading ? "Scan..." : "Scanner maintenant"}
        </button>
      </div>

      <div className="space-y-4">
        {products.map((item) => (
          <div
            key={item.id}
            className="bg-[#171717] rounded-2xl p-5 border border-white/5 hover:border-[#39FF14]/40 transition"
          >
            <div className="flex gap-5">
              <div className="w-32 h-32 rounded-2xl overflow-hidden bg-[#0A0A0A] border border-white/10 flex-shrink-0">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
              </div>

              <div className="flex-1">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold">{item.title}</h2>
                      <span className="bg-[#39FF14]/10 border border-[#39FF14]/20 text-[#39FF14] text-xs font-bold px-2.5 py-1 rounded-full">
                        Score {item.score}/100
                      </span>
                    </div>

                    <p className="text-gray-500 text-sm">
                      {item.brand} · {item.category}
                    </p>

                    <p className="text-[#39FF14] mt-3 font-semibold">
                      {getBadge(item.score)}
                    </p>
                  </div>

                  <a
                    href={item.vinted_url}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-[#39FF14] text-black px-5 py-2 rounded-xl font-bold flex items-center gap-2"
                  >
                    Voir
                    <ArrowUpRight size={18} />
                  </a>
                </div>

                <div className="grid grid-cols-5 gap-6 mt-8">
                  <div>
                    <p className="text-gray-500 text-sm">Prix trouvé</p>
                    <h3 className="text-3xl font-bold">{item.price_found}€</h3>
                  </div>

                  <div>
                    <p className="text-gray-500 text-sm">Valeur marché</p>
                    <h3 className="text-3xl font-bold">{item.market_price}€</h3>
                  </div>

                  <div>
                    <p className="text-gray-500 text-sm">Profit</p>
                    <h3 className="text-[#39FF14] text-3xl font-black">+{item.profit}€</h3>
                  </div>

                  <div>
                    <p className="text-gray-500 text-sm">ROI</p>
                    <h3 className="text-[#39FF14] text-3xl font-black">+{item.roi}%</h3>
                  </div>

                  <div>
                    <p className="text-gray-500 text-sm">Publié</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Clock size={16} />
                      Live
                    </div>
                  </div>
                </div>

                <div className="mt-5 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#39FF14] rounded-full"
                    style={{ width: `${Math.min(item.score, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
