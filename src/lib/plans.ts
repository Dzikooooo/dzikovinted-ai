import { PLAN_LIMITS, PLAN_PHOTO_LIMITS, type Plan } from './types';

// Source de verite unique pour l'affichage des plans (freeze beta, Lot 1 --
// audit Stripe 2026-08-08). Consommee par Pricing.tsx et SubscriptionPage.tsx
// (Lot 5) pour eliminer la divergence constatee entre les deux pages avant
// ce chantier (features/prix differents alors qu'ils decrivent le meme
// produit).
//
// Aucun identifiant Stripe ici : le mapping plan -> Price ID (STRIPE_PRO_
// PRICE_ID/STRIPE_TEAM_PRICE_ID) reste exclusivement cote serveur
// (create-checkout-session, stripe-webhook) -- ce fichier est bundle dans le
// client, jamais d'ID Stripe ni de cle a y faire transiter.
//
// Pro et Team partagent aujourd'hui exactement les memes limites reelles
// (PLAN_LIMITS/PLAN_PHOTO_LIMITS, types.ts, verifie dans le code plutot que
// suppose) -- prix different, fonctionnalites identiques pour l'instant.
// Decision explicite (2026-08-08) : ne pas inventer de differenciation
// artificielle ici, une passe produit dediee redefinira les entitlements
// de chaque plan plus tard. Ne pas re-signaler cet ecart comme un oubli.

export interface PlanDefinition {
  id: Plan;
  name: string;
  priceMonthly: number;
  priceDisplay: string;
  creditsPerMonth: number | null;
  photoLimit: number;
  features: string[];
  highlighted: boolean;
}

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceDisplay: '0',
    creditsPerMonth: PLAN_LIMITS.free,
    photoLimit: PLAN_PHOTO_LIMITS.free,
    features: [
      `${PLAN_LIMITS.free} annonces IA par mois`,
      `${PLAN_PHOTO_LIMITS.free} photo par annonce`,
      "Prix recommandé par l'IA",
      'Stock et comptabilité illimités',
      'Comptes Vinted illimités',
    ],
    highlighted: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 24.99,
    priceDisplay: '24,99',
    creditsPerMonth: PLAN_LIMITS.pro,
    photoLimit: PLAN_PHOTO_LIMITS.pro,
    features: [
      'Annonces IA illimitées',
      `${PLAN_PHOTO_LIMITS.pro} photos par annonce`,
      'Tout le plan Free',
    ],
    highlighted: true,
  },
  team: {
    id: 'team',
    name: 'Team',
    priceMonthly: 39.99,
    priceDisplay: '39,99',
    creditsPerMonth: PLAN_LIMITS.team,
    photoLimit: PLAN_PHOTO_LIMITS.team,
    features: [
      'Annonces IA illimitées',
      `${PLAN_PHOTO_LIMITS.team} photos par annonce`,
      'Tout le plan Pro',
    ],
    highlighted: false,
  },
};

export const PLAN_LIST: PlanDefinition[] = [PLANS.free, PLANS.pro, PLANS.team];
