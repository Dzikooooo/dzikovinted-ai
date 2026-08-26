import { PLAN_LIMITS, PLAN_PHOTO_LIMITS, PLAN_WATCHLIST_LIMITS, type Plan } from './types';
import { annualMonthlyPrice, annualSaving, annualTotalPrice, formatPrice } from './billingInterval';

// Source de verite unique pour l'affichage des plans (freeze beta, Lot 1 --
// audit Stripe 2026-08-08). Consommee par Pricing.tsx et SubscriptionPage.tsx
// (Lot 5) pour eliminer la divergence constatee entre les deux pages avant
// ce chantier (features/prix differents alors qu'ils decrivent le meme
// produit).
//
// Aucun identifiant Stripe ici : le mapping (plan, intervalle) -> Price ID
// reste exclusivement cote serveur (create-checkout-session, stripe-webhook)
// -- ce fichier est bundle dans le client, jamais d'ID Stripe ni de cle a y
// faire transiter.
//
// DIFFERENCIATION PRO/TEAM (2026-08-26) : jusqu'ici Pro et Team avaient
// exactement les memes limites reelles (prix different, produit identique),
// avec une note remettant la differenciation a "une passe produit dediee".
// C'est cette passe. Le decoupage retenu est un decoupage de VOLUME
// (recherches watchlist actives, profondeur des galeries d'opportunites) et
// non de fonctionnalites : le volume correspond a un cout d'infrastructure
// reel, se mesure, et n'oblige a retirer aucune capacite existante.
//
// Deux pistes ecartees a dessein, parce qu'elles auraient regresse sur
// l'existant ou promis l'impossible :
//   - "multi-comptes Vinted reserve a Team" : les comptes Vinted sont
//     illimites pour TOUS aujourd'hui, sans aucun gating dans le code. En
//     faire un argument Team serait retirer une capacite deja acquise.
//   - "opportunites prioritaires" : market_opportunities est une table
//     GLOBALE (policy `for select to authenticated using (true)`), lue
//     integralement par tout utilisateur authentifie. Aucun acces
//     prioritaire n'est exprimable sans repenser ce modele de donnees.

export interface PlanDefinition {
  id: Plan;
  name: string;
  priceMonthly: number;
  priceDisplay: string;
  /** Prix mensuel equivalent quand on paie a l'annee (-20 %). */
  priceAnnualMonthlyDisplay: string;
  /** Montant reellement debite une fois par an. */
  priceAnnualTotalDisplay: string;
  /** Economie annuelle en euros face a douze mensualites. */
  annualSavingDisplay: string;
  creditsPerMonth: number | null;
  photoLimit: number;
  watchlistLimit: number | null;
  features: string[];
  highlighted: boolean;
}

function withAnnualPricing(
  base: Omit<PlanDefinition, 'priceDisplay' | 'priceAnnualMonthlyDisplay' | 'priceAnnualTotalDisplay' | 'annualSavingDisplay'>
): PlanDefinition {
  // Tout est DERIVE de priceMonthly, jamais saisi a la main : une remise
  // annuelle recopiee en dur finit toujours par diverger du prix mensuel le
  // jour ou celui-ci bouge.
  return {
    ...base,
    priceDisplay: formatPrice(base.priceMonthly),
    priceAnnualMonthlyDisplay: formatPrice(annualMonthlyPrice(base.priceMonthly)),
    priceAnnualTotalDisplay: formatPrice(annualTotalPrice(base.priceMonthly)),
    annualSavingDisplay: formatPrice(annualSaving(base.priceMonthly)),
  };
}

export const PLANS: Record<Plan, PlanDefinition> = {
  free: withAnnualPricing({
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    creditsPerMonth: PLAN_LIMITS.free,
    photoLimit: PLAN_PHOTO_LIMITS.free,
    watchlistLimit: PLAN_WATCHLIST_LIMITS.free,
    features: [
      `${PLAN_LIMITS.free} annonces IA par mois`,
      `${PLAN_PHOTO_LIMITS.free} photo par annonce`,
      "Prix recommandé par l'IA",
      'Stock et comptabilité illimités',
      'Comptes Vinted illimités',
    ],
    highlighted: false,
  }),
  pro: withAnnualPricing({
    id: 'pro',
    name: 'Pro',
    priceMonthly: 24.99,
    creditsPerMonth: PLAN_LIMITS.pro,
    photoLimit: PLAN_PHOTO_LIMITS.pro,
    watchlistLimit: PLAN_WATCHLIST_LIMITS.pro,
    features: [
      'Annonces IA illimitées',
      `${PLAN_PHOTO_LIMITS.pro} photos par annonce`,
      `${PLAN_WATCHLIST_LIMITS.pro} recherches Watchlist actives`,
      'Comptabilité et aide déclaration URSSAF',
      'Relance favoris assistée',
      'Republication automatique',
    ],
    highlighted: true,
  }),
  team: withAnnualPricing({
    id: 'team',
    name: 'Team',
    priceMonthly: 39.99,
    creditsPerMonth: PLAN_LIMITS.team,
    photoLimit: PLAN_PHOTO_LIMITS.team,
    watchlistLimit: PLAN_WATCHLIST_LIMITS.team,
    features: [
      'Tout le plan Pro',
      `${PLAN_WATCHLIST_LIMITS.team} recherches Watchlist actives`,
      'Galeries photo étendues sur les opportunités',
      'Taillé pour le gros volume',
    ],
    highlighted: false,
  }),
};

export const PLAN_LIST: PlanDefinition[] = [PLANS.free, PLANS.pro, PLANS.team];

// Grille d'achat (2026-08-26) : Free n'y figure plus. Un visiteur ou un
// utilisateur deja sur Free n'a rien a "acheter" de gratuit -- il voit
// directement ce vers quoi il peut monter. Le plan Free existe toujours et
// reste decrit ailleurs (PLAN_LIST, page Abonnement pour le plan COURANT),
// il n'est simplement plus une carte a choisir.
export const PURCHASABLE_PLANS: PlanDefinition[] = [PLANS.pro, PLANS.team];
