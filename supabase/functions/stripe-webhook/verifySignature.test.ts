import { assertEquals } from "jsr:@std/assert";
import type Stripe from "npm:stripe@17";
import { verifyStripeWebhookRequest } from "./verifySignature.ts";

const FAKE_EVENT = { id: "evt_1", type: "customer.subscription.created", created: 1700000000 } as Stripe.Event;

Deno.test("signature absente -> null, constructEventAsync jamais appele", async () => {
  let called = false;
  const result = await verifyStripeWebhookRequest(
    { constructEventAsync: async () => { called = true; return FAKE_EVENT; } },
    "{}",
    null,
    "whsec_test"
  );
  assertEquals(result, null);
  assertEquals(called, false);
});

Deno.test("signature invalide (constructEventAsync leve) -> null", async () => {
  const result = await verifyStripeWebhookRequest(
    { constructEventAsync: async () => { throw new Error("No signatures found matching the expected signature"); } },
    "{}",
    "t=1,v1=bad",
    "whsec_test"
  );
  assertEquals(result, null);
});

Deno.test("signature valide -> evenement retourne tel quel", async () => {
  const result = await verifyStripeWebhookRequest(
    { constructEventAsync: async () => FAKE_EVENT },
    "{}",
    "t=1,v1=good",
    "whsec_test"
  );
  assertEquals(result, FAKE_EVENT);
});
