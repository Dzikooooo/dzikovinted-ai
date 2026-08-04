import { MessageCircle, Sparkles, Eye, MessageSquare, Receipt } from 'lucide-react';

// Refonte complete (audit personnel utilisateur, 2026-08-01) : l'ancienne
// version reproduisait une capture d'ecran quasi complete du Dashboard
// (sidebar, anneaux, cartes, chiffres) -- trop dense, devoilait toute
// l'interface. Nouvelle version : uniquement 5 modules, presentation
// premium et volontairement mysterieuse (aucune capture d'ecran, aucune
// donnee chiffree), pour donner envie de decouvrir le produit plutot que
// de tout montrer avant l'inscription. Libelles/icones/description repris
// tels quels de la sidebar reelle (DashboardLayout.tsx) -- jamais de texte
// invente.
const MODULES = [
  { icon: MessageCircle, label: 'Communauté Discord' },
  { icon: Sparkles, label: 'Générateur IA' },
  { icon: Eye, label: 'Mes annonces', desc: 'Modifier, supprimer, surveiller le marché' },
  { icon: MessageSquare, label: 'Communication' },
  { icon: Receipt, label: 'Comptabilité' },
];

export function ProductPreview() {
  return (
    <section className="pt-16 pb-16 sm:pb-24 relative overflow-hidden">
      <div className="absolute inset-x-0 top-10 mx-auto h-72 w-[70%] bg-neon-500/10 blur-[140px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <p className="text-neon-500 font-bold text-sm tracking-[0.25em] mb-4">
            APERÇU DE LA PLATEFORME
          </p>

          <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-none">
            Une seule plateforme.
            <br />
            Tout votre business.
          </h2>

          <p className="mt-6 text-gray-400 max-w-3xl mx-auto text-lg leading-8">
            Tout ce qu'il faut pour gérer ton activité Vinted, sans changer d'outil.
          </p>
        </div>

        <div className="relative rounded-[36px] border border-neon-500/25 bg-gradient-to-b from-[#1A1A1A] to-[#0B0B0B] px-6 py-16 sm:px-16 sm:py-20 shadow-[0_50px_140px_rgba(0,0,0,.7),0_0_80px_rgba(124,92,255,.08)] overflow-hidden">
          <div className="absolute -inset-px rounded-[36px] bg-gradient-to-r from-transparent via-neon-500/30 to-transparent opacity-30 pointer-events-none" />
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(124,92,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(124,92,255,0.05) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />

          <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {MODULES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="group flex flex-col items-center text-center gap-4 transition-all duration-500 hover:-translate-y-2"
              >
                <div className="w-[72px] h-[72px] rounded-2xl bg-neon-500/10 border border-neon-500/20 flex items-center justify-center transition-all duration-500 group-hover:bg-neon-500/20 group-hover:shadow-[0_0_40px_rgba(124,92,255,0.35)]">
                  <Icon className="w-8 h-8 text-neon-500" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm sm:text-base">{label}</p>
                  {desc && <p className="text-gray-500 text-xs mt-1.5 max-w-[10rem] mx-auto leading-relaxed">{desc}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
