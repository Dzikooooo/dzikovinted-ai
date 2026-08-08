import { Check, ShieldCheck } from 'lucide-react';
import type { AppPage } from '../../lib/types';
import { PLAN_LIST, type PlanDefinition } from '../../lib/plans';

// Copie marketing propre a cette page (desc/why/CTA) -- les chiffres reels
// (prix, credits, features) viennent exclusivement de src/lib/plans.ts,
// source unique depuis le Lot 5 (freeze beta 2026-08-08). Les 3 plans
// menent desormais au meme flow d'inscription : Team n'est plus "contacter
// l'equipe" (decision produit 2026-08-08 -- pas de mode multi-utilisateur
// reel a vendre, donc pas de vente assistee non plus, un simple abonnement
// comme Pro).
const PLAN_COPY: Record<PlanDefinition['id'], { desc: string; why: string; ctaSub: string }> = {
  free: {
    desc: 'Pour tester Resell OS sans engagement',
    why: 'Pour te faire une vraie idée, sans sortir la carte.',
    ctaSub: 'Aucune carte bancaire requise',
  },
  pro: {
    desc: 'Pour les revendeurs qui vendent chaque semaine',
    why: "Moins cher qu'un café par semaine.",
    ctaSub: 'Résiliable à tout moment, sans engagement',
  },
  team: {
    desc: 'Pour les revendeurs qui veulent tout, sans limite',
    why: 'Le plan le plus complet de ResellOS.',
    ctaSub: 'Résiliable à tout moment, sans engagement',
  },
};

export function Pricing({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section id="pricing" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl sm:text-5xl font-black mb-4">Des tarifs simples et transparents</h2>
          <p className="text-gray-400 text-lg">
            Commence gratuitement, passe à Pro uniquement quand ResellOS te fait réellement gagner du temps.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto items-stretch">
          {PLAN_LIST.map((plan) => {
            const copy = PLAN_COPY[plan.id];
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-8 flex flex-col border transition-all duration-300 hover:-translate-y-1 ${
                  plan.highlighted
                    ? 'bg-gradient-to-b from-surface to-surface-alt border-neon-500/40 shadow-[0_20px_70px_rgba(124,92,255,0.18)] md:scale-110 z-10'
                    : 'bg-surface border-white/5'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-neon-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-[0_4px_16px_rgba(124,92,255,0.4)]">Le plus populaire</div>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{copy.desc}</p>
                <div className="mb-2">
                  <span className="text-5xl font-black">{plan.priceDisplay} €</span>
                  <span className="text-gray-500 text-base">/mois</span>
                </div>
                <p className="text-xs text-gray-500 mb-6">{copy.why}</p>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[15px]">
                      <Check className={`w-5 h-5 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-neon-500' : 'text-gray-600'}`} />
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    sessionStorage.setItem('resellos:authMode', 'register');
                    onNavigate('auth');
                  }}
                  className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${plan.highlighted ? 'bg-neon-600 text-white hover:bg-neon-700 hover:shadow-[0_0_30px_rgba(124,92,255,0.3)]' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                >
                  {plan.id === 'free' ? 'Commencer gratuitement' : `Passer au ${plan.name}`}
                </button>
                <p className="text-center text-xs text-gray-600 mt-3">{copy.ctaSub}</p>
              </div>
            );
          })}
        </div>

        <div className="max-w-2xl mx-auto mt-16 flex items-start gap-3 bg-surface/50 border border-white/5 rounded-xl px-5 py-4">
          <ShieldCheck className="w-4 h-4 text-neon-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 leading-relaxed">
            Nos tarifs couvrent nos coûts réels d'hébergement et d'intelligence artificielle, pas une marge cachée.
            C'est aussi pour ça qu'ils n'ont pas bougé depuis le lancement.
          </p>
        </div>
      </div>
    </section>
  );
}
