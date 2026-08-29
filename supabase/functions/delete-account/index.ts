import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { deleteUserAccount } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Meme discipline d'auth que analyze-clothing (JWT verifie via un client
// anon+Authorization, puis un client service_role distinct pour l'ecriture
// privilegiee) -- delibarement PAS authenticateBillingUser()
// (_shared/billingAuth.ts) : celui-ci renvoie 403 pour un compte banned, et
// le droit RGPD a l'effacement (LegalPage.tsx section 6) s'applique quel
// que soit le statut du compte -- bannir quelqu'un ne doit jamais
// l'empecher de faire valoir ce droit.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    const supabaseAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAnon.auth.getUser();

    if (authError || !user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const result = await deleteUserAccount({ supabaseAdmin }, user.id);

    if (!result.ok) {
      return jsonResponse(result.status, { error: result.error });
    }

    return jsonResponse(200, { ok: true });
  } catch (e) {
    console.error("[delete-account] erreur inattendue", e);
    return jsonResponse(500, { error: "Erreur serveur, réessaie plus tard." });
  }
});
