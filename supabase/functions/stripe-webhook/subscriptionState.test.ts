import { assertEquals } from "jsr:@std/assert";
import { resolvePlanForStatus } from "./subscriptionState.ts";

Deno.test("active + plan mappe -> plan payant", () => {
  assertEquals(resolvePlanForStatus("active", "pro"), { kind: "plan", plan: "pro" });
});

Deno.test("trialing + plan mappe -> plan payant", () => {
  assertEquals(resolvePlanForStatus("trialing", "team"), { kind: "plan", plan: "team" });
});

Deno.test("past_due + plan mappe -> conserve le plan payant", () => {
  assertEquals(resolvePlanForStatus("past_due", "pro"), { kind: "plan", plan: "pro" });
});

Deno.test("canceled -> free, quel que soit le mapping", () => {
  assertEquals(resolvePlanForStatus("canceled", "pro"), { kind: "free" });
});

Deno.test("unpaid -> free", () => {
  assertEquals(resolvePlanForStatus("unpaid", "team"), { kind: "free" });
});

Deno.test("incomplete_expired -> free", () => {
  assertEquals(resolvePlanForStatus("incomplete_expired", "pro"), { kind: "free" });
});

Deno.test("paused -> free (comportement defini explicitement, ResellOS n'utilise pas cette fonctionnalite)", () => {
  assertEquals(resolvePlanForStatus("paused", "pro"), { kind: "free" });
});

Deno.test("incomplete -> free (aucun paiement confirme, jamais d'upgrade avant confirmation)", () => {
  assertEquals(resolvePlanForStatus("incomplete", "team"), { kind: "free" });
});

Deno.test("statut payant + Price ID non mappe -> unresolvable (jamais de plan devine)", () => {
  assertEquals(resolvePlanForStatus("active", null), { kind: "unresolvable" });
});

Deno.test("statut non payant + Price ID non mappe -> free (le mapping n'a pas d'importance ici)", () => {
  assertEquals(resolvePlanForStatus("canceled", null), { kind: "free" });
});

Deno.test("statut Stripe futur inconnu -> free par defaut (liste blanche, pas liste noire)", () => {
  assertEquals(resolvePlanForStatus("some_future_status_stripe_might_add", "pro"), { kind: "free" });
});
