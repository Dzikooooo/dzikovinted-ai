import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { resolvePriceId, type BillablePlan } from "../_shared/plans.ts";

// Interface etroite (3 methodes reellement appelees) plutot que le type
// Stripe complet -- garde les fakes de test triviaux a ecrire, evite de
// devoir satisfaire toute la surface du SDK dans handler.test.ts.
export interface StripeClientForCheckout {
  customers: {
    retrieve: (id: string) => Promise<{ deleted?: boolean; id?: string }>;
    create: (params: { metadata: Record<string, string>; email?: string }) => Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create: (params: Record<string, unknown>) => Promise<{ url: string | null }>;
    };
  };
}

export interface CreateCheckoutSessionDeps {
  stripe: StripeClientForCheckout;
  supabaseAdmin: SupabaseClient;
  now: () => Date;
}

export type CreateCheckoutSessionResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

interface SubscriptionRow {
  stripe_customer_id: string | null;
  status: string | null;
}

// Statuts Stripe consideres "deja payant" pour la garde anti-doublon --
// aligne sur la regle profiles.plan du webhook (Lot 3, 20260808120000) :
// past_due garde l'acces pendant la periode de recuperation, donc compte
// aussi comme "abonnement actif" ici (un second Checkout ne doit pas etre
// propose pendant une simple periode de grace).
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

// Aucune route dediee n'existe dans ce repo (App.tsx confirme : pas de
// react-router, tout est pilote par un state React) -- domaine racine reel +
// query param, pas d'URL inventee. Lot 5 devra lire ?billing=... au montage
// pour renvoyer l'utilisateur sur l'onglet Abonnement (meme mecanisme que
// resellos:dashboardPage deja utilise pour le deep-link Communaute).
const SUCCESS_URL = "https://resellosapp.com/?billing=success";
const CANCEL_URL = "https://resellosapp.com/?billing=cancelled";

// Coeur testable de create-checkout-session -- toutes les dependances
// (Stripe, Supabase, horloge) injectees, aucun acces direct a Deno.serve/
// fetch ici. index.ts se contente de cabler les vrais clients et d'appeler
// cette fonction.
export async function createCheckoutSessionForPlan(
  deps: CreateCheckoutSessionDeps,
  userId: string,
  userEmail: string | null,
  plan: BillablePlan
): Promise<CreateCheckoutSessionResult> {
  let priceId: string;
  try {
    priceId = resolvePriceId(plan);
  } catch (e) {
    // Jamais le nom du secret manquant ni sa valeur dans la reponse client.
    console.error("[create-checkout-session] configuration Stripe incomplete", e);
    return { ok: false, status: 500, error: "Configuration de facturation indisponible, réessaie plus tard." };
  }

  const { data, error: fetchError } = await deps.supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[create-checkout-session] echec lecture subscriptions", fetchError);
    return { ok: false, status: 500, error: "Erreur serveur, réessaie plus tard." };
  }

  const existingSub = data as SubscriptionRow | null;

  if (existingSub?.status && ACTIVE_SUBSCRIPTION_STATUSES.has(existingSub.status)) {
    return {
      ok: false,
      status: 409,
      error: "Un abonnement est déjà actif. Gère ton abonnement depuis l'espace facturation.",
    };
  }

  let customerId = existingSub?.stripe_customer_id ?? null;

  if (customerId) {
    // Verification legere que le Customer existe toujours cote Stripe (ex.
    // supprime manuellement dans le Dashboard) -- toute erreur ou un
    // Customer marque deleted declenche une recreation plutot qu'un echec
    // dur, le pire cas etant un Customer orphelin sans consequence.
    try {
      const customer = await deps.stripe.customers.retrieve(customerId);
      if ("deleted" in customer && customer.deleted) {
        customerId = null;
      }
    } catch (e) {
      console.error("[create-checkout-session] Customer Stripe introuvable, recreation", e);
      customerId = null;
    }
  }

  if (!customerId) {
    const customer = await deps.stripe.customers.create({
      metadata: { user_id: userId },
      email: userEmail ?? undefined,
    });
    customerId = customer.id;

    // La creation du Customer ne touche jamais profiles.plan -- seul
    // stripe_customer_id est pose ici, status/stripe_event_created_at
    // restent NULL tant qu'aucun webhook n'a ete traite (voir Lot 1).
    const { error: upsertError } = await deps.supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        status: null,
        stripe_event_created_at: null,
        updated_at: deps.now().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("[create-checkout-session] echec upsert subscriptions", upsertError);
      return { ok: false, status: 500, error: "Erreur serveur, réessaie plus tard." };
    }
  }

  const session = await deps.stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    subscription_data: { metadata: { user_id: userId } },
    metadata: { user_id: userId, requested_plan: plan },
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
  });

  if (!session.url) {
    console.error("[create-checkout-session] Stripe n'a renvoye aucune URL de session");
    return { ok: false, status: 500, error: "Erreur serveur, réessaie plus tard." };
  }

  return { ok: true, url: session.url };
}
