import { Zap } from 'lucide-react';

export function ProductPreview() {
  return (
    <section className="pt-24 pb-10 relative overflow-hidden">
      <div className="absolute inset-x-0 top-10 mx-auto h-72 w-[70%] bg-neon-500/10 blur-[140px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <p className="text-neon-500 font-bold text-sm tracking-[0.25em] mb-4">
            APERÇU DE LA PLATEFORME
          </p>

          <h2 className="text-4xl sm:text-6xl font-black tracking-tight leading-none">
            Un seul dashboard.
            <br />
            Toute votre activité.
          </h2>

          <p className="mt-6 text-gray-400 max-w-3xl mx-auto text-lg leading-8">
            Créez vos annonces, estimez vos prix, détectez les meilleures opportunités
            et pilotez votre business depuis une seule interface.
          </p>
        </div>

        <div className="relative rounded-[36px] border border-neon-500/25 bg-gradient-to-b from-[#1A1A1A] to-[#0B0B0B] p-3 shadow-[0_50px_140px_rgba(0,0,0,.7),0_0_80px_rgba(255,196,0,.08)] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_60px_160px_rgba(0,0,0,.8),0_0_120px_rgba(255,196,0,.12)]">
        <div className="absolute -inset-px rounded-[36px] bg-gradient-to-r from-transparent via-neon-500/30 to-transparent opacity-30 pointer-events-none" />
          <div className="rounded-[28px] border border-white/10 bg-black overflow-hidden">

            <div className="h-12 border-b border-white/10 flex items-center justify-between px-5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                <span className="w-3 h-3 rounded-full bg-neon-500/80" />
              </div>

              <div className="text-xs text-gray-500">
                app.resellos.com/dashboard
              </div>

              <div className="w-16" />
            </div>

            <div className="grid lg:grid-cols-[240px_1fr] min-h-[520px]">
              <aside className="hidden lg:block border-r border-white/10 p-6">
                <div className="flex items-center gap-3 mb-10">
                  <div className="w-9 h-9 rounded-xl bg-neon-500 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-black" />
                  </div>
                  <div className="font-black">
                    <span>Resell</span>
                    <span className="text-neon-500 ml-1">OS</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {["Dashboard", "Générateur IA", "Opportunités", "Stock", "Statistiques"].map((item, index) => (
                    <div
                      key={item}
                      className={`px-4 py-3 rounded-xl text-sm ${
                        index === 0
                          ? "bg-neon-500/10 text-neon-500"
                          : "text-gray-500"
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </aside>

              <div className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-8">
                  <div>
                    <h3 className="text-3xl sm:text-4xl font-black tracking-tight">
                      Bonjour, <span className="text-neon-500">jean</span>
                    </h3>
                    <p className="text-gray-500 mt-2">
                      Voici un aperçu de votre activité Resell OS.
                    </p>
                  </div>

                  <button className="bg-neon-500 text-black font-bold rounded-2xl px-5 py-3">
                    Nouvelle annonce
                  </button>
                </div>

                <div className="rounded-3xl bg-surface-alt border border-white/10 p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <div className="w-full">
          <p className="font-bold mb-3">Crédits restants</p>

          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full w-[40%] bg-gradient-to-r from-neon-500 to-white rounded-full" />
          </div>

          <p className="mt-4 text-3xl font-black">
            4 <span className="text-gray-500 text-lg font-medium">/10 ce mois</span>
          </p>
        </div>
      </div>
    </div>

    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                  {[
                    ["1", "Annonces générées"],
                    ["FREE", "Plan actuel"],
                    ["0", "Favoris"],
                    ["35 EUR", "Revenus estimés"],
                  ].map(([value, label]) => (
                    <div
                      key={label}
                      className="rounded-2xl bg-surface-alt border border-white/10 p-5"
                    >
                      <p className="text-2xl font-black">{value}</p>
                      <p className="text-gray-500 text-sm mt-2">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  {[
                    ["Générer une annonce", "Upload des photos et génère."],
                    ["Mes annonces", "Retrouve tes annonces sauvegardées."],
                    ["Statistiques", "Suis tes performances et revenus."],
                  ].map(([title, desc]) => (
                    <div
                      key={title}
                      className="rounded-2xl bg-surface-alt border border-white/10 p-5"
                    >
                      <h4 className="font-bold">{title}</h4>
                      <p className="text-gray-500 text-sm mt-2">{desc}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-surface-alt border border-white/10 p-5 flex items-center justify-between">
                  <div>
                    <p className="font-bold">Polo Ralph Lauren homme bleu marine taille L</p>
                    <p className="text-gray-500 text-sm mt-1">Ralph Lauren · 25 juin</p>
                  </div>
                  <p className="text-neon-500 font-black">35 EUR</p>
                  </div> {/* dernière carte */}

    </div> {/* contenu principal */}

    </div> {/* grid */}

    </div> {/* rounded-[28px] */}

    </div> {/* rounded-[36px] */}

    </div> {/* max-w-7xl */}

    </section>
  );
}
