import { supabase } from './supabase';

// Mission "TICKETS DE SUPPORT -- NOTIFICATION DISCORD" (2026-08-27) : appelle
// l'Edge Function notify-ticket-discord (webhook Discord simple, option
// validee explicitement -- pas de bot, pas de canal dedie par ticket).
//
// Best-effort STRICT : le ticket/message est deja ecrit en base AVANT que
// cette fonction ne soit appelee (voir useSupportTickets.ts::createTicket,
// useTicketMessages.ts::sendMessage) -- un echec de notification (webhook
// non configure, Discord indisponible, erreur reseau) ne doit JAMAIS
// remonter a l'utilisateur ni faire passer une creation de ticket reussie
// pour un echec. Ne rejette jamais, ne retourne rien d'exploitable --
// purement fire-and-forget cote appelant.
export async function notifyTicketDiscord(ticketId: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('notify-ticket-discord', { body: { ticket_id: ticketId } });
    if (error) console.error('[notifyTicketDiscord]', error);
  } catch (err) {
    console.error('[notifyTicketDiscord]', err);
  }
}
