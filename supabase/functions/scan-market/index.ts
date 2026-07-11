import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GITHUB_OWNER = "Dzikooooo";
const GITHUB_REPO = "dzikovinted-ai";
const WORKFLOW_FILE = "scan-market.yml";
const WORKFLOW_REF = "main";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Playwright (navigateur headless) ne peut pas tourner dans une Edge
// Function Deno - confirme en direct le 2026-07-11 : un appel fetch()
// direct a l'API catalogue Vinted, meme avec un vrai cookie de session
// bootstrap et des en-tetes de navigateur realistes, est rejete (401/403).
// Vinted emet son jeton de session anonyme via du JavaScript execute au
// chargement de la page - seul un vrai navigateur (ou Playwright) peut
// l'obtenir. Cette fonction ne fait donc plus qu'un declenchement : elle
// lance le workflow GitHub Actions existant (scripts/vinted-scan.ts, deja
// eprouve en production via le cron de 4h) immediatement au lieu d'attendre
// la prochaine fenetre, et lui transmet l'action_id pour qu'il journalise
// sa propre progression (voir scripts/vinted-scan.ts, meme table
// action_log_entries, ecrite avec la cle service_role qu'il a deja).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const { action_id: actionId } = await req.json();
    if (!actionId || typeof actionId !== "string") {
      return jsonResponse(400, { error: "action_id is required" });
    }

    const githubToken = Deno.env.get("GITHUB_ACTIONS_TOKEN");
    if (!githubToken) {
      return jsonResponse(500, { error: "GITHUB_ACTIONS_TOKEN manquant. Impossible de déclencher le scan." });
    }

    const dispatchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: WORKFLOW_REF, inputs: { action_id: actionId } }),
      }
    );

    if (dispatchRes.status !== 204) {
      const detail = await dispatchRes.text().catch(() => "");
      console.error("scan-market: workflow dispatch failed", dispatchRes.status, detail);
      return jsonResponse(502, {
        error: "Impossible de déclencher le scan pour le moment. Réessaie plus tard.",
      });
    }

    // Progression detaillee (Connexion/Recherche/Analyse/Classement/
    // Enregistrement) journalisee par scripts/vinted-scan.ts lui-meme une
    // fois le runner GitHub Actions demarre - cette entree initiale confirme
    // juste que le declenchement a reussi, avant que le runner ne demarre
    // (delai reel de quelques dizaines de secondes, propre a GitHub Actions).
    try {
      await userClient.from("action_log_entries").insert({
        action_id: actionId,
        step: "connecting",
        message: "Scan déclenché — démarrage en cours…",
      });
    } catch (e) {
      console.error("scan-market: initial log failed", e);
    }

    return jsonResponse(200, { dispatched: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Le déclenchement du scan a échoué.";
    return jsonResponse(500, { error: message });
  }
});
