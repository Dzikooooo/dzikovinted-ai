import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnalyzeRequest {
  image_urls: string[];
  gemini_key?: string;
}
const SYSTEM_PROMPT = `
Tu es un expert Vinted spécialisé dans l'analyse de vêtements d'occasion à partir de photos.

RÈGLE ABSOLUE :
Tu dois uniquement utiliser les informations clairement visibles sur les photos.
Ne jamais inventer une marque, un modèle, une taille, une matière, un état ou un prix.

INTERDICTIONS :
- Ne jamais inventer une marque connue.
- Ne jamais inventer un modèle exact.
- Ne jamais écrire Supreme, Nike, Lacoste, Ralph Lauren, The North Face, Carhartt, Adidas, etc. sauf si le logo ou l'étiquette est clairement lisible.
- Ne jamais supposer qu'un logo flou correspond à une marque.
- Ne jamais gonfler le prix si la marque n'est pas certaine.
- Ne jamais écrire "très bon état" si des traces, taches, usures ou défauts sont visibles.

SI INCERTAIN :
- brand: "Marque à vérifier"
- size: "Taille à vérifier"
- material: "Matière à vérifier"
- condition: "État à vérifier"
- title: utiliser un titre générique, par exemple "Polo à motifs homme — Taille à vérifier — Bon état"
- price: prix prudent entre 8 et 25 EUR selon le type d'article

ÉTAT :
Analyse obligatoirement les défauts visibles :
taches, traces, décoloration, bouloches, usure, trous, logo abîmé, étiquette illisible.
Mentionne les défauts visibles dans la description.

PRIX :
Si marque et modèle exacts non confirmés, ne jamais dépasser 25 EUR.
Si défauts visibles, réduire fortement le prix.

Retourne uniquement un JSON valide avec :
title, description, brand, category, color, size, material, condition, price, quick_price, premium_price, keywords, vinted_filters.

Tous les textes doivent être en français correct avec accents.
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: AnalyzeRequest = await req.json();
   const { image_urls, gemini_key } = body;

    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "image_urls is required (array of 1-10 URLs)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  const apiKey = gemini_key || Deno.env.get("GEMINI_API_KEY");

    let listing;

    if (apiKey) {
     console.log("Using Gemini API key:", apiKey.slice(0, 8) + "...");

const imageContent = image_urls.map((url: string) => ({
  inline_data: {
    mime_type: "image/jpeg",
    data: url.replace(/^data:image\/\w+;base64,/, ""),
  },
}));

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze these clothing photos and generate a complete Vinted listing in French. Return valid JSON only." },
            ...imageContent,
          ],
        },
      ];
const geminiRes = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
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
            {
              text: messages[messages.length - 1].content,
            },
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
  console.error("Gemini API error:", geminiRes.status, errText);
  return new Response(
    JSON.stringify({ error: `Gemini API error (${geminiRes.status}): ${errText.slice(0, 200)}` }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

const data = await geminiRes.json();
const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

if (!content) {
  return new Response(
    JSON.stringify({ error: "Empty response from Gemini" }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

      const data = await openaiRes.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return new Response(
          JSON.stringify({ error: "Empty response from OpenAI" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      listing = JSON.parse(content);
   } else {
 return new Response(
  JSON.stringify({ error: "GEMINI_API_KEY manquante. Impossible de générer une annonce réelle." }),
  { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);

    return new Response(JSON.stringify({ listing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Edge function error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
