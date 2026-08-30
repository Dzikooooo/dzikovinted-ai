import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildApprovalEmailHtml, buildApprovalEmailSubject } from "./emailTemplate.ts";

Deno.test("buildApprovalEmailSubject renvoie un sujet fixe et clair", () => {
  assertEquals(buildApprovalEmailSubject(), "Ton accès à ResellOS est ouvert 🎉");
});

Deno.test("buildApprovalEmailHtml personnalise avec le prenom quand connu", () => {
  const html = buildApprovalEmailHtml({ fullName: "Jean Dupont", loginUrl: "https://resellosapp.com" });
  assertStringIncludes(html, "Salut Jean Dupont,");
});

Deno.test("buildApprovalEmailHtml sans nom connu -> salutation generique, jamais un nom invente", () => {
  const html = buildApprovalEmailHtml({ fullName: null, loginUrl: "https://resellosapp.com" });
  assertStringIncludes(html, "Salut,");
  assertEquals(html.includes("null"), false);
});

Deno.test("buildApprovalEmailHtml ignore un nom vide/blanc comme s'il etait absent", () => {
  const html = buildApprovalEmailHtml({ fullName: "   ", loginUrl: "https://resellosapp.com" });
  assertStringIncludes(html, "Salut,");
});

Deno.test("buildApprovalEmailHtml inclut le lien de connexion, en bouton et en texte de repli", () => {
  const html = buildApprovalEmailHtml({ fullName: null, loginUrl: "https://resellosapp.com/custom" });
  const occurrences = html.split("https://resellosapp.com/custom").length - 1;
  assertEquals(occurrences >= 2, true);
});
