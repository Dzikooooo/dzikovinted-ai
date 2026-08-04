import { useState } from 'react';
import { Check, Zap, Crown, ShoppingBag, ExternalLink, Receipt, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { ContactModal } from '../../components/ui/ContactModal';

const plans = [
  {
    name: 'Free',
    icon: Zap,
    price: '0',
    period: '/mois',
    desc: 'Pour découvrir Resell OS',
    features: ['10 annonces IA par mois', '1 photo par annonce', 'Titre + description', 'Prix recommandé', 'Historique 7 jours'],
    plan: 'free',
    highlighted: false,
  },
  {
    name: 'Pro',
    icon: Crown,
    price: '9,99',
    period: '/mois',
    desc: 'Pour les revendeurs actifs',
    features: ['Annonces IA illimitées', '10 photos par annonce', 'Tout le plan Free', '3 niveaux de prix', 'Filtres Vinted complets', 'Mots-clés SEO', 'Historique illimité', 'Export CSV'],
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
  // P0-4 (2026-08-04) : la landing traite deja Team comme "contacter
  // l'equipe, pas un achat immediat" (Pricing.tsx, meme ContactModal) --
  // ici la carte Team affichait "Bientot disponible" desactive, sans aucun
  // moyen d'agir, alors qu'un utilisateur deja connecte et interesse par
  // Team est justement le public le plus probable a vouloir le faire. Meme
  // verite produit des deux cotes desormais : pas d'achat immediat promis
  // nulle part, mais un vrai chemin de contact partout.
  const [teamContactOpen, setTeamContactOpen] = useState(false);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Abonnement"
        description={<>Tu es sur le plan <span className={`font-bold ${currentPlan === 'pro' || currentPlan === 'team' ? 'text-neon-500' : 'text-gray-300'}`}>{currentPlan.toUpperCase()}</span>.</>}
      />

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
        {currentPlan === 'free' ? (
          <Button onClick={() => document.getElementById('pro-plan')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            Passer au Pro
          </Button>
        ) : (
          <Button variant="secondary" disabled icon={<ExternalLink className="w-4 h-4" />}>
            Facturation bientôt disponible
          </Button>
        )}
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = plan.plan === currentPlan;
          return (
            <div
              key={plan.name}
              id={plan.plan === 'pro' ? 'pro-plan' : undefined}
              className={`relative bg-surface border rounded-2xl p-7 flex flex-col transition-all duration-300 hover:-translate-y-1 ${plan.highlighted ? 'border-neon-500/30 shadow-[0_0_50px_rgba(124,92,255,0.08)] md:scale-105' : isCurrent ? 'border-neon-500/20' : 'border-white/5'}`}
            >
              {plan.highlighted && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-neon-600 text-white text-xs font-bold px-4 py-1 rounded-full">Le plus populaire</div>
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
              {isCurrent ? (
                <Button variant="secondary" disabled fullWidth>
                  Plan actuel
                </Button>
              ) : plan.plan === 'team' ? (
                <Button variant="secondary" fullWidth onClick={() => setTeamContactOpen(true)}>
                  Contacter l'équipe
                </Button>
              ) : (
                <Button variant="secondary" disabled fullWidth>
                  Bientôt disponible
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-600 mt-8">Paiement en ligne bientôt disponible · Pas de carte nécessaire pour le plan Free</p>

      {/* Resiliation -- honnete : aucune facturation en ligne n'est encore
          branchee (pas de Stripe live), donc pas de bouton "annuler" qui
          ferait semblant d'agir. Free = rien a resilier ; Pro/Team (attribue
          manuellement en attendant) = renvoie vers un vrai contact humain
          plutot qu'un controle qui ne ferait rien. */}
      <div className="bg-surface border border-white/5 rounded-2xl p-6 mt-8">
        <div className="flex items-center gap-2 mb-3">
          <XCircle className="w-4 h-4 text-gray-500" />
          <h2 className="font-bold text-sm">Résiliation</h2>
        </div>
        {currentPlan === 'free' ? (
          <p className="text-sm text-gray-500">Tu es sur le plan gratuit — il n'y a rien à résilier.</p>
        ) : (
          <p className="text-sm text-gray-500">
            La gestion de facturation en libre-service arrive bientôt. En attendant, écris-nous à{' '}
            <a href="mailto:resellosapp@gmail.com" className="text-neon-500 hover:underline">resellosapp@gmail.com</a>{' '}
            pour toute demande de résiliation — on s'en occupe manuellement.
          </p>
        )}
      </div>

      {/* Factures -- honnete : aucun paiement en ligne n'existe encore,
          donc aucune facture ne peut exister non plus. */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="w-4 h-4 text-gray-500" />
          <h2 className="font-bold text-sm">Factures</h2>
        </div>
        <EmptyState
          icon={Receipt}
          title="Aucune facture pour l'instant"
          description="Une fois la facturation en ligne activée, tes factures apparaîtront ici automatiquement."
        />
      </div>

      {teamContactOpen && (
        <ContactModal
          onClose={() => setTeamContactOpen(false)}
          title="Parlons de ton équipe"
          description="Explique-nous brièvement ton organisation et tes besoins. Nous te répondrons pour t'aider à choisir la meilleure configuration ResellOS."
          subject="Demande concernant le plan Team ResellOS"
          emailLabel="Adresse e-mail"
          showNameField
          showUserCountField
        />
      )}
    </div>
  );
}
