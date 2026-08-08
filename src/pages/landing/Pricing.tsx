import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import type { AppPage } from '../../lib/types';
import { ContactModal } from '../../components/ui/ContactModal';

const plans = [
  {
    name: 'Free',
    price: '0',
    period: '/mois',
    desc: 'Pour tester Resell OS sans engagement',
    why: 'Pour te faire une vraie idée, sans sortir la carte.',
    features: [
      '10 annonces IA / mois',
      '1 photo / annonce',
      'Prix recommandé par l\'IA',
      'Stock illimité',
      'Comptabilité de base',
    ],
    cta: 'Commencer gratuitement',
    ctaSub: 'Aucune carte bancaire requise',
    highlighted: false,
    action: 'signup' as const,
  },
  {
    name: 'Pro',
    price: '9,99',
    period: '/mois',
    desc: 'Pour les revendeurs qui vendent chaque semaine',
    why: 'Moins cher qu\'un café par semaine.',
    features: [
      'IA illimitée',
      'Jusqu\'à 10 photos / annonce',
      '3 niveaux de prix',
      'Opportunités Vinted en temps réel',
      'Historique illimité',
      'Export CSV',
    ],
    cta: 'Passer au Pro',
    ctaSub: 'Résiliable à tout moment, sans engagement',
    highlighted: true,
    action: 'signup' as const,
  },
  {
    name: 'Team',
    price: '29,99',
    period: '/mois / utilisateur',
    desc: 'Pour les petites équipes de revente',
    why: 'Le prix d\'un membre en plus, pour toute l\'équipe.',
    features: [
      'Tout le plan Pro',
      'Jusqu\'à 5 utilisateurs',
      'Analytiques d\'équipe',
      'Accès API',
      'Support prioritaire',
    ],
    cta: 'Contacter l\'équipe',
    ctaSub: 'Réponse sous 48h',
    highlighted: false,
    action: 'contact' as const,
  },
];

export function Pricing({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const [contactOpen, setContactOpen] = useState(false);

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
          {plans.map((plan) => (
            <div
              key={plan.name}
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
              <p className="text-sm text-gray-500 mb-4">{plan.desc}</p>
              <div className="mb-2">
                <span className="text-5xl font-black">{plan.price} €</span>
                <span className="text-gray-500 text-base">{plan.period}</span>
              </div>
              <p className="text-xs text-gray-500 mb-6">{plan.why}</p>
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
                  if (plan.action === 'contact') {
                    setContactOpen(true);
                    return;
                  }
                  sessionStorage.setItem('resellos:authMode', 'register');
                  onNavigate('auth');
                }}
                className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${plan.highlighted ? 'bg-neon-600 text-white hover:bg-neon-700 hover:shadow-[0_0_30px_rgba(124,92,255,0.3)]' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
              >
                {plan.cta}
                </button>
              <p className="text-center text-xs text-gray-600 mt-3">{plan.ctaSub}</p>
            </div>
          ))}
        </div>

        <div className="max-w-2xl mx-auto mt-16 flex items-start gap-3 bg-surface/50 border border-white/5 rounded-xl px-5 py-4">
          <ShieldCheck className="w-4 h-4 text-neon-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 leading-relaxed">
            Nos tarifs couvrent nos coûts réels d'hébergement et d'intelligence artificielle, pas une marge cachée.
            C'est aussi pour ça qu'ils n'ont pas bougé depuis le lancement.
          </p>
        </div>
      </div>

      {contactOpen && (
        <ContactModal
          onClose={() => setContactOpen(false)}
          title="Parlons de ton équipe"
          description="Explique-nous brièvement ton organisation et tes besoins. Nous te répondrons pour t'aider à choisir la meilleure configuration ResellOS."
          subject="Demande concernant le plan Team ResellOS"
          emailLabel="Adresse e-mail"
          showNameField
          showUserCountField
        />
      )}
    </section>
  );
}
