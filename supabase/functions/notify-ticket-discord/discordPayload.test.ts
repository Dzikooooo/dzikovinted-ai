import { assertEquals } from "jsr:@std/assert";
import { buildTicketNotificationPayload, parseNotifyRequest, DISCORD_EMBED_COLOR } from "./discordPayload.ts";

Deno.test("parseNotifyRequest -- accepte un ticket_id valide", () => {
  const result = parseNotifyRequest({ ticket_id: "abc-123" });
  assertEquals(result, { ok: true, ticketId: "abc-123" });
});

Deno.test("parseNotifyRequest -- rejette un body qui n'est pas un objet", () => {
  assertEquals(parseNotifyRequest(null).ok, false);
  assertEquals(parseNotifyRequest("abc-123").ok, false);
  assertEquals(parseNotifyRequest([]).ok, false);
});

Deno.test("parseNotifyRequest -- rejette ticket_id absent, vide, ou non-string", () => {
  assertEquals(parseNotifyRequest({}).ok, false);
  assertEquals(parseNotifyRequest({ ticket_id: "" }).ok, false);
  assertEquals(parseNotifyRequest({ ticket_id: "   " }).ok, false);
  assertEquals(parseNotifyRequest({ ticket_id: 42 }).ok, false);
});

const FIXED_NOW = () => new Date("2026-08-27T12:00:00.000Z");

Deno.test("buildTicketNotificationPayload -- annonce 'Nouveau ticket' pour le premier message", () => {
  const payload = buildTicketNotificationPayload(
    {
      ticketId: "t-1",
      subject: "Problème de republication",
      messageBody: "La taille du colis n'est pas respectée",
      isNewTicket: true,
      authorEmail: "zoe@example.com",
      dashboardUrl: "https://resellosapp.com/dashboard/community",
    },
    FIXED_NOW
  );

  assertEquals(payload.content, "🎫 **Nouveau ticket de support** — zoe@example.com");
  assertEquals(payload.embeds[0].title, "Problème de republication");
  assertEquals(payload.embeds[0].description, "La taille du colis n'est pas respectée");
  assertEquals(payload.embeds[0].color, DISCORD_EMBED_COLOR);
  assertEquals(payload.embeds[0].url, "https://resellosapp.com/dashboard/community");
  assertEquals(payload.embeds[0].footer, { text: "Ticket t-1" });
  assertEquals(payload.embeds[0].timestamp, "2026-08-27T12:00:00.000Z");
});

Deno.test("buildTicketNotificationPayload -- annonce 'Nouveau message' pour une reponse ulterieure", () => {
  const payload = buildTicketNotificationPayload(
    {
      ticketId: "t-2",
      subject: "Suivi",
      messageBody: "Toujours pas résolu",
      isNewTicket: false,
      authorEmail: "user@example.com",
      dashboardUrl: "https://resellosapp.com/dashboard/community",
    },
    FIXED_NOW
  );

  assertEquals(payload.content, "🎫 **Nouveau message de support** — user@example.com");
});

Deno.test("buildTicketNotificationPayload -- retombe sur 'utilisateur inconnu' quand l'email est absent", () => {
  const payload = buildTicketNotificationPayload(
    {
      ticketId: "t-3",
      subject: "Sujet",
      messageBody: "Corps",
      isNewTicket: true,
      authorEmail: null,
      dashboardUrl: "https://resellosapp.com/dashboard/community",
    },
    FIXED_NOW
  );

  assertEquals(payload.content, "🎫 **Nouveau ticket de support** — utilisateur inconnu");
});

Deno.test("buildTicketNotificationPayload -- retombe sur '(sans sujet)' quand le sujet est vide", () => {
  const payload = buildTicketNotificationPayload(
    {
      ticketId: "t-4",
      subject: "",
      messageBody: "Corps",
      isNewTicket: true,
      authorEmail: "a@b.com",
      dashboardUrl: "https://resellosapp.com/dashboard/community",
    },
    FIXED_NOW
  );

  assertEquals(payload.embeds[0].title, "(sans sujet)");
});

Deno.test("buildTicketNotificationPayload -- tronque un message trop long sans jamais depasser la limite Discord", () => {
  const longBody = "x".repeat(1000);
  const payload = buildTicketNotificationPayload(
    {
      ticketId: "t-5",
      subject: "Sujet",
      messageBody: longBody,
      isNewTicket: true,
      authorEmail: "a@b.com",
      dashboardUrl: "https://resellosapp.com/dashboard/community",
    },
    FIXED_NOW
  );

  assertEquals(payload.embeds[0].description.length, 500);
  assertEquals(payload.embeds[0].description.endsWith("…"), true);
});

Deno.test("buildTicketNotificationPayload -- tronque un sujet trop long sans jamais depasser 256 caracteres", () => {
  const longSubject = "y".repeat(300);
  const payload = buildTicketNotificationPayload(
    {
      ticketId: "t-6",
      subject: longSubject,
      messageBody: "Corps",
      isNewTicket: true,
      authorEmail: "a@b.com",
      dashboardUrl: "https://resellosapp.com/dashboard/community",
    },
    FIXED_NOW
  );

  assertEquals(payload.embeds[0].title.length, 256);
  assertEquals(payload.embeds[0].title.endsWith("…"), true);
});
