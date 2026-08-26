import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import type { AppPage } from '../../lib/types';
import { PURCHASABLE_PLANS } from '../../lib/plans';
import { BillingIntervalToggle } from '../../components/ui/BillingIntervalToggle';
import type { BillingInterval } from '../../lib/billingInterval';

// Copie marketing propre a cette page (desc/why/CTA) -- les chiffres reels
// (prix, credits, features) viennent exclusivement de src/lib/plans.ts,
// source unique depuis le Lot 5 (freeze beta 2026-08-08). Les 3 plans
// menent desormais au meme flow d'inscription : Team n'est plus "contacter
// l'equipe" (decision produit 2026-08-08 -- pas de mode multi-utilisateur
// reel a vendre, donc pas de vente assistee non plus, un simple abonnement
// comme Pro).
const PLAN_COPY: Record<'pro' | 'team', { desc: string; why: string; ctaSub: string }> = {
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
  const [interval, setInterval] = useState<BillingInterval>('month');
  const annual = interval === 'year';

  return (
    <section id="pricing" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl sm:text-5xl font-black mb-4 text-gray-900">Des tarifs simples et transparents</h2>
          <p className="text-gray-600 text-lg mb-8">
            Commence gratuitement, passe à Pro uniquement quand ResellOS te fait réellement gagner du temps.
          </p>
          <BillingIntervalToggle value={interval} onChange={setInterval} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-3xl mx-auto items-stretch">
          {PURCHASABLE_PLANS.map((plan) => {
            const copy = PLAN_COPY[plan.id as 'pro' | 'team'];
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-8 flex flex-col border ${
                  plan.highlighted
                    ? 'bg-white md:scale-110 z-10'
                    : 'bg-gray-50 border-gray-200'
                }`}
                style={plan.highlighted ? { borderColor: '#00778266' } : undefined}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-white text-xs font-bold px-4 py-1 rounded-full" style={{ backgroundColor: '#007782' }}>Le plus populaire</div>
                )}
                <h3 className="text-xl font-bold mb-1 text-gray-900">{plan.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{copy.desc}</p>
                <div className="mb-2">
                  <span className="text-5xl font-black text-gray-900">
                    {annual ? plan.priceAnnualMonthlyDisplay : plan.priceDisplay} €
                  </span>
                  <span className="text-gray-600 text-base">/mois</span>
                </div>
                {/* Le prix EQUIVALENT MENSUEL en gros, le debit reel en petit --
                    jamais l'inverse : c'est le mensuel qui se compare d'une
                    offre a l'autre. L'economie exacte en euros accompagne le
                    badge "2 mois offerts", qui sous-estime la remise (-20 %
                    vaut 2,4 mois) : le chiffre affiche, lui, est exact. */}
                {annual ? (
                  <p className="text-xs text-gray-600 mb-6">
                    Facturé {plan.priceAnnualTotalDisplay} € par an — tu économises {plan.annualSavingDisplay} €
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 mb-6">{copy.why}</p>
                )}
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[15px]">
                      <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: plan.highlighted ? '#007782' : '#9CA3AF' }} />
                      <span className="text-gray-700">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    sessionStorage.setItem('resellos:authMode', 'register');
                    onNavigate('auth');
                  }}
                  className={`w-full py-4 rounded-2xl font-bold text-base transition-colors duration-300 ${plan.highlighted ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  style={plan.highlighted ? { backgroundColor: '#007782' } : undefined}
                >
                  Passer au {plan.name}
                </button>
                <p className="text-center text-xs text-gray-600 mt-3">{copy.ctaSub}</p>
              </div>
            );
          })}
        </div>

        <div className="max-w-2xl mx-auto mt-16 flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
          <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#007782' }} />
          <p className="text-xs text-gray-500 leading-relaxed">
            Nos tarifs couvrent nos coûts réels d'hébergement et d'intelligence artificielle, pas une marge cachée.
            C'est aussi pour ça qu'ils n'ont pas bougé depuis le lancement.
          </p>
        </div>
      </div>
    </section>
  );
}
