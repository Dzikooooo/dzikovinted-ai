import type { BillablePlan, BillingInterval } from "../_shared/plans.ts";

export interface ParsedCheckoutRequest {
  plan: BillablePlan;
  interval: BillingInterval;
}

export type ParsedPlanResult =
  | ({ ok: true } & ParsedCheckoutRequest)
  | { ok: false; error: string };

// Seul point d'entree pour valider le body -- 'free' est explicitement
// rejete (Free n'a jamais de Customer/abonnement Stripe, voir Lot 1), tout
// comme un Price ID envoye directement (le mapping (plan, intervalle) ->
// Price ID reste exclusivement cote serveur, voir _shared/plans.ts). Pure,
// zero I/O : testable sans mock Stripe/Supabase.
//
// `interval` est OPTIONNEL et retombe sur "month" : un client d'une version
// anterieure qui n'envoie que { plan } continue d'obtenir exactement le
// comportement d'avant l'ajout de l'annuel, jamais une facturation annuelle
// par surprise. Toute autre valeur est refusee plutot que corrigee en
// silence -- on ne devine pas un engagement de douze mois.
export function parseRequestedPlan(body: unknown): ParsedPlanResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Corps de requête invalide" };
  }

  const plan = (body as Record<string, unknown>).plan;
  if (plan !== "pro" && plan !== "team") {
    return { ok: false, error: "plan doit être 'pro' ou 'team'" };
  }

  const rawInterval = (body as Record<string, unknown>).interval;
  if (rawInterval === undefined || rawInterval === null) {
    return { ok: true, plan, interval: "month" };
  }
  if (rawInterval !== "month" && rawInterval !== "year") {
    return { ok: false, error: "interval doit être 'month' ou 'year'" };
  }

  return { ok: true, plan, interval: rawInterval };
}
