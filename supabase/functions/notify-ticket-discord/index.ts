import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateBillingUser, corsHeaders, jsonResponse } from "../_shared/billingAuth.ts";
import { parseNotifyRequest, buildTicketNotificationPayload } from "./discordPayload.ts";

// Mission "TICKETS DE SUPPORT -- NOTIFICATION DISCORD" (2026-08-27) : suite
// de l'audit qui a confirme qu'AUCUNE integration Discord n'existait sur les
// tickets (voir l'historique) -- le vrai manque n'etait pas un appel qui
// echoue silencieusement, mais l'absence totale d'alerte pour l'equipe.
// Option validee explicitement par l'utilisateur : un simple webhook Discord
// (notification texte), PAS un bot ni un canal dedie par ticket -- portee
// volontairement minimale.
//
// Appelee par le CLIENT juste apres un insert reussi dans support_tickets/
// ticket_messages (voir useSupportTickets.ts::createTicket,
// useTicketMessages.ts::sendMessage) -- jamais un declencheur cote base
// (pas de pg_net/vault dans ce projet, aucune raison d'introduire cette
// infrastructure pour un simple webhook texte). Le CLIENT traite tout appel
// a ce endpoint en best-effort strict (try/catch, jamais bloquant pour la
// creation du ticket, deja ecrite en base avant cet appel) -- cette fonction
// reste donc honnete sur ses propres codes d'erreur (contrairement a
// certains cas ci-dessous qui restent volontairement 200 : etats VALIDES,
// pas des echecs).
//
// Contenu/auteur/sujet TOUJOURS relus depuis la base via supabaseAdmin,
// jamais pris tels quels dans le corps de la requete -- seul ticket_id est
// lu du body (voir discordPayload.ts::parseNotifyRequest). Empeche un
// utilisateur authentifie de faire apparaitre dans Discord un texte
// different du contenu reellement enregistre pour son ticket.
//
// PORTEE VOLONTAIREMENT LIMITEE A LA CREATION (retour beta 2026-08-27,
// decision explicite) : ce webhook ne notifie QUE la creation d'un ticket
// et les reponses ulterieures de l'utilisateur -- jamais la fermeture d'un
// ticket. Un changement de statut (setTicketStatus, useSupportTickets.ts)
// n'a aucune valeur d'alerte pour l'equipe (c'est l'admin LUI-MEME qui le
// declenche, il le sait deja) -- ajouter une notification dessus serait de
// la complexite sans utilite reelle. Le canal Discord cible reste donc un
// JOURNAL D'ACTIVITE brut et en lecture seule cote ResellOS (aucune synchro
// retour Discord -> Supabase) : chaque message y est une archive texte, sans
// mise a jour ni suppression automatique quand le ticket correspondant est
// clos cote app -- au staff de nettoyer ce salon manuellement si besoin.
const DASHBOARD_SUPPORT_URL = "https://resellosapp.com/dashboard/community";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await authenticateBillingUser(req);
    if (auth instanceof Response) return auth;
    const { userId, userEmail, supabaseAdmin } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Corps de requête invalide" });
    }

    const parsed = parseNotifyRequest(body);
    if (!parsed.ok) {
      return jsonResponse(400, { error: parsed.error });
    }

    // Etat VALIDE, jamais une erreur : le webhook peut deliberement ne pas
    // etre configure (env de dev, ou avant que l'admin ait cree le sien sur
    // son serveur Discord) -- ne doit jamais empecher/alarmer la creation
    // du ticket cote client.
    const webhookUrl = Deno.env.get("DISCORD_TICKET_WEBHOOK_URL");
    if (!webhookUrl) {
      console.warn("[notify-ticket-discord] DISCORD_TICKET_WEBHOOK_URL non configuré -- notification ignorée");
      return jsonResponse(200, { notified: false, reason: "webhook_not_configured" });
    }

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("support_tickets")
      .select("id, subject, user_id")
      .eq("id", parsed.ticketId)
      .maybeSingle();

    if (ticketError || !ticket) {
      return jsonResponse(404, { error: "Ticket introuvable" });
    }

    // Seul le PROPRIETAIRE du ticket declenche sa propre notification --
    // meme frontiere que la policy insert_own_ticket_messages (RLS,
    // 20260727150000_add_support_tickets.sql). Un admin qui repond n'a
    // jamais besoin de se notifier lui-meme ; un tiers ne doit jamais
    // pouvoir declencher de notification pour le ticket d'un autre.
    if (ticket.user_id !== userId) {
      return jsonResponse(403, { error: "Accès refusé" });
    }

    const { count } = await supabaseAdmin
      .from("ticket_messages")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", parsed.ticketId);

    const { data: lastMessage } = await supabaseAdmin
      .from("ticket_messages")
      .select("body, is_admin_reply")
      .eq("ticket_id", parsed.ticketId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Rien a notifier : ticket sans message (ne devrait pas arriver, le
    // flow client insere toujours un premier message a la creation), ou
    // dernier message deja une reponse de l'equipe -- jamais notifier
    // l'equipe de sa PROPRE reponse.
    if (!lastMessage || lastMessage.is_admin_reply) {
      return jsonResponse(200, { notified: false, reason: "no_user_message" });
    }

    const payload = buildTicketNotificationPayload({
      ticketId: ticket.id,
      subject: ticket.subject,
      messageBody: lastMessage.body,
      isNewTicket: (count ?? 0) <= 1,
      authorEmail: userEmail,
      dashboardUrl: DASHBOARD_SUPPORT_URL,
    });

    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!discordRes.ok) {
      const detail = await discordRes.text().catch(() => "");
      console.error("[notify-ticket-discord] envoi Discord échoué", discordRes.status, detail);
      return jsonResponse(502, { error: "Échec de l'envoi de la notification Discord." });
    }

    return jsonResponse(200, { notified: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur, réessaie plus tard.";
    console.error("[notify-ticket-discord] erreur inattendue", error);
    return jsonResponse(500, { error: message });
  }
});
