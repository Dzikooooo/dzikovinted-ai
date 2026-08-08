import type Stripe from "npm:stripe@17";

// Injectable pour permettre des tests sans devoir signer un vrai payload
// HMAC (impossible a reproduire proprement sans le secret webhook reel).
export interface VerifySignatureDeps {
  constructEventAsync: (payload: string, signature: string, secret: string) => Promise<Stripe.Event>;
}

// Utilise constructEventAsync (pas constructEvent) -- le SDK Stripe verifie
// la signature HMAC via le module `crypto` de Node par defaut, absent du
// runtime Deno ; la variante async passe par SubtleCrypto (Web Crypto API),
// disponible nativement en Deno. Retourne null sur toute signature
// absente/invalide plutot que de laisser l'exception remonter -- l'appelant
// (index.ts) traduit un null en 400, jamais en tentative de traitement.
export async function verifyStripeWebhookRequest(
  deps: VerifySignatureDeps,
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): Promise<Stripe.Event | null> {
  if (!signatureHeader) return null;
  try {
    return await deps.constructEventAsync(rawBody, signatureHeader, webhookSecret);
  } catch {
    return null;
  }
}
