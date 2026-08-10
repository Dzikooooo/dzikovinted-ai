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

interface ReserveCheckoutSlotRow {
  reserved: boolean;
  reason: "reserved" | "already_subscribed" | "checkout_in_progress";
  stripe_customer_id: string | null;
}

const ALREADY_SUBSCRIBED_MESSAGE = "Un abonnement est déjà actif. Gère ton abonnement depuis l'espace facturation.";
const CHECKOUT_IN_PROGRESS_MESSAGE =
  "Une demande de paiement est déjà en cours pour ce compte. Réessaie dans quelques instants.";
const GENERIC_SERVER_ERROR = "Erreur serveur, réessaie plus tard.";

// Aucune route dediee n'existe dans ce repo (App.tsx confirme : pas de
// react-router, tout est pilote par un state React) -- domaine racine reel +
// query param, pas d'URL inventee. Lot 5 devra lire ?billing=... au montage
// pour renvoyer l'utilisateur sur l'onglet Abonnement (meme mecanisme que
// resellos:dashboardPage deja utilise pour le deep-link Communaute).
const SUCCESS_URL = "https://resellosapp.com/?billing=success";
const CANCEL_URL = "https://resellosapp.com/?billing=cancelled";

// P1-1 (audit pre-lancement Stripe LIVE, 2026-08-09) : l'ancienne garde
// (SELECT status puis decision cote application) n'etait pas atomique --
// deux requetes concurrentes pouvaient toutes deux lire "pas encore
// abonne" et creer chacune une Checkout Session valide. reserve_checkout_slot
// (migration 20260809100000) remplace ce SELECT par un seul UPSERT
// conditionnel : Postgres verrouille la ligne pendant toute l'evaluation de
// la clause WHERE, donc deux appels concurrents pour le meme user_id
// serialisent reellement au niveau de la base, pas de l'edge function.
async function reserveCheckoutSlot(
  deps: CreateCheckoutSessionDeps,
  userId: string
): Promise<{ ok: true; stripeCustomerId: string | null } | { ok: false; status: number; error: string }> {
  const { data, error } = await deps.supabaseAdmin.rpc("reserve_checkout_slot", { p_user_id: userId });

  if (error) {
    console.error("[create-checkout-session] echec reserve_checkout_slot", error);
    return { ok: false, status: 500, error: GENERIC_SERVER_ERROR };
  }

  // supabase-js renvoie systematiquement un tableau pour une fonction
  // "returns table" -- exactement une ligne ici (reserve_checkout_slot
  // renvoie toujours exactement une ligne, jamais zero ni plusieurs).
  const row = (Array.isArray(data) ? data[0] : data) as ReserveCheckoutSlotRow | undefined;

  if (!row || !row.reserved) {
    const reason = row?.reason;
    return {
      ok: false,
      status: 409,
      error: reason === "checkout_in_progress" ? CHECKOUT_IN_PROGRESS_MESSAGE : ALREADY_SUBSCRIBED_MESSAGE,
    };
  }

  return { ok: true, stripeCustomerId: row.stripe_customer_id };
}

// Retire la reservation posee par reserveCheckoutSlot des qu'une erreur
// survient APRES elle (Stripe indisponible, ecriture Supabase en echec...)
// -- permet un retry immediat plutot que d'attendre l'expiration naturelle
// de 5 minutes de la reservation. Ne fait jamais echouer l'appelant : un
// echec de nettoyage n'est qu'un log, la reservation expirera d'elle-meme.
async function releaseCheckoutSlot(deps: CreateCheckoutSessionDeps, userId: string): Promise<void> {
  const { error } = await deps.supabaseAdmin.rpc("release_checkout_reservation", { p_user_id: userId });
  if (error) {
    console.error("[create-checkout-session] echec release_checkout_reservation (retry differe possible)", error);
  }
}

// Programme Beta ResellOS (Lot 7+8, 2026-08-10). claim_commercial_offer est
// un UPDATE...WHERE...RETURNING atomique (meme idiome que
// reserve_checkout_slot) : combine a reserveCheckoutSlot ci-dessus (deja
// serialise par utilisateur, fenetre de 5 minutes), ceci exclut par
// construction toute double consommation de l'offre par deux Checkout
// Sessions concurrentes du meme utilisateur. Retourne null si aucune offre
// pending n'existe -- comportement identique a aujourd'hui (aucun trial,
// aucun coupon), jamais une erreur bloquante : un echec de lookup ne doit
// jamais empecher un upgrade Pro/Team payant normal.
interface ClaimedOffer {
  trialPeriodDays: number;
  stripeCouponId: string | null;
}

async function claimCommercialOffer(deps: CreateCheckoutSessionDeps, userId: string): Promise<ClaimedOffer | null> {
  const { data, error } = await deps.supabaseAdmin.rpc("claim_commercial_offer", { p_user_id: userId });
  if (error) {
    console.error("[create-checkout-session] echec claim_commercial_offer (checkout poursuivi sans offre)", error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { trial_period_days: number; stripe_coupon_id: string | null }
    | undefined;
  if (!row) return null;
  return { trialPeriodDays: row.trial_period_days, stripeCouponId: row.stripe_coupon_id };
}

// Symetrique de releaseCheckoutSlot -- remet l'offre en pending si Stripe
// echoue APRES claimCommercialOffer, pour un retry immediat plutot que de
// perdre l'offre. Meme discipline "jamais bloquant" : un echec de release
// n'est qu'un log.
async function releaseCommercialOffer(deps: CreateCheckoutSessionDeps, userId: string): Promise<void> {
  const { error } = await deps.supabaseAdmin.rpc("release_commercial_offer", { p_user_id: userId });
  if (error) {
    console.error("[create-checkout-session] echec release_commercial_offer (retry differe possible)", error);
  }
}

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

  const reservation = await reserveCheckoutSlot(deps, userId);
  if (!reservation.ok) {
    return reservation;
  }

  let customerId = reservation.stripeCustomerId;
  let claimedOffer: ClaimedOffer | null = null;

  try {
    // Recherche/reclamation de l'offre APRES la reservation du slot de
    // Checkout (deja serialisee par utilisateur) -- voir claimCommercialOffer
    // ci-dessus pour l'analyse de race complete.
    claimedOffer = await claimCommercialOffer(deps, userId);

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
        await releaseCheckoutSlot(deps, userId);
        if (claimedOffer) await releaseCommercialOffer(deps, userId);
        return { ok: false, status: 500, error: GENERIC_SERVER_ERROR };
      }
    }

    // subscription_data.trial_period_days + discounts:[{coupon}] (duration
    // 'once' cote Stripe) : Stripe gere nativement la transition essai ->
    // premiere facture payante, aucune logique maison de "mois numero 2"
    // (verifie contre la documentation Stripe -- un coupon 'once' s'applique
    // a la PROCHAINE facture et est consomme une fois celle-ci finalisee ;
    // aucune facture n'est emise pendant le trial, donc le coupon s'applique
    // naturellement a la premiere facture reelle du mois 2).
    const subscriptionData: Record<string, unknown> = { metadata: { user_id: userId } };
    if (claimedOffer && claimedOffer.trialPeriodDays > 0) {
      subscriptionData.trial_period_days = claimedOffer.trialPeriodDays;
    }

    const sessionParams: Record<string, unknown> = {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      subscription_data: subscriptionData,
      metadata: { user_id: userId, requested_plan: plan },
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
    };
    if (claimedOffer && claimedOffer.stripeCouponId) {
      sessionParams.discounts = [{ coupon: claimedOffer.stripeCouponId }];
    }

    const session = await deps.stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      console.error("[create-checkout-session] Stripe n'a renvoye aucune URL de session");
      await releaseCheckoutSlot(deps, userId);
      if (claimedOffer) await releaseCommercialOffer(deps, userId);
      return { ok: false, status: 500, error: GENERIC_SERVER_ERROR };
    }

    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[create-checkout-session] erreur inattendue apres reservation", e);
    await releaseCheckoutSlot(deps, userId);
    if (claimedOffer) await releaseCommercialOffer(deps, userId);
    return { ok: false, status: 500, error: GENERIC_SERVER_ERROR };
  }
}
