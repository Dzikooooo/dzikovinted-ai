import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Interface etroite (memes principes que create-checkout-session, Lot 2) --
// seules les 2 methodes reellement appelees.
export interface StripeClientForPortal {
  customers: {
    retrieve: (id: string) => Promise<{ deleted?: boolean; id?: string }>;
  };
  billingPortal: {
    sessions: {
      create: (params: Record<string, unknown>) => Promise<{ url: string | null }>;
    };
  };
}

export interface CreatePortalSessionDeps {
  stripe: StripeClientForPortal;
  supabaseAdmin: SupabaseClient;
}

export type CreatePortalSessionResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

const NO_SUBSCRIPTION_MESSAGE = "Aucun abonnement Stripe n'est associé à ce compte.";

// Meme constat que create-checkout-session (Lot 2) : aucune route URL
// reelle n'existe dans ce repo (SPA pure, aucun react-router, App.tsx
// pilote tout par state React) -- domaine racine + query param, jamais une
// URL inventee. Distinct de success_url/cancel_url du Lot 2 : le Portal
// n'a pas de succes/echec binaire (facture, moyen de paiement, resiliation
// sont tous des actions differentes dans le meme Portal).
const RETURN_URL = "https://resellosapp.com/?billing=return";

// Aucune ecriture DB dans cette fonction (contrainte #6) -- lecture seule
// de subscriptions.stripe_customer_id, puis appel Stripe. profiles.plan et
// subscriptions.status restent l'autorite exclusive du webhook (Lot 3).
export async function createPortalSessionForUser(
  deps: CreatePortalSessionDeps,
  userId: string
): Promise<CreatePortalSessionResult> {
  const { data, error } = await deps.supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[create-portal-session] echec lecture subscriptions", error);
    return { ok: false, status: 500, error: "Erreur serveur, réessaie plus tard." };
  }

  const customerId = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    return { ok: false, status: 404, error: NO_SUBSCRIPTION_MESSAGE };
  }

  // Verifie que le Customer existe toujours reellement cote Stripe -- ne
  // recree JAMAIS silencieusement (contrainte #3, cette responsabilite
  // appartient exclusivement a create-checkout-session/Lot 2). Meme message
  // client que "aucune ligne subscriptions" : indiscernable du point de vue
  // utilisateur (aucun abonnement exploitable dans les deux cas), detail
  // reel reserve aux logs serveur.
  try {
    const customer = await deps.stripe.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) {
      console.error("[create-portal-session] Customer Stripe marque deleted", { customerId });
      return { ok: false, status: 404, error: NO_SUBSCRIPTION_MESSAGE };
    }
  } catch (e) {
    console.error("[create-portal-session] Customer Stripe introuvable", { customerId, error: e });
    return { ok: false, status: 404, error: NO_SUBSCRIPTION_MESSAGE };
  }

  const session = await deps.stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: RETURN_URL,
  });

  if (!session.url) {
    console.error("[create-portal-session] Stripe n'a renvoye aucune URL de session");
    return { ok: false, status: 500, error: "Erreur serveur, réessaie plus tard." };
  }

  return { ok: true, url: session.url };
}
