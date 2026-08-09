import { assertEquals } from "jsr:@std/assert";
import { resolvePlanDecision } from "./subscriptionState.ts";

Deno.test("active + plan mappe -> plan payant, quel que soit le plan deja accorde", () => {
  assertEquals(resolvePlanDecision("active", "pro", "free"), { kind: "plan", plan: "pro" });
  assertEquals(resolvePlanDecision("active", "team", "pro"), { kind: "plan", plan: "team" });
});

Deno.test("trialing + plan mappe -> plan payant", () => {
  assertEquals(resolvePlanDecision("trialing", "team", "free"), { kind: "plan", plan: "team" });
});

Deno.test("past_due + Price ID identique au plan deja accorde -> renouvellement echoue, conserve (grace period)", () => {
  assertEquals(resolvePlanDecision("past_due", "pro", "pro"), { kind: "plan", plan: "pro" });
  assertEquals(resolvePlanDecision("past_due", "team", "team"), { kind: "plan", plan: "team" });
});

Deno.test("P1-3 : past_due + Price ID different du plan deja accorde -> upgrade non confirme, ne touche jamais profiles.plan", () => {
  assertEquals(resolvePlanDecision("past_due", "team", "pro"), { kind: "unchanged" });
  assertEquals(resolvePlanDecision("past_due", "pro", "team"), { kind: "unchanged" });
});

Deno.test("P1-3 : past_due + Price ID mappe alors que l'utilisateur etait Free (premier paiement jamais confirme) -> unchanged (reste Free)", () => {
  assertEquals(resolvePlanDecision("past_due", "pro", "free"), { kind: "unchanged" });
});

Deno.test("canceled -> free, quel que soit le mapping ou le plan deja accorde", () => {
  assertEquals(resolvePlanDecision("canceled", "pro", "pro"), { kind: "free" });
});

Deno.test("unpaid -> free", () => {
  assertEquals(resolvePlanDecision("unpaid", "team", "team"), { kind: "free" });
});

Deno.test("incomplete_expired -> free", () => {
  assertEquals(resolvePlanDecision("incomplete_expired", "pro", "pro"), { kind: "free" });
});

Deno.test("paused -> free (comportement defini explicitement, ResellOS n'utilise pas cette fonctionnalite)", () => {
  assertEquals(resolvePlanDecision("paused", "pro", "pro"), { kind: "free" });
});

Deno.test("incomplete -> free (aucun paiement confirme, jamais d'upgrade avant confirmation)", () => {
  assertEquals(resolvePlanDecision("incomplete", "team", "free"), { kind: "free" });
});

Deno.test("statut payant + Price ID non mappe -> unresolvable (jamais de plan devine)", () => {
  assertEquals(resolvePlanDecision("active", null, "free"), { kind: "unresolvable" });
});

Deno.test("past_due + Price ID non mappe -> unresolvable (jamais de plan devine, meme en grace period)", () => {
  assertEquals(resolvePlanDecision("past_due", null, "pro"), { kind: "unresolvable" });
});

Deno.test("statut non payant + Price ID non mappe -> free (le mapping n'a pas d'importance ici)", () => {
  assertEquals(resolvePlanDecision("canceled", null, "pro"), { kind: "free" });
});

Deno.test("statut Stripe futur inconnu -> free par defaut (liste blanche, pas liste noire)", () => {
  assertEquals(resolvePlanDecision("some_future_status_stripe_might_add", "pro", "pro"), { kind: "free" });
});
