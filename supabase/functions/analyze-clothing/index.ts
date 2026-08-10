import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isMetered } from "../_shared/credits.ts";
import { buildMarketContext } from "../_shared/marketEngine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnalyzeRequest {
  image_urls: string[];
  gemini_key?: string;
  platform?: string;
  photo_style?: string;
  enhance_photo?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Declares en dehors du try pour rester visibles dans le catch : si une
  // erreur survient apres la reservation d'un credit (reserve_credit), le
  // catch doit pouvoir le rembourser (refund_credit_reservation) avant de
  // repondre. reservationId ne doit JAMAIS etre inclus dans une Response
  // envoyee au client (voir migration 20260804130000) -- il ne vit que
  // dans ce scope d'execution serveur, entre la reservation et sa cloture.
  let supabase: ReturnType<typeof createClient> | null = null;
  let supabaseAdmin: ReturnType<typeof createClient> | null = null;
  let reservationId: string | null = null;
  let verifiedUserId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    verifiedUserId = user.id;

    // Client service_role distinct, cree UNIQUEMENT apres verification du
    // JWT ci-dessus -- reserve_credit/consume_credit_reservation/
    // refund_credit_reservation ne sont plus accessibles qu'a service_role
    // (revoke total pour anon/authenticated, voir migration 20260804130000,
    // revue 2026-08-04) : un utilisateur ne peut plus les appeler lui-meme
    // depuis les DevTools, meme en connaissant un reservation_id. La cle
    // service_role vient d'une variable d'environnement Deno injectee par
    // Supabase pour toute edge function -- jamais exposee au frontend, ni
    // renvoyee dans une Response, ni logguee.
    supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      image_urls,
      gemini_key,
      platform = "vinted",
      photo_style = "white",
      enhance_photo = true,
    }: AnalyzeRequest = await req.json();

    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(JSON.stringify({ error: "image_urls is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quota serveur : seul le plan free est limite en credits (pro/team =
    // illimite), et un compte role='admin' est toujours illimite quel que
    // soit son plan. Duplique de PLAN_LIMITS (src/lib/types.ts) -- pas
    // d'import cross-runtime possible entre Vite (src/) et Deno
    // (supabase/functions/).
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan, role, banned, credits_mode, title_style, description_style")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profil introuvable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // reserve_credit/consume_credit_reservation tournent via supabaseAdmin
    // (service_role, bypass RLS) -- la RLS de profiles seule ne suffit donc
    // pas a bloquer un compte banni ici, contrairement aux tables lues via
    // le client anon+JWT ailleurs dans l'app (voir migration
    // 20260808110000_enforce_banned_flag.sql). Verification explicite.
    if (profile.banned) {
      return new Response(JSON.stringify({ error: "Compte suspendu" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Programme Beta ResellOS (Lot 3, 2026-08-10) : credits_mode='unlimited'
    // suspend la reservation/consommation de credits sans jamais modifier
    // profiles.credits (le solde reel) -- voir _shared/credits.ts pour la
    // matrice complete et 20260810100000_add_beta_program_status.sql pour
    // la garantie que ce champ n'est modifiable que par une RPC admin.
    const metered = isMetered(profile);

    if (metered) {
      const { data: reserveData, error: reserveError } = await supabaseAdmin.rpc("reserve_credit", {
        p_user_id: user.id,
      });

      if (reserveError) {
        const status = reserveError.message?.includes("insufficient_credits") ? 402 : 500;
        return new Response(
          JSON.stringify({
            error:
              status === 402
                ? "Tu as atteint ta limite de credits. Passe au plan Pro pour continuer."
                : "Impossible de verifier tes credits pour le moment.",
          }),
          { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      reservationId = reserveData as string;
    }

    const apiKey = gemini_key || Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY manquante. Impossible de générer une annonce réelle.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Retour bêta-testeur reel (Albin, 2026-08-11, retour 4) : preference de
    // style optionnelle, injectee comme instruction supplementaire pour
    // Gemini -- jamais un remplacement de variables cote client. Gemini
    // reste seul responsable de concilier cette preference avec les regles
    // factuelles ci-dessous (ne jamais inventer marque/taille/matiere) et
    // l'optimisation Vinted deja en place. Absent/vide = aucune ligne
    // ajoutee au prompt, comportement de generation actuel inchange a
    // l'identique (contrainte explicite du retour : jamais de configuration
    // obligatoire).
    const titleStyle = typeof profile.title_style === "string" ? profile.title_style.trim() : "";
    const descriptionStyle = typeof profile.description_style === "string" ? profile.description_style.trim() : "";
    const styleInstructions =
      titleStyle || descriptionStyle
        ? `
PRÉFÉRENCE DE STYLE DU VENDEUR (à respecter sans jamais l'emporter sur les règles ci-dessus, ni inventer un fait) :
${titleStyle ? `- Style de titre souhaité : ${titleStyle}\n` : ""}${descriptionStyle ? `- Style de description souhaité : ${descriptionStyle}\n` : ""}`
        : "";

    const prompt = `
Tu es un expert de la revente de vêtements d'occasion.

Plateforme cible : ${platform}
Style photo souhaité : ${photo_style}
Amélioration photo demandée : ${enhance_photo ? "oui" : "non"}

Analyse uniquement les photos fournies.

RÈGLES IMPORTANTES :
- Ne jamais inventer une marque.
- Si la marque n'est pas clairement visible, mets "Marque à vérifier".
- Ne jamais inventer une taille.
- Si la taille n'est pas visible, mets "Taille à vérifier".
- Ne jamais inventer une matière.
- Si la matière n'est pas visible, mets "Matière à vérifier".
- Mentionne les défauts visibles.
- Si la marque est incertaine, reste prudent sur le prix.
- Si la plateforme est Vinted, optimise le titre, les mots-clés et les filtres pour Vinted.
- Le champ "condition" doit être EXACTEMENT l'une de ces 5 valeurs (taxonomie officielle Vinted, avec les accents) : "Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "État satisfaisant". Aucune autre formulation.
${styleInstructions}
Retourne uniquement un JSON valide avec exactement ces champs :
{
  "title": string,
  "description": string,
  "brand": string,
  "category": string,
  "color": string,
  "size": string,
  "material": string,
  "condition": "Neuf avec étiquette" | "Neuf sans étiquette" | "Très bon état" | "Bon état" | "État satisfaisant",
  "price": number,
  "quick_price": number,
  "premium_price": number,
  "keywords": string[],
  "vinted_filters": [{"label": string, "value": string}]
}

Tous les textes doivent être en français correct.
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...image_urls.map((url: string) => ({
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: url.replace(/^data:image\/\w+;base64,/, ""),
                  },
                })),
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
            maxOutputTokens: 1500,
            // gemini-2.5-flash est un modele "thinking" par defaut -- sans ce
            // budget a 0, il peut consommer maxOutputTokens en raisonnement
            // invisible avant de produire le JSON demande (verifie en direct
            // le 2026-07-11 : sans thinkingBudget, la reponse revient vide).
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();

      if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
      return new Response(
        JSON.stringify({
          error: `Gemini API error (${geminiRes.status}): ${errText.slice(0, 300)}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiData = await geminiRes.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      if (reservationId) await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: user.id });
      return new Response(JSON.stringify({ error: "Empty response from Gemini" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const listing = JSON.parse(content);

    // Repli honnete par defaut : tant que le Market Engine ne trouve aucun
    // comparable exploitable ci-dessous, le prix reste l'estimation Gemini
    // telle quelle, mais explicitement etiquetee comme telle plutot que
    // presentee comme une valeur de marche.
    listing.price_source = "ai_estimate";
    listing.price_comparables_count = 0;
    listing.market_tier = "none";
    listing.market_confidence_level = "ia_uniquement";
    listing.market_confidence_score = 0;
    listing.market_freshness = null;

    const brand = typeof listing.brand === "string" ? listing.brand.trim() : "";
    const category = typeof listing.category === "string" ? listing.category.trim() : "";
    // "Marque à vérifier" = sentinelle explicite du prompt (voir ci-dessus)
    // quand Gemini n'a pas pu identifier la marque -- inutile d'interroger
    // le marche avec une valeur qui ne correspondra jamais a une vraie ligne.
    if (brand && category && brand !== "Marque à vérifier") {
      const market = await buildMarketContext(supabase, { brand, category });
      if (market.pricing) {
        listing.price = market.pricing.price;
        listing.quick_price = market.pricing.quickPrice;
        listing.premium_price = market.pricing.premiumPrice;
        listing.price_source = "market";
        listing.price_comparables_count = market.comparablesCount;
        listing.market_tier = market.tier;
        listing.market_confidence_level = market.confidence.level;
        listing.market_confidence_score = market.confidence.score;
        listing.market_freshness = market.freshness;
      }
    }

    const month = new Date().toISOString().slice(0, 7);
    const { error: usageErr } = await supabase.rpc("increment_usage", {
      p_user_id: user.id,
      p_month: month,
    });
    if (usageErr) console.error("increment_usage error:", usageErr);

    // Cloture la reservation seulement maintenant que la generation a
    // reellement reussi -- c'est l'appel qui manquait dans la premiere
    // version de ce correctif (revue du 2026-08-04) : sans lui, une
    // reservation restait 'pending' indefiniment apres un succes, ce qui
    // rendait refund_credit_reservation exploitable pour rendre chaque
    // generation gratuite. reservationId n'est jamais inclus dans cette
    // Response.
    //
    // GARDE CRITIQUE (revue du 2026-08-04, 2e passe) : consume_credit_
    // reservation() peut legitiment retourner false si la reservation a
    // deja ete remboursee entre-temps -- scenario possible meme apres le
    // verrouillage service_role de ces RPC : un bug futur, un appel
    // concurrent legitime cote edge function (retry), ou toute autre cause
    // qui laisserait la reservation hors de l'etat 'pending' attendu. Dans
    // TOUS ces cas, le resultat genere par Gemini ne doit JAMAIS etre
    // renvoye comme un succes -- l'utilisateur a alors deja recupere son
    // credit (ou est en train de le faire), donc lui donner aussi le
    // resultat reviendrait a annuler la protection entiere de ce correctif.
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
        return new Response(
          JSON.stringify({ error: "Cette génération n'a pas pu être finalisée. Réessaie." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Instrumentation cout/usage (Lot 3, Market Engine V2, 2026-08-10) --
    // best-effort, service_role, ne bloque et ne fait jamais echouer une
    // generation reussie (meme discipline que increment_usage ci-dessus).
    // Ecrit uniquement ici, apres la garde consume_credit_reservation : ne
    // jamais compter comme "succes" une generation dont la consommation de
    // credit n'a pas ete confirmee (voir GARDE CRITIQUE ci-dessus).
    const { error: usageEventError } = await supabaseAdmin.from("usage_events").insert({
      user_id: user.id,
      event_type: "generation_completed",
      metadata: {
        metered,
        market_tier: listing.market_tier,
        market_comparables_count: listing.price_comparables_count,
        market_confidence_level: listing.market_confidence_level,
        price_source: listing.price_source,
      },
    });
    if (usageEventError) console.error("usage_events insert error:", usageEventError);

    return new Response(JSON.stringify({ listing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    if (reservationId && supabaseAdmin && verifiedUserId) {
      await supabaseAdmin.rpc("refund_credit_reservation", { p_reservation_id: reservationId, p_user_id: verifiedUserId }).catch((e: unknown) =>
        console.error("refund_credit_reservation failed during error handling:", e)
      );
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});