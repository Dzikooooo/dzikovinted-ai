import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type Stripe from "npm:stripe@17";
import { authenticateBillingUser, corsHeaders, jsonResponse } from "../_shared/billingAuth.ts";
import { getStripeClient } from "../_shared/stripe.ts";
import { createPortalSessionForUser, type StripeClientForPortal } from "./handler.ts";

// Meme piege que create-checkout-session (Lot 2) : Stripe.Customer.deleted
// est type void sur un client vivant, incompatible structurellement avec
// { deleted?: boolean }. Adaptateur explicite plutot que de compter sur une
// compatibilite implicite -- deja verifie via deno check pour ce lot aussi.
function toPortalClient(stripe: Stripe): StripeClientForPortal {
  return {
    customers: {
      retrieve: async (id) => {
        const customer = await stripe.customers.retrieve(id);
        return { id: customer.id, deleted: "deleted" in customer && customer.deleted === true };
      },
    },
    billingPortal: {
      sessions: {
        // Double cast deliberement explicite : SessionCreateParams exige
        // `customer: string` en champ obligatoire, absent structurellement
        // de Record<string, unknown> -- TS refuse le cast direct ("neither
        // type sufficiently overlaps"), signale par deno check. C'est
        // exactement le point de jonction attendu entre l'interface etroite
        // testable et le type Stripe strict, pas une erreur a masquer.
        create: (params) => stripe.billingPortal.sessions.create(params as unknown as Stripe.BillingPortal.SessionCreateParams),
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
    const { userId, supabaseAdmin } = auth;

    const stripe = getStripeClient();
    const result = await createPortalSessionForUser({ stripe: toPortalClient(stripe), supabaseAdmin }, userId);

    if (!result.ok) {
      return jsonResponse(result.status, { error: result.error });
    }

    return jsonResponse(200, { url: result.url });
  } catch (e) {
    console.error("[create-portal-session] erreur inattendue", e);
    return jsonResponse(500, { error: "Erreur serveur, réessaie plus tard." });
  }
});
