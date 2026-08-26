// Facturation annuelle (2026-08-26).
//
// Le plan et l'intervalle sont deux dimensions SEPAREES : un abonne annuel
// Pro est un abonne Pro. Volontairement pas de valeur 'pro_annual' dans le
// type Plan -- tout le code d'entitlements (PLAN_LIMITS, PLAN_PHOTO_LIMITS,
// PLAN_WATCHLIST_LIMITS) devrait alors la connaitre, et chaque oubli
// accorderait les droits du plan Free a un client qui paie a l'annee.
// Le mapping (plan, intervalle) -> Price ID Stripe vit cote serveur
// uniquement (supabase/functions/_shared/plans.ts).

export type BillingInterval = 'month' | 'year';

export const ANNUAL_DISCOUNT_RATE = 0.2;

// Arrondi au centime : un prix affiche a 19.992000000000001 € serait grotesque.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Prix mensuel EQUIVALENT quand on paie a l'annee -- le grand chiffre affiche. */
export function annualMonthlyPrice(monthlyPrice: number): number {
  return round2(monthlyPrice * (1 - ANNUAL_DISCOUNT_RATE));
}

/** Montant reellement debite une fois par an. */
export function annualTotalPrice(monthlyPrice: number): number {
  return round2(annualMonthlyPrice(monthlyPrice) * 12);
}

/** Economie annuelle en euros, par rapport a douze mensualites. */
export function annualSaving(monthlyPrice: number): number {
  return round2(monthlyPrice * 12 - annualTotalPrice(monthlyPrice));
}

// Formatage francais a deux decimales. Volontairement PAS formatEUR() de
// lib/currency.ts : celui-ci arrondit a l'euro entier ("123 €"), convention
// juste pour des montants de vente mais fausse pour un prix affiche -- un
// abonnement a 24,99 € ne s'annonce pas "25 €".
export function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
