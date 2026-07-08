import { Check } from 'lucide-react';
import type { AppPage } from '../../lib/types';

const plans = [
  {
    name: 'Free',
    price: '0',
    period: '/mois',
    desc: 'Pour découvrir',
    features: ['10 analyses par mois', '1 photo par annonce', 'Titre + description', 'Prix recommandé', 'Historique 7 jours'],
    cta: 'Commencer gratuitement',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '9,99',
    period: '/mois',
    desc: 'Pour les revendeurs actifs',
    features: ['Analyses illimitées', '10 photos par annonce', 'Tout le plan Free', 'Estimation IA des prix', 'Filtres marketplace avancés', 'Mots-clés SEO', 'Historique illimité', 'Export CSV'],
    cta: 'Démarrer le Pro',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '29,99',
    period: '/mois',
    desc: 'Pour les équipes',
    features: ['Tout le plan Pro', 'Jusqu\'à 5 utilisateurs', 'Analytiques avancées', 'Mode batch', 'API access', 'Support prioritaire'],
    cta: 'Contacter l\'équipe',
    highlighted: false,
  },
];

export function Pricing({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Des tarifs simples et transparents</h2>
          <p className="text-gray-400">Commence gratuitement. Évolue quand tu veux. Pas de surprise.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div key={plan.name} className={`relative rounded-2xl p-8 flex flex-col border transition-all duration-300 hover:-translate-y-1 ${plan.highlighted ? 'bg-surface border-neon-500/30 shadow-[0_0_60px_rgba(255,196,0,0.08)] md:scale-105' : 'bg-surface border-white/5'}`}>
              {plan.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-neon-500 text-black text-xs font-bold px-4 py-1 rounded-full">Le plus populaire</div>
              )}
              <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
              <p className="text-xs text-gray-500 mb-4">{plan.desc}</p>
              <div className="mb-6">
                <span className="text-4xl font-black">{plan.price} €</span>
                <span className="text-gray-500 text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-neon-500' : 'text-gray-600'}`} />
                    <span className="text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onNavigate('auth')}
                className={`w-full py-3 rounded-2xl
transition-all duration-300
hover:scale-[1.02]
active:scale-[0.98] font-semibold text-sm transition-all duration-200 ${plan.highlighted ? 'bg-neon-500 text-black hover:bg-neon-600 hover:shadow-[0_0_30px_rgba(255,196,0,0.3)]' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
              >
                {plan.cta}
                </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
