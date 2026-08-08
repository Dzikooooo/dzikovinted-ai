import type { BillablePlan } from "../_shared/plans.ts";

export type ParsedPlanResult =
  | { ok: true; plan: BillablePlan }
  | { ok: false; error: string };

// Seul point d'entree pour valider le body -- 'free' est explicitement
// rejete (Free n'a jamais de Customer/abonnement Stripe, voir Lot 1), tout
// comme un Price ID envoye directement (le mapping plan -> Price ID reste
// exclusivement cote serveur, voir _shared/plans.ts). Pure, zero I/O :
// testable sans mock Stripe/Supabase.
export function parseRequestedPlan(body: unknown): ParsedPlanResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Corps de requête invalide" };
  }
  const plan = (body as Record<string, unknown>).plan;
  if (plan === "pro" || plan === "team") {
    return { ok: true, plan };
  }
  return { ok: false, error: "plan doit être 'pro' ou 'team'" };
}
