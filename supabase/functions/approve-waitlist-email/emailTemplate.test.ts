import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildApprovalEmailHtml, buildApprovalEmailSubject, CONTACT_EMAIL } from "./emailTemplate.ts";

Deno.test("buildApprovalEmailSubject renvoie un sujet fixe, professionnel, sans emoji", () => {
  const subject = buildApprovalEmailSubject();
  assertEquals(subject, "Ton accès à ResellOS est activé");
  // Aucun caractere hors du plan multilingue de base (BMP) -- un emoji
  // (U+1F389 par ex.) s'encode sur une paire de surrogates UTF-16, ce test
  // echouerait si un emoji etait reintroduit par erreur.
  for (const ch of subject) {
    assertEquals(ch.codePointAt(0)! <= 0xffff, true);
  }
});

Deno.test("buildApprovalEmailHtml personnalise avec le prenom quand connu", () => {
  const html = buildApprovalEmailHtml({ fullName: "Jean Dupont", loginUrl: "https://resellosapp.com" });
  assertStringIncludes(html, "Bonjour Jean Dupont,");
});

Deno.test("buildApprovalEmailHtml sans nom connu -> salutation generique, jamais un nom invente", () => {
  const html = buildApprovalEmailHtml({ fullName: null, loginUrl: "https://resellosapp.com" });
  assertStringIncludes(html, "Bonjour,");
  assertEquals(html.includes("null"), false);
});

Deno.test("buildApprovalEmailHtml ignore un nom vide/blanc comme s'il etait absent", () => {
  const html = buildApprovalEmailHtml({ fullName: "   ", loginUrl: "https://resellosapp.com" });
  assertStringIncludes(html, "Bonjour,");
});

Deno.test("buildApprovalEmailHtml inclut le lien de connexion, en bouton et en texte de repli", () => {
  const html = buildApprovalEmailHtml({ fullName: null, loginUrl: "https://resellosapp.com/custom" });
  const occurrences = html.split("https://resellosapp.com/custom").length - 1;
  assertEquals(occurrences >= 2, true);
});

Deno.test("buildApprovalEmailHtml affiche l'adresse de contact en pied de mail", () => {
  const html = buildApprovalEmailHtml({ fullName: null, loginUrl: "https://resellosapp.com" });
  assertStringIncludes(html, CONTACT_EMAIL);
  assertStringIncludes(html, `mailto:${CONTACT_EMAIL}`);
});

Deno.test("buildApprovalEmailHtml ne contient aucun backtick ni guillemet/apostrophe typographique", () => {
  const html = buildApprovalEmailHtml({ fullName: "Jean", loginUrl: "https://resellosapp.com" });
  assertEquals(html.includes("`"), false);
  assertEquals(html.includes("‘"), false); // '
  assertEquals(html.includes("’"), false); // '
  assertEquals(html.includes("“"), false); // "
  assertEquals(html.includes("”"), false); // "
});
