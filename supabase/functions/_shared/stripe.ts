import Stripe from "npm:stripe@17";

// Client Stripe partage (create-checkout-session, create-portal-session,
// stripe-webhook). httpClient explicite obligatoire : le SDK Stripe utilise
// par defaut un client HTTP base sur des modules Node (`https`), absents en
// Deno -- Stripe.createFetchHttpClient() bascule sur fetch(), disponible
// nativement dans le runtime Edge Functions. Sans ca, tout appel Stripe
// echoue au demarrage.
//
// Pas de apiVersion fixee explicitement : le SDK utilise la version qu'il
// embarque par defaut (stable, verrouillee par le numero de version du
// package lui-meme). A durcir plus tard si besoin d'un pin explicite.
export function getStripeClient(): Stripe {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY manquant (secret Supabase non configure)");
  }
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
