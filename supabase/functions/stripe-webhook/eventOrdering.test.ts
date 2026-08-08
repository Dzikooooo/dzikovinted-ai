import { assertEquals } from "jsr:@std/assert";
import { isEventApplicable, stripeEventTimestamp } from "./eventOrdering.ts";

Deno.test("conversion Unix seconds -> Date explicite (event.created * 1000)", () => {
  // 1700000000 (Stripe, secondes) -> 1700000000000 ms
  const result = stripeEventTimestamp(1700000000);
  assertEquals(result.getTime(), 1700000000000);
  assertEquals(result instanceof Date, true);
});

Deno.test("aucun etat stocke (NULL) -> evenement toujours accepte", () => {
  assertEquals(isEventApplicable(null, 1700000000), true);
});

Deno.test("event.created >= stripe_event_created_at stocke -> accepte", () => {
  const stored = new Date(1700000000 * 1000);
  assertEquals(isEventApplicable(stored, 1700000100), true); // plus recent
});

Deno.test("event.created == stripe_event_created_at stocke -> accepte (rejeu, idempotent via l'upsert, pas via cette comparaison)", () => {
  const stored = new Date(1700000000 * 1000);
  assertEquals(isEventApplicable(stored, 1700000000), true);
});

Deno.test("event.created < stripe_event_created_at stocke -> ignore", () => {
  const stored = new Date(1700000100 * 1000);
  assertEquals(isEventApplicable(stored, 1700000000), false); // plus ancien
});
