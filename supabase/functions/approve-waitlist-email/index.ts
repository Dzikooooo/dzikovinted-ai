import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildApprovalEmailHtml, buildApprovalEmailSubject } from "./emailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Meme domaine que les autres redirections deja en place (create-checkout-
// session/create-portal-session/notify-ticket-discord) -- jamais une URL
// inventee.
const LOGIN_URL = "https://resellosapp.com";
const RESEND_API_URL = "https://api.resend.com/emails";

// Approuve une demande de liste d'attente ET envoie l'email de confirmation,
// dans le MEME appel (2026-08-30) -- remplace l'appel RPC direct que
// AdminWaitlistTab.tsx faisait jusqu'ici (admin_approve_waitlist_email seul,
// sans email). L'approbation reste l'action CRITIQUE : elle doit reussir
// avant meme d'essayer l'email, et un echec d'envoi ne doit JAMAIS annuler
// une approbation deja actee (voir plus bas) -- inverse totalement
// inacceptable (un admin qui croit avoir ouvert un acces qui aurait ete
// silencieusement annule).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerProfile, error: callerError } = await supabaseAdmin
      .from("profiles")
      .select("role, banned")
      .eq("id", user.id)
      .single();

    if (callerError || !callerProfile) {
      return jsonResponse(500, { error: "Profil introuvable" });
    }
    if (callerProfile.banned) {
      return jsonResponse(403, { error: "Compte suspendu" });
    }
    if (callerProfile.role !== "admin") {
      return jsonResponse(403, { error: "Réservé aux administrateurs" });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) {
      return jsonResponse(400, { error: "email est requis" });
    }

    // Appelee via le client anon+JWT (PAS supabaseAdmin) : cette RPC verifie
    // elle-meme is_admin() via auth.uid(), qui ne resout correctement le
    // bon utilisateur qu'a travers CE client -- un appel service_role
    // echouerait toujours sa propre verification (auth.uid() y est NULL).
    // Meme RPC que l'ancien appel direct cote client (AdminWaitlistTab.tsx),
    // deja verifiee en base avant la mise en prod initiale de la liste
    // d'attente (migration 20260830110000).
    const { error: approveError } = await supabase.rpc("admin_approve_waitlist_email", { p_email: email });
    if (approveError) {
      console.error("[approve-waitlist-email] admin_approve_waitlist_email a échoué", approveError);
      return jsonResponse(500, { error: "Impossible d'approuver cette demande." });
    }

    // Approbation actee -- tout ce qui suit est best-effort. Cherche un nom
    // existant pour personnaliser (jamais invente : null si aucun profil ne
    // correspond encore, cas normal d'une allowlist posee avant inscription).
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .ilike("email", email)
      .maybeSingle();

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = Deno.env.get("RESEND_FROM_EMAIL");

    // Etat VALIDE, jamais une erreur (meme discipline que
    // notify-ticket-discord/DISCORD_TICKET_WEBHOOK_URL) : Resend peut
    // deliberement ne pas etre configure tant que le domaine d'envoi n'est
    // pas verifie -- ne doit jamais faire passer une approbation reussie
    // pour un echec cote client.
    if (!resendApiKey || !fromAddress) {
      console.warn("[approve-waitlist-email] RESEND_API_KEY/RESEND_FROM_EMAIL non configurés -- email ignoré");
      return jsonResponse(200, { ok: true, email_sent: false, reason: "resend_not_configured" });
    }

    try {
      const resendRes = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: email,
          subject: buildApprovalEmailSubject(),
          html: buildApprovalEmailHtml({
            fullName: (existingProfile?.full_name as string | null) ?? null,
            loginUrl: LOGIN_URL,
          }),
        }),
      });

      if (!resendRes.ok) {
        const detail = await resendRes.text().catch(() => "");
        console.error("[approve-waitlist-email] envoi Resend échoué", resendRes.status, detail);
        return jsonResponse(200, { ok: true, email_sent: false, reason: "send_failed" });
      }
    } catch (sendError) {
      console.error("[approve-waitlist-email] erreur réseau Resend", sendError);
      return jsonResponse(200, { ok: true, email_sent: false, reason: "send_failed" });
    }

    return jsonResponse(200, { ok: true, email_sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[approve-waitlist-email] erreur inattendue", error);
    return jsonResponse(500, { error: message });
  }
});
