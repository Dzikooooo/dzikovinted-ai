import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isMetered } from "../_shared/credits.ts";
import { buildMarketContext } from "../_shared/marketEngine.ts";
import { buildAuditPrompt } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface AuditRequest {
  listing_id: string;
  gemini_key?: string;
}

// Pricer Pro -- audit d'une annonce DEJA PUBLIEE (2026-08-29). Meme
// squelette que analyze-clothing/index.ts (auth JWT -> client anon, credits
// reserve/consume/refund via client service_role distinct, Market Engine
// partage) -- fonction SEPAREE plutot qu'un mode ajoute a analyze-clothing :
// contrat d'entree/sortie different (listing_id existant, pas des photos a
// analyser), et ne jamais risquer de destabiliser le Generateur deja en
// production pour ajouter cette fonctionnalite.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Meme discipline que analyze-clothing : declares hors du try pour rester
  // visibles dans le catch (remboursement de la reservation en cas d'echec
  // inattendu). reservationId n'est jamais inclus dans une Response.
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

    const { listing_id, gemini_key }: AuditRequest = await req.json();
    if (!listing_id || typeof listing_id !== "string") {
      return jsonResponse(400, { error: "listing_id is required" });
    }

    // Client anon+JWT (PAS supabaseAdmin) : la policy select_own_listings
    // s'assure deja qu'on ne peut jamais auditer l'annonce de quelqu'un
    // d'autre -- 0 ligne renvoyee plutot qu'un contournement possible.
    // Aucune verification manuelle de propriete necessaire ici : la RLS EST
    // la verification.
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("title, description, category, brand, condition, image_urls")
      .eq("id", listing_id)
      .single();

    if (listingError || !listing) {
      return jsonResponse(404, { error: "Annonce introuvable" });
    }

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

    const apiKey = gemini_key || Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
      return jsonResponse(500, { error: "GEMINI_API_KEY manquante. Impossible d'auditer cette annonce." });
    }

    const prompt = buildAuditPrompt({
      title: (listing.title as string) ?? "",
      description: (listing.description as string | null) ?? null,
      category: (listing.category as string | null) ?? null,
      brand: (listing.brand as string | null) ?? null,
      condition: (listing.condition as string | null) ?? null,
      photoCount: Array.isArray(listing.image_urls) ? listing.image_urls.length : 0,
    });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
            maxOutputTokens: 1000,
            // gemini-2.5-flash est un modele "thinking" par defaut -- sans ce
            // budget a 0, reponse vide (meme correctif que analyze-clothing,
            // verifie en direct le 2026-07-11).
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

    const audit = JSON.parse(content);

    // Prix : le VRAI brand/category de l'annonce (jamais devine par Gemini
    // ici, contrairement au Generateur qui n'a que des photos) -- meme
    // Market Engine partage, aucune duplication.
    const brand = typeof listing.brand === "string" ? listing.brand.trim() : "";
    const category = typeof listing.category === "string" ? listing.category.trim() : "";
    const priceContext = brand && category ? await buildMarketContext(supabase, { brand, category }) : null;

    // Meme garde critique que analyze-clothing (revue du 2026-08-04) :
    // consume_credit_reservation peut legitimement renvoyer false (double
    // remboursement, retry concurrent...) -- dans ce cas, ne jamais renvoyer
    // le resultat comme un succes, l'utilisateur a deja recupere son credit.
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
      event_type: "audit_completed",
      metadata: { metered, listing_id, has_price_context: !!priceContext?.pricing },
    });
    if (usageEventError) console.error("usage_events insert error:", usageEventError);

    return jsonResponse(200, {
      audit: {
        suggested_title: typeof audit.suggested_title === "string" ? audit.suggested_title : listing.title,
        suggested_description: typeof audit.suggested_description === "string" ? audit.suggested_description : "",
        keywords: Array.isArray(audit.keywords) ? audit.keywords.filter((k: unknown) => typeof k === "string") : [],
        category_note: typeof audit.category_note === "string" ? audit.category_note : "",
        photo_note: typeof audit.photo_note === "string" ? audit.photo_note : "",
        price: priceContext,
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
