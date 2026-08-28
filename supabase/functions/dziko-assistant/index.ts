import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RATE_LIMIT_SCOPES, rateLimitMessage, tryConsumeRateLimit } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface AssistantRequest {
  messages: ChatMessage[];
}

// Historique borne cote client (voir src/lib/dzikoAssistant.ts) mais
// revalide ici : jamais faire confiance a la taille du payload envoye par
// le navigateur.
const MAX_HISTORY_MESSAGES = 8;

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

    // Client authentifie avec le JWT de l'utilisateur (jamais le service
    // role) : chaque requete ci-dessous passe par les policies RLS
    // existantes, donc l'assistant ne peut structurellement voir que les
    // donnees du compte connecte -- jamais celles d'un autre utilisateur.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
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

    const { messages }: AssistantRequest = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cooldown par utilisateur (audit 2026-08-28) : cette route n'avait
    // aucune limite, alors qu'elle appelle le meme GEMINI_API_KEY partage
    // (niveau gratuit) que le Generateur IA -- un usage sans borne pouvait
    // degrader cette fonctionnalite payante pour tout le monde. Volontairement
    // un simple cooldown (pas de credits, voir rateLimit.ts) : l'assistant
    // reste gratuit, seule la cadence est bornee.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const rateLimitOk = await tryConsumeRateLimit(adminClient, user.id, RATE_LIMIT_SCOPES.dzikoAssistant);
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: rateLimitMessage(RATE_LIMIT_SCOPES.dzikoAssistant.scope) }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY manquante. Assistant indisponible." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Instantane reel du compte -- jamais de chiffre invente, tout vient de
    // requetes RLS-scopees a l'utilisateur connecte. Approximation legere
    // (bornes de mois en UTC plutot que locales comme DashboardHome.tsx) :
    // suffisant pour donner du contexte a une reponse conversationnelle,
    // pas cense reproduire au centime pres les chiffres du dashboard.
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: profile },
      { data: listings },
      { count: opportunitiesLast24h },
      { data: accounts },
    ] = await Promise.all([
      supabase.from("profiles").select("full_name, plan, credits").eq("id", user.id).single(),
      supabase
        .from("listings")
        .select("title, brand, price, status, sold_price, purchase_price, fees, sold_date, created_at")
        .eq("user_id", user.id)
        .or("vinted_status.neq.deleted,vinted_status.is.null")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("market_opportunities").select("*", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabase.from("vinted_accounts").select("label, connected").eq("user_id", user.id),
    ]);

    const allListings = listings ?? [];
    const activeListings = allListings.filter((l) => l.status !== "vendu");
    const soldThisMonth = allListings.filter(
      (l) => l.status === "vendu" && l.sold_date && new Date(l.sold_date) >= monthStart
    );
    const profitThisMonth = soldThisMonth.reduce(
      (s, l) => s + (Number(l.sold_price || 0) - Number(l.purchase_price || 0) - Number(l.fees || 0)),
      0
    );
    const stockValue = activeListings.reduce((s, l) => s + Number(l.price || 0), 0);
    const recentTitles = allListings.slice(0, 5).map((l) => `${l.title} (${l.brand || "marque inconnue"}, ${l.status})`);
    const connectedAccounts = (accounts ?? []).filter((a) => a.connected);

    const contextSummary = `
Donnees reelles du compte connecte (${user.email}) :
- Prenom : ${profile?.full_name || "inconnu"}
- Plan : ${profile?.plan || "free"}, credits restants : ${profile?.credits ?? "illimite"}
- Comptes Vinted connectes : ${connectedAccounts.length > 0 ? connectedAccounts.map((a) => a.label).join(", ") : "aucun"}
- Annonces actives en stock : ${activeListings.length}, valeur totale : ${stockValue.toFixed(0)} EUR
- Ventes ce mois-ci : ${soldThisMonth.length}, benefice cumule : ${profitThisMonth.toFixed(0)} EUR
- Opportunites Vinted detectees sur les dernieres 24h (marche global) : ${opportunitiesLast24h ?? 0}
- 5 annonces les plus recentes : ${recentTitles.length > 0 ? recentTitles.join(" ; ") : "aucune annonce encore"}
`.trim();

    const systemPrompt = `
Tu es "Dziko IA", l'assistant integre a Resell OS, un outil pour les revendeurs Vinted.

Regles strictes :
- Reponds uniquement en francais, ton direct et concis (tutoiement, pas de blabla).
- Base-toi UNIQUEMENT sur les donnees reelles fournies ci-dessous. N'invente jamais un chiffre, une annonce ou une fonctionnalite qui n'existe pas.
- Si une question porte sur une donnee que tu n'as pas, dis-le clairement plutot que de deviner.
- Resell OS ne fonctionne qu'avec Vinted (aucune autre marketplace) et ne publie/modifie jamais une annonce sans confirmation explicite de l'utilisateur.
- Tu peux expliquer les fonctionnalites de Resell OS (Generateur IA, Mes annonces, Niches, Comptabilite, Communaute, Compte Vinted) mais tu ne peux pas executer d'action a la place de l'utilisateur.

${contextSummary}
`.trim();

    const trimmedHistory = messages.slice(-MAX_HISTORY_MESSAGES);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: trimmedHistory.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.text }],
          })),
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 600,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(
        JSON.stringify({ error: `Gemini API error (${geminiRes.status}): ${errText.slice(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return new Response(JSON.stringify({ error: "Reponse vide de l'assistant." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply }), {
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
