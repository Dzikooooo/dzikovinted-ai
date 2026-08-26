import { assertEquals } from "jsr:@std/assert";
import { parseRequestedPlan } from "./validation.ts";

// Pur, zero mock -- couvre les cas de rejet d'entree exiges par le Lot 2
// (plan 'free', plan inconnu, Price ID arbitraire, body invalide).

Deno.test("accepte plan 'pro', mensuel par defaut", () => {
  const result = parseRequestedPlan({ plan: "pro" });
  assertEquals(result, { ok: true, plan: "pro", interval: "month" });
});

Deno.test("accepte plan 'team', mensuel par defaut", () => {
  const result = parseRequestedPlan({ plan: "team" });
  assertEquals(result, { ok: true, plan: "team", interval: "month" });
});

Deno.test("rejette plan 'free'", () => {
  const result = parseRequestedPlan({ plan: "free" });
  assertEquals(result.ok, false);
});

Deno.test("rejette un plan inconnu ('enterprise')", () => {
  const result = parseRequestedPlan({ plan: "enterprise" });
  assertEquals(result.ok, false);
});

Deno.test("rejette un Price ID Stripe envoye directement au lieu d'un plan", () => {
  const result = parseRequestedPlan({ plan: "price_1AbCdEfGhIjKlMnO" });
  assertEquals(result.ok, false);
});

Deno.test("rejette un body sans champ plan", () => {
  const result = parseRequestedPlan({});
  assertEquals(result.ok, false);
});

Deno.test("rejette un body null", () => {
  const result = parseRequestedPlan(null);
  assertEquals(result.ok, false);
});

Deno.test("rejette un body qui est un tableau", () => {
  const result = parseRequestedPlan(["pro"]);
  assertEquals(result.ok, false);
});

Deno.test("rejette un body qui est une chaine brute", () => {
  const result = parseRequestedPlan("pro");
  assertEquals(result.ok, false);
});

Deno.test("rejette un body qui est un nombre", () => {
  const result = parseRequestedPlan(42);
  assertEquals(result.ok, false);
});

Deno.test("rejette un body undefined", () => {
  const result = parseRequestedPlan(undefined);
  assertEquals(result.ok, false);
});

// --- Facturation annuelle (2026-08-26) ---
//
// Le point sensible : un intervalle absent ou douteux ne doit JAMAIS devenir
// un engagement de douze mois. On retombe sur le mensuel, ou on refuse.

Deno.test("accepte interval 'year' explicite", () => {
  assertEquals(parseRequestedPlan({ plan: "pro", interval: "year" }), {
    ok: true,
    plan: "pro",
    interval: "year",
  });
});

Deno.test("accepte interval 'month' explicite", () => {
  assertEquals(parseRequestedPlan({ plan: "team", interval: "month" }), {
    ok: true,
    plan: "team",
    interval: "month",
  });
});

Deno.test("un client d'une version anterieure (sans interval) reste au mensuel", () => {
  const result = parseRequestedPlan({ plan: "pro" });
  assertEquals(result.ok && result.interval, "month");
});

Deno.test("interval null retombe au mensuel, jamais a l'annuel", () => {
  const result = parseRequestedPlan({ plan: "pro", interval: null });
  assertEquals(result.ok && result.interval, "month");
});

Deno.test("rejette un interval inconnu au lieu de le corriger en silence", () => {
  // 'annual', 'yearly', 'an'... : refuser est la seule option sure. Corriger
  // vers 'year' engagerait le client sur douze mois sur une faute de frappe.
  for (const bad of ["annual", "yearly", "an", "YEAR", "", 12, true, {}]) {
    assertEquals(parseRequestedPlan({ plan: "pro", interval: bad }).ok, false);
  }
});

Deno.test("rejette un plan invalide meme avec un interval valide", () => {
  assertEquals(parseRequestedPlan({ plan: "free", interval: "year" }).ok, false);
});
