import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isMetered } from "../_shared/credits.ts";
import { computeAccountStats, type AccountAuditListingRow } from "./stats.ts";
import { buildAccountAuditPrompt } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Meme plafond que PostgREST par requete -- .range() boucle jusqu'a
// epuisement, exactement comme fetchAllRows() cote client (src/lib/
// supabaseExhaustiveFetch.ts) qu'on ne peut pas importer ici (frontiere de
// build Vite/Deno, voir marketEngine.ts). En pratique tres au-dela du volume
// reel d'un compte (des centaines d'annonces max a ce jour), mais correct
// par construction plutot que suppose jamais atteint.
const PAGE_SIZE = 1000;

// Audit du compte Vinted (2026-08-30) -- remplace Pricer Pro (audit
// d'annonce isolee, retire). Perimetre VOLONTAIREMENT limite aux annonces
// deja stockees en base pour ce premier lot (titre/description/categorie/
// etat/prix/statuts) : ni la photo de profil ni la bio Vinted ne sont
// analysees, faute de capacite de scraping existante pour les capturer (voir
// stats.ts, prompt.ts). Meme squelette que analyze-clothing/index.ts (auth
// JWT -> client anon, credits reserve/consume/refund via client service_role
// distinct) -- fonction SEPAREE, meme raison que l'ancien audit-listing :
// contrat d'entree/sortie different (aucun listing_id, tout le compte),
// jamais de risque pour le Generateur deja en production.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let supabase: ReturnType<typeof createClient> | null = null;
  let supabaseAdmin: ReturnType<typeof createClient> | null = null;
  let reservationId: string | null = null;
  let verifiedUserId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }
    verifiedUserId = user.id;

    supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const geminiKeyOverride = typeof body?.gemini_key === "string" ? body.gemini_key : undefined;
    // Audit cible (2026-08-30) : le compte SELECTIONNE cote client
    // (VintedAccountFilterContext) -- absent/"all" = tous les comptes Vinted
    // de l'utilisateur (comportement precedent, toujours utile pour un
    // utilisateur mono-compte). Jamais verifie via une seconde requete :
    // l'usage direct de cette valeur dans le filtre .eq() ci-dessous suffit,
    // la policy select_own_listings empeche deja d'atteindre le compte d'un
    // autre utilisateur meme avec un id invente.
    const vintedAccountId = typeof body?.vinted_account_id === "string" ? body.vinted_account_id : undefined;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan, role, banned, credits_mode")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse(500, { error: "Profil introuvable" });
    }

    if (profile.banned) {
      return jsonResponse(403, { error: "Compte suspendu" });
    }

    const metered = isMetered(profile);

    if (metered) {
      const { data: reserveData, error: reserveError } = await supabaseAdmin.rpc("reserve_credit", { p_user_id: user.id });
      if (reserveError) {
        const status = reserveError.message?.includes("insufficient_credits") ? 402 : 500;
        return jsonResponse(status, {
          error:
            status === 402
              ? "Tu as atteint ta limite de credits. Passe au plan Pro pour continuer."
              : "Impossible de verifier tes credits pour le moment.",
        });
      }
      reservationId = reserveData as string;
    }

    const apiKey = geminiKeyOverride || Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
      return jsonResponse(500, { error: "GEMINI_API_KEY manquante. Impossible d'auditer ce compte." });
    }

    // Client anon+JWT (PAS supabaseAdmin) : la policy select_own_listings
    // s'assure deja qu'on ne peut jamais lire les annonces de quelqu'un
    // d'autre -- aucune verification manuelle de propriete necessaire.
    // status='en_stock' uniquement (2026-08-30) : "se baser strictement sur
    // le stock present actuellement" -- brouillons/en attente/ventes sortent
    // du perimetre de cet audit (voir stats.ts/prompt.ts, mis a jour en
    // consequence).
    const listings: AccountAuditListingRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = supabase
        .from("listings")
        .select(
          "id, title, description, category, brand, condition, price, image_urls, vinted_item_id, vinted_status, status, vinted_sync_status, created_at"
        )
        .eq("user_id", user.id)
        .eq("status", "en_stock")
        .or("vinted_status.neq.deleted,vinted_status.is.null")
        .range(offset, offset + PAGE_SIZE - 1);
      if (vintedAccountId) {
        query = query.eq("vinted_account_id", vintedAccountId);
      }
      const { data, error: listingsError } = await query;

      if (listingsError) {
        if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
        return jsonResponse(500, { error: "Impossible de charger tes annonces pour cet audit." });
      }

      const rows = (data ?? []) as AccountAuditListingRow[];
      listings.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }

    if (listings.length === 0) {
      if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
      return jsonResponse(422, { error: "Aucune annonce en stock à auditer pour ce compte pour le moment." });
    }

    const stats = computeAccountStats(listings);
    const prompt = buildAccountAuditPrompt(stats);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
            maxOutputTokens: 1500,
            // gemini-2.5-flash est un modele "thinking" par defaut -- sans ce
            // budget a 0, reponse vide (meme correctif verifie en direct sur
            // analyze-clothing le 2026-07-11).
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
      return jsonResponse(502, { error: `Gemini API error (${geminiRes.status}): ${errText.slice(0, 300)}` });
    }

    const geminiData = await geminiRes.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
      return jsonResponse(502, { error: "Empty response from Gemini" });
    }

    const parsed = JSON.parse(content);

    // GARDE CRITIQUE (meme discipline que analyze-clothing/audit-listing,
    // revue du 2026-08-04) : consume_credit_reservation peut legitimement
    // retourner false -- dans ce cas, ne jamais renvoyer le resultat comme un
    // succes, l'utilisateur a deja recupere son credit.
    if (reservationId) {
      const { data: consumed, error: consumeError } = await supabaseAdmin.rpc("consume_credit_reservation", {
        p_reservation_id: reservationId,
        p_user_id: user.id,
      });
      if (consumeError || consumed !== true) {
        console.error("consume_credit_reservation n'a pas confirme le succes -- reponse bloquee", {
          reservationId,
          consumeError,
          consumed,
        });
        return jsonResponse(409, { error: "Cet audit n'a pas pu etre finalise. Reessaie." });
      }
    }

    const { error: usageEventError } = await supabaseAdmin.from("usage_events").insert({
      user_id: user.id,
      event_type: "account_audit_completed",
      metadata: { metered, listings_count: stats.totalListings, score: stats.score },
    });
    if (usageEventError) console.error("usage_events insert error:", usageEventError);

    return jsonResponse(200, {
      audit: {
        generated_at: new Date().toISOString(),
        stats,
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
              .filter((r: unknown): r is Record<string, unknown> => typeof r === "object" && r !== null)
              .map((r: Record<string, unknown>) => ({
                category: typeof r.category === "string" ? r.category : "Général",
                severity: r.severity === "haute" || r.severity === "moyenne" || r.severity === "basse" ? r.severity : "moyenne",
                message: typeof r.message === "string" ? r.message : "",
              }))
          : [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (reservationId && supabaseAdmin && verifiedUserId) {
      await supabaseAdmin
        .rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: verifiedUserId })
        .catch((e: unknown) => console.error("refund_credit_reservation failed during error handling:", e));
    }
    return jsonResponse(500, { error: message });
  }
});
