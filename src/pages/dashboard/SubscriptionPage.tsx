import { Check, Zap, Crown, ShoppingBag, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const plans = [
  {
    name: 'Free',
    icon: Zap,
    price: '0',
    period: '/mois',
    desc: 'Pour découvrir Resell OS',
    features: ['10 analyses par mois', '1 photo par annonce', 'Titre + description', 'Prix recommandé', 'Historique 7 jours'],
    plan: 'free',
    highlighted: false,
  },
  {
    name: 'Pro',
    icon: Crown,
    price: '9,99',
    period: '/mois',
    desc: 'Pour les revendeurs actifs',
    features: ['Analyses illimitées', '10 photos par annonce', 'Tout le plan Free', '3 niveaux de prix', 'Filtres Vinted complets', 'Mots-clés SEO', 'Historique illimité', 'Export CSV'],
    plan: 'pro',
    highlighted: true,
  },
  {
    name: 'Team',
    icon: ShoppingBag,
    price: '29,99',
    period: '/mois',
    desc: 'Pour les équipes',
    features: ['Tout le plan Pro', "Jusqu'à 5 utilisateurs", 'Analytiques avancées', 'Mode batch', 'API access', 'Support prioritaire'],
    plan: 'team',
    highlighted: false,
  },
];

export default function SubscriptionPage() {
  const { profile } = useAuth();
  const currentPlan = profile?.plan ?? 'free';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black mb-2">Abonnement</h1>
        <p className="text-gray-400 text-sm">Tu es sur le plan <span className={`font-bold ${currentPlan === 'pro' || currentPlan === 'team' ? 'text-neon-500' : 'text-gray-300'}`}>{currentPlan.toUpperCase()}</span>.</p>
      </div>

      {/* Current plan banner */}
      <div className="bg-surface border border-neon-500/20 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-neon-500" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm">Plan {currentPlan.toUpperCase()} actif</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {currentPlan === 'free' ? 'Passe au Pro pour des analyses illimitées et plus de fonctionnalités.' : 'Tu bénéficies de toutes les fonctionnalités premium.'}
          </p>
        </div>
        {currentPlan !== 'free' && (
          <button disabled className="flex items-center gap-2 text-sm text-gray-600 border border-white/5 px-4 py-2 rounded-xl cursor-not-allowed">
            <ExternalLink className="w-4 h-4" />
            Facturation bientôt disponible
          </button>
        )}
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = plan.plan === currentPlan;
          return (
            <div key={plan.name} className={`relative bg-surface border rounded-2xl p-7 flex flex-col transition-all duration-300 hover:-translate-y-1 ${plan.highlighted ? 'border-neon-500/30 shadow-[0_0_50px_rgba(255,196,0,0.08)] md:scale-105' : isCurrent ? 'border-neon-500/20' : 'border-white/5'}`}>
              {plan.highlighted && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-neon-500 text-black text-xs font-bold px-4 py-1 rounded-full">Le plus populaire</div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white/10 text-white text-xs font-semibold px-4 py-1 rounded-full border border-white/10">Plan actuel</div>
              )}
              <div className="mb-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${plan.highlighted ? 'bg-neon-500/15' : 'bg-white/5'}`}>
                  <Icon className={`w-5 h-5 ${plan.highlighted ? 'text-neon-500' : 'text-gray-400'}`} />
                </div>
                <h3 className="text-lg font-black mb-1">{plan.name}</h3>
                <p className="text-xs text-gray-500">{plan.desc}</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-black">{plan.price} €</span>
                <span className="text-gray-500 text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-2.5 flex-1 mb-7">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-neon-500' : 'text-gray-600'}`} />
                    <span className="text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                disabled
                className="w-full py-3 rounded-xl font-semibold text-sm bg-white/5 text-gray-500 cursor-not-allowed"
              >
                {isCurrent ? 'Plan actuel' : 'Bientôt disponible'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-600 mt-8">Paiement en ligne bientôt disponible · Pas de carte nécessaire pour le plan Free</p>
    </div>
  );
}
