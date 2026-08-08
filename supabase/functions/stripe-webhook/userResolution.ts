import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface UserResolutionDeps {
  supabaseAdmin: SupabaseClient;
}

export type UserResolutionSource = "subscriptions_table" | "event_metadata";

export interface ResolvedUser {
  userId: string;
  source: UserResolutionSource;
}

// Primaire : subscriptions.stripe_customer_id (pose de facon synchrone par
// create-checkout-session avant meme le premier webhook, voir Lot 2 --
// fiable dans l'immense majorite des cas).
// Fallback : metadata.user_id porte par l'evenement Stripe lui-meme --
// donnee que ResellOS a ecrite lui-meme au moment du Checkout
// (subscription_data.metadata.user_id, Lot 2), jamais une valeur fournie
// par un tiers non authentifie : Stripe se contente de nous renvoyer ce
// qu'on lui a confie.
// Aucune resolution -> null, l'appelant ne doit ecrire aucun etat.
export async function resolveUserId(
  deps: UserResolutionDeps,
  stripeCustomerId: string,
  metadataUserId: string | null
): Promise<ResolvedUser | null> {
  const { data, error } = await deps.supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (!error && data) {
    return { userId: (data as { user_id: string }).user_id, source: "subscriptions_table" };
  }

  if (metadataUserId) {
    return { userId: metadataUserId, source: "event_metadata" };
  }

  return null;
}
