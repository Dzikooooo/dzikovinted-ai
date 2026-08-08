import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripe.ts";
import { verifyStripeWebhookRequest } from "./verifySignature.ts";
import { processStripeWebhookEvent } from "./handler.ts";

// Pas de verification JWT Supabase sur cette fonction (deploiement prevu
// avec --no-verify-jwt) -- Stripe ne peut fournir aucun JWT Supabase. La
// frontiere de securite ici est exclusivement la signature Stripe verifiee
// ci-dessous, jamais l'auth Supabase habituelle.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET manquant (secret Supabase non configure)");
    return jsonResponse(500, { error: "internal" });
  }

  // Corps BRUT imperatif : constructEventAsync verifie le HMAC sur la
  // chaine exacte recue. req.json() reserialiserait le corps et casserait
  // silencieusement la verification -- jamais parser avant cette etape.
  const rawBody = await req.text();
  const signature = req.headers.get("Stripe-Signature");

  const stripe = getStripeClient();
  const event = await verifyStripeWebhookRequest(
    { constructEventAsync: (payload, sig, secret) => stripe.webhooks.constructEventAsync(payload, sig, secret) },
    rawBody,
    signature,
    webhookSecret
  );

  if (!event) {
    console.error("[stripe-webhook] signature Stripe absente ou invalide");
    return jsonResponse(400, { error: "invalid signature" });
  }

  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const result = await processStripeWebhookEvent({ supabaseAdmin, now: () => new Date() }, event);
    return jsonResponse(result.status, result.body);
  } catch (e) {
    console.error("[stripe-webhook] erreur inattendue", e);
    return jsonResponse(500, { error: "internal" });
  }
});
