// Logique pure (aucun Deno.serve/fetch/Supabase ici) -- meme discipline que
// create-checkout-session/validation.ts : testable sans mock reseau.

export interface ParsedNotifyRequest {
  ticketId: string;
}

export type ParsedNotifyResult = ({ ok: true } & ParsedNotifyRequest) | { ok: false; error: string };

// Seul champ attendu du body : ticket_id -- le sujet/message/auteur sont
// TOUJOURS relus depuis la base par index.ts (jamais le corps du message
// fourni par le client), pour ne jamais notifier un contenu different de ce
// qui est reellement en base.
export function parseNotifyRequest(body: unknown): ParsedNotifyResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Corps de requête invalide" };
  }
  const ticketId = (body as Record<string, unknown>).ticket_id;
  if (typeof ticketId !== "string" || ticketId.trim().length === 0) {
    return { ok: false, error: "ticket_id requis" };
  }
  return { ok: true, ticketId };
}

// Marge large sous la vraie limite Discord (4096 caracteres pour
// embed.description) -- un apercu suffit, jamais besoin du message entier
// dans la notification (le lien dashboardUrl mene au ticket complet).
const DESCRIPTION_MAX_LENGTH = 500;
const TITLE_MAX_LENGTH = 256; // limite reelle Discord pour embed.title

// BRAND_VIOLET (src/lib/brandColors.ts, #7C5CFF) -- meme token que tout le
// reste de la marque ResellOS (voir CLAUDE.md, tokens de couleur), converti
// en decimal pour le champ `color` d'un embed Discord.
export const DISCORD_EMBED_COLOR = 0x7c5cff;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export interface TicketNotificationInput {
  ticketId: string;
  subject: string;
  messageBody: string;
  // true = ceci est le tout premier message du ticket (creation) ; false =
  // reponse ulterieure de l'utilisateur sur un ticket deja ouvert.
  isNewTicket: boolean;
  authorEmail: string | null;
  dashboardUrl: string;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  url: string;
  footer: { text: string };
  timestamp: string;
}

export interface DiscordWebhookPayload {
  content: string;
  embeds: [DiscordEmbed];
}

// Construit le corps EXACT envoye au webhook Discord (POST content-type
// application/json standard, voir https://discord.com/developers/docs/resources/webhook).
// Pure -- `now` injectable pour rester testable sans horloge reelle, meme
// discipline que createCheckoutSessionForPlan (`now: () => new Date()`).
export function buildTicketNotificationPayload(input: TicketNotificationInput, now: () => Date = () => new Date()): DiscordWebhookPayload {
  const kind = input.isNewTicket ? "Nouveau ticket" : "Nouveau message";
  const author = input.authorEmail ?? "utilisateur inconnu";
  return {
    content: `🎫 **${kind} de support** — ${author}`,
    embeds: [
      {
        title: truncate(input.subject || "(sans sujet)", TITLE_MAX_LENGTH),
        description: truncate(input.messageBody, DESCRIPTION_MAX_LENGTH),
        color: DISCORD_EMBED_COLOR,
        url: input.dashboardUrl,
        footer: { text: `Ticket ${input.ticketId}` },
        timestamp: now().toISOString(),
      },
    ],
  };
}
