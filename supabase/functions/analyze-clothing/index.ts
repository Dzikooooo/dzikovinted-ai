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
  openai_key?: string;
}

const SYSTEM_PROMPT = `You are a Vinted listing expert. Analyze clothing photos and generate optimized listings.
Return JSON with: title, description, brand, category, color, size, material, condition, price, quick_price, premium_price, keywords (array), vinted_filters (array of {label, value}).
All text must be in French.`;

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
    const { image_urls, openai_key } = body;

    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "image_urls is required (array of 1-10 URLs)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = openai_key || Deno.env.get("OPENAI_API_KEY");

    let listing;

    if (apiKey) {
      console.log("Using OpenAI API key:", apiKey.slice(0, 8) + "...");

      const imageContent = image_urls.map((url: string) => {
        if (url.startsWith("data:")) {
          return { type: "image_url", image_url: { url } };
        }
        return { type: "image_url", image_url: { url } };
      });

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

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
          response_format: { type: "json_object" },
          max_tokens: 1500,
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.error("OpenAI API error:", openaiRes.status, errText);
        return new Response(
          JSON.stringify({ error: `OpenAI API error (${openaiRes.status}): ${errText.slice(0, 200)}` }),
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
      console.log("No OpenAI key available, returning mock data");
      listing = {
        title: "Nike Air Force 1 Low White — 42 EU — Tres bon etat",
        description: "Nike Air Force 1 Low en cuir blanc, taille 42 EU. Portees quelques fois, tres bon etat general. Semelle intacte, aucun frottement.\n\nIconiques et intemporelles, parfaites pour un look streetwear classique.",
        brand: "Nike",
        category: "Chaussures > Homme > Baskets",
        color: "Blanc",
        size: "42 EU",
        material: "Cuir",
        condition: "Tres bon etat",
        price: 75,
        quick_price: 58,
        premium_price: 89,
        keywords: ["nike", "air force 1", "baskets", "blanc", "cuir", "42", "sneakers", "streetwear"],
        vinted_filters: [
          { label: "Marque", value: "Nike" },
          { label: "Taille", value: "42" },
          { label: "Couleur", value: "Blanc" },
          { label: "Etat", value: "Tres bon etat" },
        ],
      };
    }

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
