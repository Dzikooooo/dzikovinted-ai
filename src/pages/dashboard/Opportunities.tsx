import {
  Search,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Flame,
} from "lucide-react";

const products = [
  {
    name: "Nike Shox TL",
    buy: "38€",
    market: "95€",
    profit: "+57€",
    roi: "+150%",
    time: "18 sec",
    badge: "🔥 Ultra rentable",
  },
  {
    name: "Ralph Lauren Zip",
    buy: "24€",
    market: "55€",
    profit: "+31€",
    roi: "+129%",
    time: "1 min",
    badge: "⚡ Très demandé",
  },
  {
    name: "Carhartt Detroit",
    buy: "70€",
    market: "120€",
    profit: "+50€",
    roi: "+71%",
    time: "3 min",
    badge: "💰 Bon ROI",
  },
  {
    name: "Stüssy Hoodie",
    buy: "42€",
    market: "80€",
    profit: "+38€",
    roi: "+90%",
    time: "6 min",
    badge: "📈 Monte",
  },
];

export default function Opportunities() {
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

        <button className="bg-[#39FF14] text-black px-6 py-3 rounded-xl font-bold flex gap-2 items-center">
          <Search size={20}/>
          Scanner maintenant
        </button>

      </div>

      <div className="space-y-4">

        {products.map((item,index)=>(
          <div
            key={index}
            className="bg-[#171717] rounded-2xl p-6 border border-white/5 hover:border-[#39FF14]/40 transition"
          >

            <div className="flex justify-between items-center">

              <div>

                <h2 className="text-2xl font-bold">
                  {item.name}
                </h2>

                <p className="text-[#39FF14] mt-2">
                  {item.badge}
                </p>

              </div>

              <button className="bg-[#39FF14] text-black px-5 py-2 rounded-xl font-bold flex items-center gap-2">
                Voir
                <ArrowUpRight size={18}/>
              </button>

            </div>

            <div className="grid grid-cols-5 gap-6 mt-8">

              <div>
                <p className="text-gray-500 text-sm">Prix trouvé</p>
                <h3 className="text-3xl font-bold">
                  {item.buy}
                </h3>
              </div>

              <div>
                <p className="text-gray-500 text-sm">Valeur marché</p>
                <h3 className="text-3xl font-bold">
                  {item.market}
                </h3>
              </div>

              <div>
                <p className="text-gray-500 text-sm">Profit</p>
                <h3 className="text-[#39FF14] text-3xl font-black">
                  {item.profit}
                </h3>
              </div>

              <div>
                <p className="text-gray-500 text-sm">ROI</p>
                <h3 className="text-[#39FF14] text-3xl font-black">
                  {item.roi}
                </h3>
              </div>

              <div>
                <p className="text-gray-500 text-sm">Publié</p>

                <div className="flex items-center gap-2 mt-2">
                  <Clock size={16}/>
                  {item.time}
                </div>

              </div>

            </div>

          </div>
        ))}

      </div>

    </div>
  );
}
