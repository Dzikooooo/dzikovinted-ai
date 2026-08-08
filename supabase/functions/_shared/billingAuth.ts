import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Partage entre create-checkout-session (Lot 2) et create-portal-session
// (Lot 4) -- meme discipline d'auth que analyze-clothing (verifier le JWT
// avec un client anon+Authorization, puis creer un client service_role
// distinct pour toute lecture/ecriture privilegiee) et meme garde banned que
// P1-B (migration 20260808110000). stripe-webhook (Lot 3) n'utilise PAS ce
// module : sa frontiere de securite est la signature Stripe, pas un JWT
// Supabase (Stripe n'en fournit jamais un).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface BillingAuthContext {
  userId: string;
  userEmail: string | null;
  supabaseAdmin: SupabaseClient;
}

// Fabriques de client injectables -- permet a billingAuth.test.ts de fournir
// des clients factices (sans appel reseau reel) pour couvrir les branches
// 401/403 exigees par le Lot 2, sans devoir monter un vrai projet Supabase
// de test. index.ts (create-checkout-session/create-portal-session) appelle
// authenticateBillingUser(req) sans second argument : defaultDeps ci-dessous
// s'applique alors automatiquement, comportement inchange en production.
export interface AuthenticateBillingUserDeps {
  createAnonClient: (authHeader: string) => SupabaseClient;
  createAdminClient: () => SupabaseClient;
}

const defaultDeps: AuthenticateBillingUserDeps = {
  createAnonClient: (authHeader) =>
    createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    }),
  createAdminClient: () =>
    createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
};

// Retourne le contexte authentifie, ou directement la Response d'erreur a
// renvoyer telle quelle (401 sans JWT valide, 403 si banned, 500 si le
// profil est introuvable) -- l'appelant fait
// `if (result instanceof Response) return result;`.
export async function authenticateBillingUser(
  req: Request,
  deps: AuthenticateBillingUserDeps = defaultDeps
): Promise<BillingAuthContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Missing authorization header" });
  }

  const supabaseAnon = deps.createAnonClient(authHeader);

  const {
    data: { user },
    error: authError,
  } = await supabaseAnon.auth.getUser();

  if (authError || !user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const supabaseAdmin = deps.createAdminClient();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("banned, email")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse(500, { error: "Profil introuvable" });
  }

  if (profile.banned) {
    return jsonResponse(403, { error: "Compte suspendu" });
  }

  return { userId: user.id, userEmail: profile.email ?? null, supabaseAdmin };
}
