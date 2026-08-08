import { useEffect, useRef, useState } from 'react';
import { Check, Zap, Crown, ShoppingBag, ExternalLink, Receipt, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PLAN_LIST, type PlanDefinition } from '../../lib/plans';
import { startCheckout, openBillingPortal, type BillablePlan } from '../../lib/billing';
import type { Plan } from '../../lib/types';

const PLAN_ICONS: Record<PlanDefinition['id'], typeof Zap> = {
  free: Zap,
  pro: Crown,
  team: ShoppingBag,
};

const PLAN_DESCRIPTIONS: Record<PlanDefinition['id'], string> = {
  free: 'Pour découvrir Resell OS',
  pro: 'Pour les revendeurs actifs',
  team: 'Pour les revendeurs qui veulent tout, sans limite',
};

// Nombre de tentatives de refreshProfile() apres un retour Stripe --
// webhook Stripe asynchrone (Lot 3), quelques secondes de latence
// possibles avant que profiles.plan ne refletent le nouvel etat. On ne
// montre jamais "abonnement actif" tant que ce refetch n'a pas confirme
// profile.plan reellement -- ?billing=success seul ne prouve rien
// (contrainte explicite Lot 5).
const PROFILE_SYNC_ATTEMPTS = 5;
const PROFILE_SYNC_INTERVAL_MS = 3000;

interface SubscriptionDetails {
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export default function SubscriptionPage() {
  const { user, profile, refreshProfile } = useAuth();
  const currentPlan: Plan = profile?.plan ?? 'free';

  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<BillablePlan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetails | null>(null);

  // Deep-link Stripe (App.tsx pose 'success'|'cancelled'|'return' en
  // sessionStorage au retour sur https://resellosapp.com/?billing=... --
  // meme mecanisme que resellos:dashboardPage). Lu une seule fois via
  // l'initializer (StrictMode-safe), nettoye a part dans un effet dedie.
  const [billingReturn] = useState<string | null>(() => sessionStorage.getItem('resellos:billingReturn'));
  const [syncingProfile, setSyncingProfile] = useState(billingReturn === 'success' || billingReturn === 'return');
  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;

  useEffect(() => {
    sessionStorage.removeItem('resellos:billingReturn');
  }, []);

  useEffect(() => {
    if (billingReturn !== 'success' && billingReturn !== 'return') return;
    let cancelled = false;
    let attempts = 0;
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const poll = async () => {
      attempts += 1;
      await refreshProfileRef.current();
      if (cancelled) return;
      if (attempts >= PROFILE_SYNC_ATTEMPTS) {
        setSyncingProfile(false);
        return;
      }
      timeoutHandle = setTimeout(poll, PROFILE_SYNC_INTERVAL_MS);
    };
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutHandle);
    };
    // Une seule fois au montage -- refreshProfileRef porte la reference a jour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || currentPlan === 'free') {
      setSubscriptionDetails(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSubscriptionDetails((data as SubscriptionDetails | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, currentPlan]);

  const busy = checkoutLoadingPlan !== null || portalLoading;

  const handleCheckout = async (plan: BillablePlan) => {
    if (busy) return;
    setActionError(null);
    setCheckoutLoadingPlan(plan);
    const result = await startCheckout(plan);
    if (!result.ok) {
      setActionError(result.error);
      setCheckoutLoadingPlan(null);
      return;
    }
    window.location.href = result.url;
  };

  const handlePortal = async () => {
    if (busy) return;
    setActionError(null);
    setPortalLoading(true);
    const result = await openBillingPortal();
    if (!result.ok) {
      setActionError(result.error);
      setPortalLoading(false);
      return;
    }
    window.location.href = result.url;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Abonnement"
        description={<>Tu es sur le plan <span className={`font-bold ${currentPlan === 'pro' || currentPlan === 'team' ? 'text-neon-500' : 'text-gray-300'}`}>{currentPlan.toUpperCase()}</span>.</>}
      />

      {billingReturn === 'success' && (
        <div className="bg-neon-500/10 border border-neon-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
          {syncingProfile && <RefreshCw className="w-4 h-4 text-neon-500 flex-shrink-0 mt-0.5 animate-spin" />}
          <p className="text-sm text-gray-300">
            {syncingProfile
              ? 'Paiement reçu — on synchronise ton abonnement, ça ne prend que quelques secondes.'
              : currentPlan !== 'free'
                ? `Ton abonnement ${currentPlan.toUpperCase()} est actif.`
                : "Ton paiement a été reçu mais la synchronisation prend plus de temps que prévu. Recharge cette page dans une minute, ou écris-nous si ça persiste."}
          </p>
        </div>
      )}
      {billingReturn === 'cancelled' && (
        <div className="bg-surface border border-white/5 rounded-2xl p-4 mb-6">
          <p className="text-sm text-gray-400">Paiement annulé — aucun changement n'a été appliqué à ton abonnement.</p>
        </div>
      )}
      {billingReturn === 'return' && syncingProfile && (
        <div className="bg-surface border border-white/5 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <RefreshCw className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 animate-spin" />
          <p className="text-sm text-gray-400">Mise à jour de ton abonnement en cours...</p>
        </div>
      )}

      {actionError && <ErrorBanner message={actionError} className="mb-6" />}

      {/* Current plan banner */}
      <div className="bg-surface border border-neon-500/20 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 bg-neon-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-neon-500" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm">Plan {currentPlan.toUpperCase()} actif</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {currentPlan === 'free'
              ? 'Passe à Pro ou Team pour des annonces illimitées.'
              : subscriptionDetails?.cancel_at_period_end && subscriptionDetails.current_period_end
                ? `Résiliation programmée le ${new Date(subscriptionDetails.current_period_end).toLocaleDateString('fr-FR')}.`
                : subscriptionDetails?.current_period_end
                  ? `Prochain renouvellement le ${new Date(subscriptionDetails.current_period_end).toLocaleDateString('fr-FR')}.`
                  : 'Tu bénéficies de toutes les fonctionnalités premium.'}
          </p>
        </div>
        {currentPlan !== 'free' && (
          <Button variant="secondary" onClick={handlePortal} loading={portalLoading} disabled={busy && !portalLoading} icon={<ExternalLink className="w-4 h-4" />}>
            Gérer mon abonnement
          </Button>
        )}
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLAN_LIST.map((plan) => {
          const Icon = PLAN_ICONS[plan.id];
          const isCurrent = plan.id === currentPlan;
          const isBillable = plan.id === 'pro' || plan.id === 'team';
          return (
            <div
              key={plan.id}
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
                <p className="text-xs text-gray-500">{PLAN_DESCRIPTIONS[plan.id]}</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-black">{plan.priceDisplay} €</span>
                <span className="text-gray-500 text-sm">/mois</span>
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
              ) : isBillable ? (
                <Button
                  fullWidth
                  onClick={() => handleCheckout(plan.id as BillablePlan)}
                  loading={checkoutLoadingPlan === plan.id}
                  disabled={busy && checkoutLoadingPlan !== plan.id}
                >
                  Passer au {plan.name}
                </Button>
              ) : (
                <Button variant="secondary" disabled fullWidth>
                  Plan gratuit
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-600 mt-8">Paiement sécurisé par Stripe · Résiliable à tout moment</p>

      {/* Factures -- gerees directement dans le Portail de facturation
          Stripe (bouton "Gerer mon abonnement" ci-dessus), pas de re-
          implementation ici. */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="w-4 h-4 text-gray-500" />
          <h2 className="font-bold text-sm">Factures</h2>
        </div>
        {currentPlan === 'free' ? (
          <EmptyState
            icon={Receipt}
            title="Aucune facture pour l'instant"
            description="Tu es sur le plan gratuit — passe à Pro ou Team pour commencer à recevoir des factures."
          />
        ) : (
          <p className="text-sm text-gray-500">
            Tes factures et ton historique de paiement sont disponibles dans l'espace{' '}
            <button onClick={handlePortal} disabled={busy} className="text-neon-500 hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
              Gérer mon abonnement
            </button>{' '}
            ci-dessus.
          </p>
        )}
      </div>
    </div>
  );
}
