import type { BillablePlan } from "../_shared/plans.ts";

// Duplique volontairement Plan de src/lib/types.ts -- meme convention que
// le reste du projet pour la frontiere Node (src/)/Deno (supabase/functions/),
// aucun partage de code entre ces deux runtimes (voir analyze-clothing/index.ts).
export type Plan = "free" | "pro" | "team";

// Liste blanche des statuts Stripe consideres "payant" -- memes 3 valeurs
// que la garde anti-doublon de create-checkout-session (Lot 2), cohérence
// intentionnelle. Tout statut hors de cette liste (canceled/unpaid/
// incomplete_expired/incomplete/paused/tout futur statut Stripe encore
// inconnu de ce code) resout vers 'free' par defaut -- liste blanche plutot
// que liste noire : un nouveau statut Stripe jamais vu ne peut jamais
// accorder un acces payant par erreur.
export const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

export type PlanDecision =
  | { kind: "free" }
  | { kind: "plan"; plan: BillablePlan }
  // Statut payant mais Price ID non reconnu -- ne doit jamais attribuer de
  // plan (correction explicite du Lot 3) : l'appelant ne doit ecrire NI
  // profiles.plan NI l'etat billing dans subscriptions dans ce cas, pas
  // meme un etat partiel.
  | { kind: "unresolvable" };

export function resolvePlanForStatus(status: string, mappedPlan: BillablePlan | null): PlanDecision {
  if (!PAYING_STATUSES.has(status)) {
    return { kind: "free" };
  }
  if (mappedPlan === null) {
    return { kind: "unresolvable" };
  }
  return { kind: "plan", plan: mappedPlan };
}
