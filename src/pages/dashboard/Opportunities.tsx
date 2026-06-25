import { useEffect, useState } from "react";
import { Search, Clock, ArrowUpRight, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function Opportunities() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [sortBy, setSortBy] = useState<
    "score" | "profit" | "roi" | "created_at"
  >("score");

  useEffect(() => {
    loadProducts();
  }, [sortBy]);

  async function loadProducts() {
    setLoading(true);

    const { data } = await supabase
      .from("market_opportunities")
      .select("*")
      .order(sortBy, { ascending: false });

    if (data) {
      setProducts(data);
    }

    setLoading(false);
  }
 const getBadge = (score: number) => {
  if (score >= 95) return "Excellent";
  if (score >= 85) return "Très bon";
  if (score >= 70) return "Correct";
  return "À surveiller";
};
  async function scanNow() {
    setLoading(true);

    const { data } = await supabase
      .from("market_opportunities")
      .insert({
        title: "Adidas Samba",
        brand: "Adidas",
        category: "Chaussures",
        image: "https://images.unsplash.com/photo-1549298916-b41d501d3772",
        price_found: 32,
        market_price: 75,
        profit: 43,
        roi: 134,
        score: 94,
        vinted_url: "https://www.vinted.fr",
        status: "live",
      })
      .select();

  if (data) {
  await loadProducts();
}

setLoading(false);

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

       <div className="flex items-center gap-3">

  <div className="flex bg-[#171717] border border-white/10 rounded-xl overflow-hidden">

    <button
      onClick={() => setSortBy("score")}
      className={`px-4 py-3 text-sm font-semibold transition ${
        sortBy === "score"
          ? "bg-[#39FF14] text-black"
          : "text-gray-400 hover:text-white"
      }`}
    >
      Score IA
    </button>

    <button
      onClick={() => setSortBy("profit")}
      className={`px-4 py-3 text-sm font-semibold transition ${
        sortBy === "profit"
          ? "bg-[#39FF14] text-black"
          : "text-gray-400 hover:text-white"
      }`}
    >
      Profit
    </button>

    <button
      onClick={() => setSortBy("roi")}
      className={`px-4 py-3 text-sm font-semibold transition ${
        sortBy === "roi"
          ? "bg-[#39FF14] text-black"
          : "text-gray-400 hover:text-white"
      }`}
    >
      ROI
    </button>

    <button
      onClick={() => setSortBy("created_at")}
      className={`px-4 py-3 text-sm font-semibold transition ${
        sortBy === "created_at"
          ? "bg-[#39FF14] text-black"
          : "text-gray-400 hover:text-white"
      }`}
    >
      Récent
    </button>

  </div>

  <button
    onClick={scanNow}
    disabled={loading}
    className="bg-[#39FF14] text-black px-6 py-3 rounded-xl font-bold flex gap-2 items-center disabled:opacity-50 hover:bg-[#50ff30] transition"
  >
    {loading ? (
      <RefreshCw size={20} className="animate-spin" />
    ) : (
      <Search size={20} />
    )}

    {loading ? "Scan..." : "Scanner maintenant"}
  </button>

</div>
      </div>

      <div className="space-y-4">
        {products.map((item) => (
          <div
            key={item.id}
            className="bg-[#171717] rounded-2xl p-5 border border-white/5 hover:border-[#39FF14]/40 transition"
          >
            <div className="flex flex-col lg:flex-row gap-5">
              <div className="w-full lg:w-32 h-48 lg:h-32 rounded-2xl overflow-hidden bg-[#0A0A0A] border border-white/10 flex-shrink-0">
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

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6 mt-8">
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
