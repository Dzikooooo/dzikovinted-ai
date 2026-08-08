import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { resolvePlanFromPriceId } from "../_shared/plans.ts";
import { resolvePlanForStatus, type Plan } from "./subscriptionState.ts";
import { resolveUserId } from "./userResolution.ts";
import { isEventApplicable, stripeEventTimestamp } from "./eventOrdering.ts";

export interface StripeWebhookDeps {
  supabaseAdmin: SupabaseClient;
  now: () => Date;
}

export interface StripeWebhookResult {
  status: number;
  body: unknown;
}

// Formes etroites (uniquement les champs reellement lus) plutot que les
// types Stripe complets -- meme discipline que create-checkout-session
// (Lot 2), garde les fakes de test triviaux.
export interface MinimalSubscriptionEventObject {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: number;
  current_period_end: number;
  metadata: { user_id?: string } | null;
  items: { data: Array<{ price: { id: string } }> };
}

export interface MinimalCheckoutSessionObject {
  customer: string | null;
  client_reference_id: string | null;
  metadata: { user_id?: string } | null;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  created: number;
  data: { object: unknown };
}

const OK_RESPONSE: StripeWebhookResult = { status: 200, body: { received: true } };
const INTERNAL_ERROR_RESPONSE: StripeWebhookResult = { status: 500, body: { error: "internal" } };

interface SubscriptionUpsertFields {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: number;
  currentPeriodEnd: number;
}

// Coeur partage par subscription.created/updated/deleted -- resolution
// utilisateur, garde anti-desordre (stripe_event_created_at exclusivement),
// puis upsert complet de "subscriptions" + ecriture "profiles.plan" en
// service_role. Aucun appel a admin_set_user_plan (RPC reservee a une
// action ADMIN explicite sur un AUTRE utilisateur, hors de propos ici).
async function applySubscriptionEvent(
  deps: StripeWebhookDeps,
  eventCreatedUnix: number,
  metadataUserId: string | null,
  fields: SubscriptionUpsertFields,
  plan: Plan | "unresolvable"
): Promise<StripeWebhookResult> {
  const resolved = await resolveUserId({ supabaseAdmin: deps.supabaseAdmin }, fields.stripeCustomerId, metadataUserId);
  if (!resolved) {
    console.error("[stripe-webhook] utilisateur introuvable pour customer", fields.stripeCustomerId);
    return OK_RESPONSE;
  }

  // Correction explicite du Lot 3 : Price ID inconnu sur un statut payant
  // -> AUCUNE ecriture, ni profiles.plan ni l'etat billing dans
  // subscriptions -- jamais d'etat partiellement applique tant que le
  // mapping est inconnu. Verifie AVANT toute lecture/ecriture pour rester
  // un no-op complet.
  if (plan === "unresolvable") {
    console.error("[stripe-webhook] Price ID inconnu sur un abonnement payant, aucune ecriture", {
      customer: fields.stripeCustomerId,
      status: fields.status,
    });
    return OK_RESPONSE;
  }

  const { data: existingRow, error: fetchError } = await deps.supabaseAdmin
    .from("subscriptions")
    .select("stripe_event_created_at")
    .eq("user_id", resolved.userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[stripe-webhook] echec lecture subscriptions", fetchError);
    return INTERNAL_ERROR_RESPONSE;
  }

  const storedRow = existingRow as { stripe_event_created_at: string | null } | null;
  const storedAt = storedRow?.stripe_event_created_at ? new Date(storedRow.stripe_event_created_at) : null;

  if (!isEventApplicable(storedAt, eventCreatedUnix)) {
    console.log("[stripe-webhook] evenement plus ancien que l'etat stocke, ignore sans modification");
    return OK_RESPONSE;
  }

  const nowIso = deps.now().toISOString();
  const { error: upsertError } = await deps.supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: resolved.userId,
      stripe_customer_id: fields.stripeCustomerId,
      stripe_subscription_id: fields.stripeSubscriptionId,
      status: fields.status,
      cancel_at_period_end: fields.cancelAtPeriodEnd,
      current_period_start: new Date(fields.currentPeriodStart * 1000).toISOString(),
      current_period_end: new Date(fields.currentPeriodEnd * 1000).toISOString(),
      stripe_event_created_at: stripeEventTimestamp(eventCreatedUnix).toISOString(),
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    console.error("[stripe-webhook] echec upsert subscriptions", upsertError);
    return INTERNAL_ERROR_RESPONSE;
  }

  // Ecriture directe en service_role -- profiles.plan a son UPDATE revoque
  // pour authenticated depuis 20260711090000, service_role contourne RLS/
  // grants par nature, aucune RPC necessaire (admin_set_user_plan reste
  // reservee a une action admin explicite sur un compte tiers).
  const { error: profileError } = await deps.supabaseAdmin.from("profiles").update({ plan }).eq("id", resolved.userId);
  if (profileError) {
    console.error("[stripe-webhook] echec mise a jour profiles.plan", profileError);
    return INTERNAL_ERROR_RESPONSE;
  }

  return OK_RESPONSE;
}

function handleSubscriptionCreatedOrUpdated(
  deps: StripeWebhookDeps,
  eventCreatedUnix: number,
  subscription: MinimalSubscriptionEventObject
): Promise<StripeWebhookResult> {
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const mappedPlan = priceId ? resolvePlanFromPriceId(priceId) : null;
  const decision = resolvePlanForStatus(subscription.status, mappedPlan);
  const plan: Plan | "unresolvable" =
    decision.kind === "unresolvable" ? "unresolvable" : decision.kind === "free" ? "free" : decision.plan;

  return applySubscriptionEvent(
    deps,
    eventCreatedUnix,
    subscription.metadata?.user_id ?? null,
    {
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
    },
    plan
  );
}

function handleSubscriptionDeleted(
  deps: StripeWebhookDeps,
  eventCreatedUnix: number,
  subscription: MinimalSubscriptionEventObject
): Promise<StripeWebhookResult> {
  // subscription.deleted implique toujours 'canceled' -- pas besoin de
  // resoudre de Price ID, jamais "unresolvable" pour cet evenement.
  return applySubscriptionEvent(
    deps,
    eventCreatedUnix,
    subscription.metadata?.user_id ?? null,
    {
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      status: "canceled",
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
    },
    "free"
  );
}

// checkout.session.completed : filet de securite pour rattacher
// stripe_customer_id si l'ecriture synchrone de create-checkout-session
// (Lot 2) avait echoue -- ne touche JAMAIS status/cancel_at_period_end/
// current_period_*/stripe_event_created_at/profiles.plan. Structurellement
// incapable d'attribuer un plan (contrainte #8) : aucun chemin de code vers
// profiles dans cette fonction.
async function handleCheckoutCompleted(
  deps: StripeWebhookDeps,
  session: MinimalCheckoutSessionObject
): Promise<StripeWebhookResult> {
  if (!session.customer) {
    console.error("[stripe-webhook] checkout.session.completed sans customer, ignore");
    return OK_RESPONSE;
  }

  const userId = session.metadata?.user_id ?? session.client_reference_id ?? null;
  if (!userId) {
    console.error("[stripe-webhook] checkout.session.completed sans user_id resolvable, ignore");
    return OK_RESPONSE;
  }

  const { error } = await deps.supabaseAdmin.from("subscriptions").upsert(
    { user_id: userId, stripe_customer_id: session.customer, updated_at: deps.now().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[stripe-webhook] echec upsert stripe_customer_id (checkout.session.completed)", error);
    return INTERNAL_ERROR_RESPONSE;
  }

  return OK_RESPONSE;
}

// Point d'entree unique -- index.ts appelle exclusivement cette fonction
// apres verification de signature. Tout evenement compris mais non
// exploitable (type non gere, invoice.*) repond 200 : Stripe ne doit
// relancer que sur une vraie panne transitoire (500), jamais parce qu'on a
// choisi de ne rien faire d'un evenement bien recu.
export async function processStripeWebhookEvent(
  deps: StripeWebhookDeps,
  event: StripeWebhookEvent
): Promise<StripeWebhookResult> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return handleSubscriptionCreatedOrUpdated(deps, event.created, event.data.object as MinimalSubscriptionEventObject);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(deps, event.created, event.data.object as MinimalSubscriptionEventObject);
    case "checkout.session.completed":
      return handleCheckoutCompleted(deps, event.data.object as MinimalCheckoutSessionObject);
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      // Log uniquement pour ce lot -- customer.subscription.updated reste
      // l'autorite du statut (pas de downgrade immediat sur un echec de
      // paiement, voir past_due dans PAYING_STATUSES). notifications.type
      // n'accepte pas encore de valeur billing (CHECK contraint a
      // 'sale'/'community'/'admin_broadcast', migration 20260804120000) --
      // pas de migration ajoutee dans ce lot pour l'etendre.
      console.log(`[stripe-webhook] ${event.type} recu (log uniquement, aucune mutation)`);
      return OK_RESPONSE;
    default:
      console.log(`[stripe-webhook] type d'evenement non gere: ${event.type}`);
      return OK_RESPONSE;
  }
}
