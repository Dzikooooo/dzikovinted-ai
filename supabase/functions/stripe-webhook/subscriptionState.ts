import type { BillablePlan } from "../_shared/plans.ts";

// Duplique volontairement Plan de src/lib/types.ts -- meme convention que
// le reste du projet pour la frontiere Node (src/)/Deno (supabase/functions/),
// aucun partage de code entre ces deux runtimes (voir analyze-clothing/index.ts).
export type Plan = "free" | "pro" | "team";

// active/trialing : le paiement de la periode courante est confirme (ou
// periode d'essai en cours) -- aucune ambiguite, tout Price ID mappe peut
// etre accorde librement (upgrade ou downgrade).
export const FULLY_PAYING_STATUSES = new Set(["active", "trialing"]);

// past_due isole a part (P1-3, audit pre-lancement Stripe LIVE 2026-08-09) :
// ce statut recouvre 2 situations tres differentes cote Stripe --
// - RENOUVELLEMENT normal echoue sur un abonnement deja actif : le Price ID
//   de l'objet Subscription reste identique au plan deja accorde. Grace
//   period voulue (decision produit anterieure, Lot 3) : conserver l'acces.
// - UPGRADE en milieu de periode (proration facturee immediatement) dont le
//   paiement echoue : Stripe change IMMEDIATEMENT le Price ID de
//   l'abonnement independamment du succes du paiement de la proration --
//   status passe a past_due (ou incomplete), le Price ID mappe ne
//   correspond alors PLUS au plan deja accorde. Ne jamais accorder ce
//   nouveau plan tant qu'un evenement status='active' reel ne le confirme
//   pas.
// Distingue les deux en comparant le Price ID mappe au plan DEJA accorde
// (profiles.plan, lu par l'appelant au moment de traiter l'evenement)
// plutot que de dependre d'un ordre suppose entre invoice.payment_failed et
// customer.subscription.updated -- Stripe ne garantit aucun ordre global
// entre webhooks (peuvent arriver dans n'importe quel ordre, ou l'un sans
// l'autre), cette comparaison reste correcte dans tous les cas.
export const GRACE_STATUS = "past_due";

export type PlanDecision =
  | { kind: "free" }
  | { kind: "plan"; plan: BillablePlan }
  // Statut payant/grace mais Price ID non reconnu -- jamais de plan devine
  // (contrainte de securite explicite du Lot 3).
  | { kind: "unresolvable" }
  // past_due + Price ID mappe different du plan deja accorde : paiement de
  // la proration d'un changement de plan non confirme -- ne touche jamais
  // profiles.plan (ni pour l'accorder, ni pour le retirer). subscriptions.
  // status enregistre neanmoins la realite Stripe (past_due).
  | { kind: "unchanged" };

export function resolvePlanDecision(status: string, mappedPlan: BillablePlan | null, currentPlan: Plan): PlanDecision {
  if (FULLY_PAYING_STATUSES.has(status)) {
    return mappedPlan === null ? { kind: "unresolvable" } : { kind: "plan", plan: mappedPlan };
  }
  if (status === GRACE_STATUS) {
    if (mappedPlan === null) return { kind: "unresolvable" };
    return mappedPlan === currentPlan ? { kind: "plan", plan: mappedPlan } : { kind: "unchanged" };
  }
  // Tout le reste (canceled/unpaid/incomplete/incomplete_expired/paused/
  // tout statut futur inconnu) -> free par defaut, liste blanche plutot que
  // liste noire (comportement inchange depuis le Lot 3).
  return { kind: "free" };
}
