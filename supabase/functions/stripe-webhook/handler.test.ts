import { assertEquals, assertExists } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  processStripeWebhookEvent,
  type MinimalSubscriptionEventObject,
  type MinimalCheckoutSessionObject,
  type StripeWebhookEvent,
} from "./handler.ts";

interface FakeDbState {
  subscriptionRow: { user_id: string; stripe_customer_id: string; stripe_event_created_at: string | null } | null;
  subscriptionUpserts: Array<Record<string, unknown>>;
  profileUpdates: Array<{ patch: Record<string, unknown>; userId: string }>;
}

function freshState(overrides: Partial<FakeDbState> = {}): FakeDbState {
  return {
    subscriptionRow: null,
    subscriptionUpserts: [],
    profileUpdates: [],
    ...overrides,
  };
}

// Fake volontairement simple : les deux lectures ("subscriptions" par
// stripe_customer_id dans resolveUserId, par user_id dans la garde
// anti-desordre) retournent la meme ligne en memoire -- suffisant, ces deux
// requetes ciblent conceptuellement la meme ligne dans tous les scenarios
// testes ici. "profiles" leve si interroge en dehors d'un update explicite,
// prouvant structurellement qu'aucune autre operation ne s'y produit.
function fakeSupabaseAdmin(state: FakeDbState): SupabaseClient {
  return {
    from(table: string) {
      if (table === "subscriptions") {
        return {
          select(_c: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  async maybeSingle() {
                    return { data: state.subscriptionRow, error: null };
                  },
                };
              },
            };
          },
          async upsert(row: Record<string, unknown>, _opts: unknown) {
            state.subscriptionUpserts.push(row);
            state.subscriptionRow = {
              user_id: row.user_id as string,
              stripe_customer_id: (row.stripe_customer_id as string) ?? state.subscriptionRow?.stripe_customer_id ?? "",
              stripe_event_created_at:
                (row.stripe_event_created_at as string | undefined) ?? state.subscriptionRow?.stripe_event_created_at ?? null,
            };
            return { error: null };
          },
        };
      }
      if (table === "profiles") {
        return {
          update(patch: Record<string, unknown>) {
            return {
              async eq(_col: string, userId: string) {
                state.profileUpdates.push({ patch, userId });
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`stripe-webhook ne doit jamais interroger la table ${table}`);
    },
  } as unknown as SupabaseClient;
}

function buildSubscriptionObject(overrides: Partial<MinimalSubscriptionEventObject> = {}): MinimalSubscriptionEventObject {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    metadata: { user_id: "user-1" },
    items: { data: [{ price: { id: "price_pro_test" } }] },
    ...overrides,
  };
}

function buildEvent(type: string, object: unknown, created = 1700000000): StripeWebhookEvent {
  return { id: "evt_1", type, created, data: { object } };
}

const NOW = () => new Date("2026-08-08T12:00:00.000Z");

function setPriceEnv() {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  Deno.env.set("STRIPE_TEAM_PRICE_ID", "price_team_test");
}
function clearPriceEnv() {
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
  Deno.env.delete("STRIPE_TEAM_PRICE_ID");
}

Deno.test("subscription.created active -> profiles.plan='pro'", async () => {
  setPriceEnv();
  const state = freshState({ subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null } });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.created", buildSubscriptionObject({ status: "active" }))
  );
  assertEquals(result.status, 200);
  assertEquals(state.profileUpdates.length, 1);
  assertEquals(state.profileUpdates[0].patch.plan, "pro");
  assertEquals(state.profileUpdates[0].userId, "user-1");
  clearPriceEnv();
});

Deno.test("subscription.updated active->past_due -> conserve le plan payant (pas de downgrade)", async () => {
  setPriceEnv();
  const state = freshState({ subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null } });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "past_due" }))
  );
  assertEquals(result.status, 200);
  assertEquals(state.profileUpdates[0].patch.plan, "pro");
  assertEquals(state.subscriptionUpserts[0].status, "past_due");
  clearPriceEnv();
});

for (const status of ["canceled", "unpaid", "incomplete_expired", "paused", "incomplete"]) {
  Deno.test(`subscription.updated statut '${status}' -> profiles.plan='free'`, async () => {
    setPriceEnv();
    const state = freshState({ subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null } });
    const result = await processStripeWebhookEvent(
      { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
      buildEvent("customer.subscription.updated", buildSubscriptionObject({ status }))
    );
    assertEquals(result.status, 200);
    assertEquals(state.profileUpdates[0].patch.plan, "free");
    clearPriceEnv();
  });
}

Deno.test("statut payant + Price ID inconnu -> aucune ecriture (ni subscriptions ni profiles), 200", async () => {
  setPriceEnv();
  const state = freshState({ subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null } });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent(
      "customer.subscription.updated",
      buildSubscriptionObject({ status: "active", items: { data: [{ price: { id: "price_totalement_inconnu" } }] } })
    )
  );
  assertEquals(result.status, 200);
  assertEquals(state.subscriptionUpserts.length, 0);
  assertEquals(state.profileUpdates.length, 0);
  clearPriceEnv();
});

Deno.test("utilisateur introuvable (ni table ni metadata) -> 200, aucune ecriture", async () => {
  setPriceEnv();
  const state = freshState({ subscriptionRow: null });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.created", buildSubscriptionObject({ metadata: null }))
  );
  assertEquals(result.status, 200);
  assertEquals(state.subscriptionUpserts.length, 0);
  assertEquals(state.profileUpdates.length, 0);
  clearPriceEnv();
});

Deno.test("evenement plus ancien que l'etat stocke -> ignore, aucune ecriture", async () => {
  setPriceEnv();
  const storedAtIso = new Date(1700000500 * 1000).toISOString();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: storedAtIso },
  });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "canceled" }), 1700000000) // plus ancien que storedAtIso
  );
  assertEquals(result.status, 200);
  assertEquals(state.subscriptionUpserts.length, 0);
  assertEquals(state.profileUpdates.length, 0);
  clearPriceEnv();
});

Deno.test("meme evenement rejoue -> idempotent, meme resultat final, pas de double effet", async () => {
  setPriceEnv();
  const state = freshState({ subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null } });
  const event = buildEvent("customer.subscription.created", buildSubscriptionObject({ status: "active" }), 1700000000);

  const first = await processStripeWebhookEvent({ supabaseAdmin: fakeSupabaseAdmin(state), now: NOW }, event);
  const second = await processStripeWebhookEvent({ supabaseAdmin: fakeSupabaseAdmin(state), now: NOW }, event);

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  assertEquals(state.subscriptionUpserts.length, 2); // les deux upserts s'executent (idempotents)
  assertEquals(state.profileUpdates.length, 2);
  // Meme valeur finale a chaque fois -- aucune derive, aucun doublon d'effet.
  assertEquals(state.profileUpdates[0].patch.plan, state.profileUpdates[1].patch.plan);
  assertEquals(state.subscriptionUpserts[0].status, state.subscriptionUpserts[1].status);
  clearPriceEnv();
});

Deno.test("subscription.deleted -> status='canceled', profiles.plan='free'", async () => {
  setPriceEnv();
  const state = freshState({ subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null } });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.deleted", buildSubscriptionObject({ status: "active" })) // Stripe envoie souvent encore 'active'/'canceled' selon le cas, le handler force 'canceled'
  );
  assertEquals(result.status, 200);
  assertEquals(state.subscriptionUpserts[0].status, "canceled");
  assertEquals(state.profileUpdates[0].patch.plan, "free");
  clearPriceEnv();
});

Deno.test("checkout.session.completed -> rattache stripe_customer_id uniquement, jamais profiles ni status", async () => {
  const state = freshState();
  const session: MinimalCheckoutSessionObject = {
    customer: "cus_new",
    client_reference_id: "user-1",
    metadata: { user_id: "user-1" },
  };
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("checkout.session.completed", session)
  );
  assertEquals(result.status, 200);
  assertEquals(state.subscriptionUpserts.length, 1);
  assertEquals(state.subscriptionUpserts[0].stripe_customer_id, "cus_new");
  assertEquals(state.subscriptionUpserts[0].user_id, "user-1");
  assertEquals("status" in state.subscriptionUpserts[0], false);
  assertEquals("stripe_event_created_at" in state.subscriptionUpserts[0], false);
  assertEquals(state.profileUpdates.length, 0);
});

Deno.test("invoice.payment_succeeded -> aucune ecriture", async () => {
  const state = freshState();
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("invoice.payment_succeeded", {})
  );
  assertEquals(result.status, 200);
  assertEquals(state.subscriptionUpserts.length, 0);
  assertEquals(state.profileUpdates.length, 0);
});

Deno.test("invoice.payment_failed -> aucune ecriture, pas de downgrade immediat", async () => {
  const state = freshState();
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("invoice.payment_failed", {})
  );
  assertEquals(result.status, 200);
  assertEquals(state.subscriptionUpserts.length, 0);
  assertEquals(state.profileUpdates.length, 0);
});

Deno.test("type d'evenement non gere -> 200, aucune ecriture", async () => {
  const state = freshState();
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.updated", {})
  );
  assertEquals(result.status, 200);
  assertEquals(state.subscriptionUpserts.length, 0);
  assertEquals(state.profileUpdates.length, 0);
});

Deno.test("resolution utilisateur via fallback metadata (pas de ligne subscriptions existante)", async () => {
  setPriceEnv();
  const state = freshState({ subscriptionRow: null });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.created", buildSubscriptionObject({ status: "active", metadata: { user_id: "user-fallback" } }))
  );
  assertEquals(result.status, 200);
  assertExists(state.profileUpdates[0]);
  assertEquals(state.profileUpdates[0].userId, "user-fallback");
  clearPriceEnv();
});
