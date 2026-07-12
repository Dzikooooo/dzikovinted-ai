import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
  // erreur survient apres la reservation d'un credit (decrement_credit),
  // le catch doit pouvoir le rembourser (refund_credit) avant de repondre.
  let supabase: ReturnType<typeof createClient> | null = null;
  let userId: string | null = null;
  let creditReserved = false;

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

    userId = user.id;

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
      .select("plan, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profil introuvable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isMetered = profile.plan === "free" && profile.role !== "admin";

    if (isMetered) {
      const { error: reserveError } = await supabase.rpc("decrement_credit", {
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

      creditReserved = true;
    }

    const apiKey = gemini_key || Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      if (creditReserved) await supabase.rpc("refund_credit", { p_user_id: user.id });
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

Retourne uniquement un JSON valide avec exactement ces champs :
{
  "title": string,
  "description": string,
  "brand": string,
  "category": string,
  "color": string,
  "size": string,
  "material": string,
  "condition": string,
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

      if (creditReserved) await supabase.rpc("refund_credit", { p_user_id: user.id });
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
      if (creditReserved) await supabase.rpc("refund_credit", { p_user_id: user.id });
      return new Response(JSON.stringify({ error: "Empty response from Gemini" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const listing = JSON.parse(content);

    const month = new Date().toISOString().slice(0, 7);
    const { error: usageErr } = await supabase.rpc("increment_usage", {
      p_user_id: user.id,
      p_month: month,
    });
    if (usageErr) console.error("increment_usage error:", usageErr);

    return new Response(JSON.stringify({ listing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    if (creditReserved && supabase && userId) {
      await supabase.rpc("refund_credit", { p_user_id: userId }).catch((e: unknown) =>
        console.error("refund_credit failed during error handling:", e)
      );
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});