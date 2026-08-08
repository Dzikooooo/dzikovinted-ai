import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type Stripe from "npm:stripe@17";
import { authenticateBillingUser, corsHeaders, jsonResponse } from "../_shared/billingAuth.ts";
import { getStripeClient } from "../_shared/stripe.ts";
import { parseRequestedPlan } from "./validation.ts";
import { createCheckoutSessionForPlan, type StripeClientForCheckout } from "./handler.ts";

// Adaptateur explicite plutot que de passer le client Stripe reel tel quel
// comme StripeClientForCheckout -- rend le pont entre le SDK complet et
// l'interface etroite testable (handler.test.ts) sans dependre d'une
// compatibilite structurelle implicite entre les deux types, non verifiable
// ici faute de toolchain Deno local (voir plan Lot 2). Seul point du fichier
// ou le cast vers les types Stripe stricts a lieu, deliberement isole.
function toCheckoutClient(stripe: Stripe): StripeClientForCheckout {
  return {
    customers: {
      // Stripe.Customer.deleted est type void (present mais jamais assigne)
      // sur un Customer vivant, true uniquement sur Stripe.DeletedCustomer --
      // normalise explicitement en boolean plutot que de compter sur une
      // compatibilite structurelle implicite avec StripeClientForCheckout
      // (deno check a signale l'incompatibilite : void n'est pas assignable
      // a boolean | undefined).
      retrieve: async (id) => {
        const customer = await stripe.customers.retrieve(id);
        return { id: customer.id, deleted: "deleted" in customer && customer.deleted === true };
      },
      create: (params) => stripe.customers.create(params),
    },
    checkout: {
      sessions: {
        create: (params) => stripe.checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams),
      },
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await authenticateBillingUser(req);
    if (auth instanceof Response) return auth;
    const { userId, userEmail, supabaseAdmin } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Corps de requête invalide" });
    }

    const parsed = parseRequestedPlan(body);
    if (!parsed.ok) {
      return jsonResponse(400, { error: parsed.error });
    }

    const stripe = getStripeClient();
    const result = await createCheckoutSessionForPlan(
      { stripe: toCheckoutClient(stripe), supabaseAdmin, now: () => new Date() },
      userId,
      userEmail,
      parsed.plan
    );

    if (!result.ok) {
      return jsonResponse(result.status, { error: result.error });
    }

    return jsonResponse(200, { url: result.url });
  } catch (e) {
    console.error("[create-checkout-session] erreur inattendue", e);
    return jsonResponse(500, { error: "Erreur serveur, réessaie plus tard." });
  }
});
