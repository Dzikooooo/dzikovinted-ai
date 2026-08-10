import { assertEquals } from "jsr:@std/assert";
import { isMetered } from "./credits.ts";

// Matrice complete du Lot 3 (Programme Beta ResellOS) -- voir credits.ts
// pour la justification de chaque cas.

Deno.test("free + standard -> metered (consommation normale)", () => {
  assertEquals(isMetered({ plan: "free", role: "user", credits_mode: "standard" }), true);
});

Deno.test("free + unlimited -> non metered (aucune reservation)", () => {
  assertEquals(isMetered({ plan: "free", role: "user", credits_mode: "unlimited" }), false);
});

Deno.test("free + unlimited puis revert standard -> metered de nouveau", () => {
  assertEquals(isMetered({ plan: "free", role: "user", credits_mode: "standard" }), true);
});

Deno.test("pro + standard -> non metered (deja illimite par le plan)", () => {
  assertEquals(isMetered({ plan: "pro", role: "user", credits_mode: "standard" }), false);
});

Deno.test("team + standard -> non metered (deja illimite par le plan)", () => {
  assertEquals(isMetered({ plan: "team", role: "user", credits_mode: "standard" }), false);
});

Deno.test("admin free + standard -> non metered (role admin prioritaire)", () => {
  assertEquals(isMetered({ plan: "free", role: "admin", credits_mode: "standard" }), false);
});

Deno.test("admin free + unlimited -> non metered (deux raisons cumulees)", () => {
  assertEquals(isMetered({ plan: "free", role: "admin", credits_mode: "unlimited" }), false);
});
