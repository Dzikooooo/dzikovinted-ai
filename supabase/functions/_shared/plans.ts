// Mapping (plan, intervalle) -> Price ID Stripe, cote serveur uniquement --
// jamais transmis au client (le body de create-checkout-session ne porte que
// des identifiants internes 'pro'|'team' et 'month'|'year', jamais un Price
// ID Stripe direct, voir validation.ts). Free exclu par construction : aucun
// Customer/abonnement Stripe ne doit jamais exister pour ce plan.
//
// FACTURATION ANNUELLE (2026-08-26) : le plan et l'intervalle sont deux
// dimensions SEPAREES. Volontairement pas de quatrieme valeur 'pro_annual'
// dans le type Plan -- tout le code d'entitlements (PLAN_LIMITS,
// PLAN_PHOTO_LIMITS, PLAN_WATCHLIST_LIMITS cote client) devrait alors
// connaitre cette valeur, et chaque oubli accorderait silencieusement les
// droits du plan Free a un client qui paie a l'annee. Un abonne annuel Pro
// est un abonne Pro, point.

export type BillablePlan = "pro" | "team";
export type BillingInterval = "month" | "year";

const PRICE_ENV_VAR: Record<BillablePlan, Record<BillingInterval, string>> = {
  pro: {
    month: "STRIPE_PRO_PRICE_ID",
    year: "STRIPE_PRO_ANNUAL_PRICE_ID",
  },
  team: {
    month: "STRIPE_TEAM_PRICE_ID",
    year: "STRIPE_TEAM_ANNUAL_PRICE_ID",
  },
};

// Leve une erreur generique cote appelant (jamais le nom de la variable ni
// sa valeur dans une Response HTTP) si le secret Supabase correspondant
// n'est pas configure.
export function resolvePriceId(plan: BillablePlan, interval: BillingInterval): string {
  const envVar = PRICE_ENV_VAR[plan][interval];
  const priceId = Deno.env.get(envVar);
  if (!priceId) {
    throw new Error(`Price ID manquant pour le plan ${plan} (${interval}) -- secret Supabase non configure`);
  }
  return priceId;
}

export interface ResolvedPrice {
  plan: BillablePlan;
  interval: BillingInterval;
}

// Mapping inverse (stripe-webhook) : Price ID -> (plan, intervalle). Ne leve
// JAMAIS -- un Price ID absent des secrets serveur retourne null, jamais un
// plan devine. C'est la garde qui empeche un Price ID inconnu d'attribuer
// Pro/Team (contrainte de securite explicite du Lot 3).
//
// PIEGE DE L'AJOUT DE L'ANNUEL : cette fonction ne connaissait que les deux
// Price IDs mensuels. Ajouter les Price IDs annuels au checkout SANS les
// ajouter ici aurait produit un echec silencieux de la pire espece -- un
// paiement annuel encaisse par Stripe, un webhook qui ne reconnait pas le
// Price ID, et un client laisse sur le plan Free apres avoir paye un an.
// D'ou l'enumeration exhaustive ci-dessous, derivee de PRICE_ENV_VAR : ajouter
// un plan ou un intervalle a la table le rend automatiquement reconnaissable
// ici, sans nouvelle ligne a ne pas oublier.
//
// Un secret non configure est ignore (pas de correspondance sur undefined) :
// sans cela, un Price ID vide correspondrait a toute valeur absente.
export function resolvePlanFromPriceId(priceId: string): ResolvedPrice | null {
  if (!priceId) return null;

  for (const plan of Object.keys(PRICE_ENV_VAR) as BillablePlan[]) {
    for (const interval of Object.keys(PRICE_ENV_VAR[plan]) as BillingInterval[]) {
      const configured = Deno.env.get(PRICE_ENV_VAR[plan][interval]);
      if (configured && configured === priceId) return { plan, interval };
    }
  }

  return null;
}
