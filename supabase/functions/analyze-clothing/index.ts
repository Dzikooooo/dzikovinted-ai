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

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
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

    const apiKey = gemini_key || Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();

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
      return new Response(JSON.stringify({ error: "Empty response from Gemini" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const listing = JSON.parse(content);

    return new Response(JSON.stringify({ listing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});