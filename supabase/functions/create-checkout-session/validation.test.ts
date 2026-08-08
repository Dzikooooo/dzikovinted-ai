import { assertEquals } from "jsr:@std/assert";
import { parseRequestedPlan } from "./validation.ts";

// Pur, zero mock -- couvre les cas de rejet d'entree exiges par le Lot 2
// (plan 'free', plan inconnu, Price ID arbitraire, body invalide).

Deno.test("accepte plan 'pro'", () => {
  const result = parseRequestedPlan({ plan: "pro" });
  assertEquals(result, { ok: true, plan: "pro" });
});

Deno.test("accepte plan 'team'", () => {
  const result = parseRequestedPlan({ plan: "team" });
  assertEquals(result, { ok: true, plan: "team" });
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
