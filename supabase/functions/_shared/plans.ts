// Mapping plan -> Price ID Stripe, cote serveur uniquement -- jamais
// transmis au client (le body de create-checkout-session ne porte qu'un
// identifiant de plan interne 'pro'|'team', jamais un Price ID Stripe direct,
// voir validation.ts). Free exclu par construction : aucun Customer/
// abonnement Stripe ne doit jamais exister pour ce plan.

export type BillablePlan = "pro" | "team";

const PRICE_ENV_VAR: Record<BillablePlan, string> = {
  pro: "STRIPE_PRO_PRICE_ID",
  team: "STRIPE_TEAM_PRICE_ID",
};

// Leve une erreur generique cote appelant (jamais le nom de la variable ni
// sa valeur dans une Response HTTP) si le secret Supabase correspondant
// n'est pas configure.
export function resolvePriceId(plan: BillablePlan): string {
  const envVar = PRICE_ENV_VAR[plan];
  const priceId = Deno.env.get(envVar);
  if (!priceId) {
    throw new Error(`Price ID manquant pour le plan ${plan} (secret Supabase non configure)`);
  }
  return priceId;
}

// Mapping inverse (Lot 3, stripe-webhook) : Price ID -> plan interne. Ne
// leve jamais -- un Price ID absent des deux secrets serveur retourne null,
// jamais un plan devine. C'est la garde qui empeche un Price ID inconnu
// d'attribuer Pro/Team (contrainte de securite explicite du Lot 3).
export function resolvePlanFromPriceId(priceId: string): BillablePlan | null {
  if (priceId === Deno.env.get("STRIPE_PRO_PRICE_ID")) return "pro";
  if (priceId === Deno.env.get("STRIPE_TEAM_PRICE_ID")) return "team";
  return null;
}
