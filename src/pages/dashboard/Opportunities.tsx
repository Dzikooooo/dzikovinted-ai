import { useEffect, useState } from "react";
import { Search, Clock, ArrowUpRight } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function Opportunities() {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

 async function loadProducts() {
  const { data, error } = await supabase
    .from("market_opportunities")
    .select("*")
    .order("roi", { ascending: false });

  console.log("DATA :", data);
  console.error("ERROR :", error);

  if (!error && data) {
    setProducts(data);
  }
}

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
          <Search size={20} />
          Scanner maintenant
        </button>
      </div>

      <div className="space-y-4">

        {products.map((item) => (

          <div
            key={item.id}
            className="bg-[#171717] rounded-2xl p-6 border border-white/5 hover:border-[#39FF14]/40 transition"
          >

            <div className="flex justify-between items-center">

              <div>

                <h2 className="text-2xl font-bold">
                  {item.title}
                </h2>

                <p className="text-[#39FF14] mt-2">
                  🔥 Score {item.score}
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
                <h3 className="text-3xl font-bold">
                  {item.price_found}€
                </h3>
              </div>

              <div>
                <p className="text-gray-500 text-sm">Valeur marché</p>
                <h3 className="text-3xl font-bold">
                  {item.market_price}€
                </h3>
              </div>

              <div>
                <p className="text-gray-500 text-sm">Profit</p>
                <h3 className="text-[#39FF14] text-3xl font-black">
                  +{item.profit}€
                </h3>
              </div>

              <div>
                <p className="text-gray-500 text-sm">ROI</p>
                <h3 className="text-[#39FF14] text-3xl font-black">
                  +{item.roi}%
                </h3>
              </div>

              <div>
                <p className="text-gray-500 text-sm">Publié</p>

                <div className="flex items-center gap-2 mt-2">
                  <Clock size={16} />
                  Live
                </div>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}
