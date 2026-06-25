import {
  TrendingUp,
  Flame,
  Shirt,
  Euro,
  Activity,
  ArrowUpRight,
  Eye,
} from "lucide-react";

const trends = [
  {
    name: "Ralph Lauren Zip",
    price: "45€",
    sales: "+132%",
    badge: "🔥 Très demandé",
  },
  {
    name: "Nike Shox",
    price: "95€",
    sales: "+89%",
    badge: "📈 Explosion",
  },
  {
    name: "Carhartt Detroit",
    price: "120€",
    sales: "+61%",
    badge: "💰 Rentable",
  },
  {
    name: "Stüssy Hoodie",
    price: "80€",
    sales: "+57%",
    badge: "⚡ Rapide",
  },
];

import type { DashboardPage } from "../../lib/types";

export default function Market({
  setActivePage,
}: {
  setActivePage: React.Dispatch<React.SetStateAction<DashboardPage>>;
}) {
  
  return (
    <div className="p-8 space-y-8">

      <div>
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-8 h-8 text-[#39FF14]" />
          <h1 className="text-4xl font-black">
            Marché <span className="text-[#39FF14]">Vinted</span>
          </h1>
        </div>

        <p className="text-gray-400">
          Analyse en temps réel des meilleures opportunités.
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">

        <div className="bg-[#151515] rounded-2xl p-6 border border-white/5">
          <Flame className="text-[#39FF14] mb-3" />
          <div className="text-3xl font-black">24</div>
          <p className="text-gray-400">Produits tendance</p>
        </div>

        <div className="bg-[#151515] rounded-2xl p-6 border border-white/5">
          <Euro className="text-[#39FF14] mb-3" />
          <div className="text-3xl font-black">67€</div>
          <p className="text-gray-400">Prix moyen gagnant</p>
        </div>

        <div className="bg-[#151515] rounded-2xl p-6 border border-white/5">
          <Activity className="text-[#39FF14] mb-3" />
          <div className="text-3xl font-black">+84%</div>
          <p className="text-gray-400">Demande moyenne</p>
        </div>

        <div className="bg-[#151515] rounded-2xl p-6 border border-white/5">
          <Eye className="text-[#39FF14] mb-3" />
          <div className="text-3xl font-black">Live</div>
          <p className="text-gray-400">Marché surveillé</p>
        </div>

      </div>

      <div className="bg-[#151515] rounded-2xl border border-white/5">

        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>

            <h2 className="text-2xl font-bold">
              Produits les plus rentables
            </h2>

            <p className="text-gray-400">
              Les meilleures opportunités actuellement.
            </p>

          </div>

        </div>

        <div className="divide-y divide-white/5">

          {trends.map((item) => (

            <div
              key={item.name}
              className="flex items-center justify-between p-6 hover:bg-white/[0.02] transition"
            >

              <div className="flex items-center gap-4">

                <div className="w-12 h-12 rounded-xl bg-[#39FF14]/10 flex items-center justify-center">
                  <Shirt className="text-[#39FF14]" />
                </div>

                <div>

                  <div className="font-semibold text-lg">
                    {item.name}
                  </div>

                  <div className="text-gray-500">
                    {item.badge}
                  </div>

                </div>

              </div>

              <div className="text-right">

                <div className="font-bold text-xl">
                  {item.price}
                </div>

                <div className="text-[#39FF14] font-semibold">
                  {item.sales}
                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

      <div className="bg-gradient-to-r from-[#39FF14]/10 to-transparent rounded-2xl border border-[#39FF14]/20 p-8">

        <h2 className="text-3xl font-black mb-3">

          🚀 Bientôt disponible

        </h2>

        <p className="text-gray-300 mb-6 max-w-2xl">

          Resell OS analysera automatiquement tout Vinted afin de détecter :

        </p>

        <div className="grid md:grid-cols-2 gap-4">

          <div>✅ Marques qui explosent</div>

          <div>✅ Produits qui se vendent le plus vite</div>

          <div>✅ Evolution des prix heure par heure</div>

          <div>✅ Alertes de bonnes affaires</div>

          <div>✅ Catégories en hausse</div>

          <div>✅ IA qui prédit les prochaines tendances</div>

        </div>
        
<button
  type="button"
  onClick={() => onNavigate("opportunities")}
  className="mt-8 bg-[#39FF14] text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:scale-105 transition"
>
  Voir les opportunités
  <ArrowUpRight size={20} />
</button>

      </div>

    </div>
  );
}
