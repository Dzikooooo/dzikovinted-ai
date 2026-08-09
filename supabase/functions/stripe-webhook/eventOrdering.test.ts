import { assertEquals } from "jsr:@std/assert";
import { stripeEventTimestamp } from "./eventOrdering.ts";

// isEventApplicable (SELECT-puis-decision cote JS, non atomique) a ete
// retiree au profit de la clause WHERE de apply_subscription_event
// (migration 20260809100000, P1-2) -- la logique d'ordonnancement elle-meme
// est desormais testee au niveau de stripe-webhook/handler.test.ts (ou elle
// exerce reellement la reaction du code a ce que la RPC renvoie), ce fichier
// ne couvre plus que la conversion pure.
Deno.test("conversion Unix seconds -> Date explicite (event.created * 1000)", () => {
  // 1700000000 (Stripe, secondes) -> 1700000000000 ms
  const result = stripeEventTimestamp(1700000000);
  assertEquals(result.getTime(), 1700000000000);
  assertEquals(result instanceof Date, true);
});
