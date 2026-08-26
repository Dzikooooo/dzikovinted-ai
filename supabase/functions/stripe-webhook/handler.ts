import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { resolvePlanFromPriceId, type BillablePlan } from "../_shared/plans.ts";
import { resolvePlanDecision, type Plan } from "./subscriptionState.ts";
import { resolveUserId } from "./userResolution.ts";
import { stripeEventTimestamp } from "./eventOrdering.ts";

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

// P1-2 (audit pre-lancement Stripe LIVE, 2026-08-09) : remplace l'ancien
// SELECT stripe_event_created_at + upsert (non atomique -- deux evenements
// traites en parallele pouvaient laisser un evenement plus ancien ecraser
// un plus recent deja commit) par un seul appel a apply_subscription_event
// (migration 20260809100000), UPSERT conditionnel cote SQL dont la clause
// WHERE reevalue stripe_event_created_at SOUS LE VERROU DE LIGNE pris par
// ON CONFLICT -- deux appels concurrents pour le meme utilisateur
// serialisent reellement, celui qui commit en second reevalue contre
// l'etat DEJA ECRIT par le premier. Renvoie `applied=false` sans avoir
// rien modifie si l'evenement est plus ancien que l'etat deja stocke.
async function applySubscriptionRow(
  deps: StripeWebhookDeps,
  userId: string,
  eventCreatedUnix: number,
  fields: SubscriptionUpsertFields
): Promise<{ ok: true; applied: boolean } | { ok: false }> {
  const { data, error } = await deps.supabaseAdmin.rpc("apply_subscription_event", {
    p_user_id: userId,
    p_stripe_customer_id: fields.stripeCustomerId,
    p_stripe_subscription_id: fields.stripeSubscriptionId,
    p_status: fields.status,
    p_cancel_at_period_end: fields.cancelAtPeriodEnd,
    p_current_period_start: new Date(fields.currentPeriodStart * 1000).toISOString(),
    p_current_period_end: new Date(fields.currentPeriodEnd * 1000).toISOString(),
    p_stripe_event_created_at: stripeEventTimestamp(eventCreatedUnix).toISOString(),
    p_now: deps.now().toISOString(),
  });

  if (error) {
    console.error("[stripe-webhook] echec apply_subscription_event", error);
    return { ok: false };
  }

  return { ok: true, applied: data === true };
}

// Coeur partage par subscription.created/updated -- resolution utilisateur,
// lecture du plan deja accorde (necessaire a la distinction P1-3 pour le
// statut past_due, voir subscriptionState.ts), ecriture atomique de
// "subscriptions" (P1-2), puis ecriture conditionnelle de "profiles.plan"
// en service_role. Aucun appel a admin_set_user_plan (RPC reservee a une
// action ADMIN explicite sur un AUTRE utilisateur, hors de propos ici).
async function applySubscriptionEvent(
  deps: StripeWebhookDeps,
  eventCreatedUnix: number,
  metadataUserId: string | null,
  fields: SubscriptionUpsertFields,
  mappedPlan: BillablePlan | null
): Promise<StripeWebhookResult> {
  const resolved = await resolveUserId({ supabaseAdmin: deps.supabaseAdmin }, fields.stripeCustomerId, metadataUserId);
  if (!resolved) {
    console.error("[stripe-webhook] utilisateur introuvable pour customer", fields.stripeCustomerId);
    return OK_RESPONSE;
  }

  const { data: profileRow, error: profileFetchError } = await deps.supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("id", resolved.userId)
    .maybeSingle();

  if (profileFetchError) {
    console.error("[stripe-webhook] echec lecture profiles.plan", profileFetchError);
    return INTERNAL_ERROR_RESPONSE;
  }

  const currentPlan: Plan = (profileRow as { plan: Plan } | null)?.plan ?? "free";
  const decision = resolvePlanDecision(fields.status, mappedPlan, currentPlan);

  // Correction explicite du Lot 3, conservee : Price ID inconnu sur un
  // statut payant/grace -> AUCUNE ecriture, ni profiles.plan ni l'etat
  // billing dans subscriptions -- jamais d'etat partiellement applique.
  if (decision.kind === "unresolvable") {
    console.error("[stripe-webhook] Price ID inconnu sur un abonnement payant, aucune ecriture", {
      customer: fields.stripeCustomerId,
      status: fields.status,
    });
    return OK_RESPONSE;
  }

  const applyResult = await applySubscriptionRow(deps, resolved.userId, eventCreatedUnix, fields);
  if (!applyResult.ok) {
    return INTERNAL_ERROR_RESPONSE;
  }
  if (!applyResult.applied) {
    console.log("[stripe-webhook] evenement plus ancien que l'etat stocke, ignore sans modification");
    return OK_RESPONSE;
  }

  // "unchanged" (P1-3) : past_due sur un changement de plan non confirme --
  // subscriptions.status reflete deja la realite Stripe (ecrit ci-dessus),
  // profiles.plan reste intentionnellement intact.
  if (decision.kind === "unchanged") {
    return OK_RESPONSE;
  }

  const plan = decision.kind === "free" ? "free" : decision.plan;

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
  // resolvePlanFromPriceId rend desormais { plan, interval } (facturation
  // annuelle, 2026-08-26). Seul le PLAN determine les droits : un abonne
  // annuel Pro a exactement les droits d'un abonne mensuel Pro.
  const resolved = priceId ? resolvePlanFromPriceId(priceId) : null;
  const mappedPlan = resolved?.plan ?? null;

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
    mappedPlan
  );
}

// subscription.deleted : toujours 'canceled'/'free', inconditionnellement
// -- ne passe jamais par resolvePlanDecision (statut 'canceled' n'est de
// toute facon dans aucune liste "payante"), ecrit directement via la meme
// voie atomique que les autres evenements.
async function handleSubscriptionDeleted(
  deps: StripeWebhookDeps,
  eventCreatedUnix: number,
  subscription: MinimalSubscriptionEventObject
): Promise<StripeWebhookResult> {
  const resolved = await resolveUserId(
    { supabaseAdmin: deps.supabaseAdmin },
    subscription.customer,
    subscription.metadata?.user_id ?? null
  );
  if (!resolved) {
    console.error("[stripe-webhook] utilisateur introuvable pour customer", subscription.customer);
    return OK_RESPONSE;
  }

  const applyResult = await applySubscriptionRow(deps, resolved.userId, eventCreatedUnix, {
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    status: "canceled",
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
  });
  if (!applyResult.ok) {
    return INTERNAL_ERROR_RESPONSE;
  }
  if (!applyResult.applied) {
    console.log("[stripe-webhook] evenement plus ancien que l'etat stocke, ignore sans modification");
    return OK_RESPONSE;
  }

  const { error: profileError } = await deps.supabaseAdmin.from("profiles").update({ plan: "free" }).eq("id", resolved.userId);
  if (profileError) {
    console.error("[stripe-webhook] echec mise a jour profiles.plan (deleted)", profileError);
    return INTERNAL_ERROR_RESPONSE;
  }

  return OK_RESPONSE;
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
      // paiement, voir past_due dans FULLY_PAYING_STATUSES/GRACE_STATUS).
      // notifications.type n'accepte pas encore de valeur billing (CHECK
      // contraint a 'sale'/'community'/'admin_broadcast', migration
      // 20260804120000) -- pas de migration ajoutee dans ce lot pour
      // l'etendre.
      console.log(`[stripe-webhook] ${event.type} recu (log uniquement, aucune mutation)`);
      return OK_RESPONSE;
    default:
      console.log(`[stripe-webhook] type d'evenement non gere: ${event.type}`);
      return OK_RESPONSE;
  }
}
