import { supabase } from './supabase';
import type { Plan } from './types';
import type { BillingInterval } from './billingInterval';

// Client Stripe (Lot 5, freeze beta 2026-08-08) -- appelle uniquement les
// Edge Functions deja livrees et testees en Deno (Lots 2/4) : aucune cle
// Stripe, aucun Stripe.js ici. Meme convention d'appel que
// src/lib/actions/handlers/scanMarket.ts::execute (supabase.functions.invoke
// + extraction du message d'erreur JSON reel plutot qu'un message HTTP
// generique).

export type BillablePlan = Extract<Plan, 'pro' | 'team'>;

export type BillingResult = { ok: true; url: string } | { ok: false; error: string };

interface CheckoutResponse {
  url: string;
}

interface PortalResponse {
  url: string;
}

const GENERIC_CHECKOUT_ERROR = 'Impossible de démarrer le paiement, réessaie plus tard.';
const GENERIC_PORTAL_ERROR = "Impossible d'ouvrir la gestion de l'abonnement, réessaie plus tard.";
const SESSION_EXPIRED_ERROR = 'Ta session a expiré, reconnecte-toi.';

// authenticateBillingUser (supabase/functions/_shared/billingAuth.ts) renvoie
// ces deux textes anglais bruts pour 401 -- jamais destines a l'affichage
// direct, on les traduit ici plutot que de les montrer tels quels.
const AUTH_ERROR_MESSAGES = new Set(['Unauthorized', 'Missing authorization header']);

async function extractErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === 'string' && body.error.length > 0) {
          return AUTH_ERROR_MESSAGES.has(body.error) ? SESSION_EXPIRED_ERROR : body.error;
        }
      } catch {
        // corps non-JSON ou deja consomme -- retombe sur le fallback
      }
      return fallback;
    }
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

// `interval` par defaut "month" : un appelant non mis a jour garde
// exactement le comportement d'avant l'ajout de l'annuel. Le serveur applique
// la meme regle (validation.ts) -- un engagement de douze mois ne doit jamais
// resulter d'une omission, des deux cotes.
export async function startCheckout(
  plan: BillablePlan,
  interval: BillingInterval = 'month'
): Promise<BillingResult> {
  const { data, error } = await supabase.functions.invoke<CheckoutResponse>('create-checkout-session', {
    body: { plan, interval },
  });

  if (error) {
    return { ok: false, error: await extractErrorMessage(error, GENERIC_CHECKOUT_ERROR) };
  }
  if (!data?.url) {
    return { ok: false, error: GENERIC_CHECKOUT_ERROR };
  }
  return { ok: true, url: data.url };
}

export async function openBillingPortal(): Promise<BillingResult> {
  const { data, error } = await supabase.functions.invoke<PortalResponse>('create-portal-session', {
    body: {},
  });

  if (error) {
    return { ok: false, error: await extractErrorMessage(error, GENERIC_PORTAL_ERROR) };
  }
  if (!data?.url) {
    return { ok: false, error: GENERIC_PORTAL_ERROR };
  }
  return { ok: true, url: data.url };
}
