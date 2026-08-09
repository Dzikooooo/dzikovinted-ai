import { assertEquals, assertExists } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  processStripeWebhookEvent,
  type MinimalSubscriptionEventObject,
  type MinimalCheckoutSessionObject,
  type StripeWebhookEvent,
} from "./handler.ts";

interface FakeDbState {
  subscriptionRow: { user_id: string; stripe_customer_id: string; stripe_event_created_at: string | null; status: string | null } | null;
  profileRow: { plan: string } | null;
  applyCalls: Array<Record<string, unknown>>;
  checkoutUpserts: Array<Record<string, unknown>>;
  profileUpdates: Array<{ patch: Record<string, unknown>; userId: string }>;
}

function freshState(overrides: Partial<FakeDbState> = {}): FakeDbState {
  return {
    subscriptionRow: null,
    profileRow: { plan: "free" },
    applyCalls: [],
    checkoutUpserts: [],
    profileUpdates: [],
    ...overrides,
  };
}

// Fake du RPC apply_subscription_event (P1-2, migration 20260809100000) --
// emule fidelement la clause WHERE de la fonction SQL reelle (accepte si
// aucun etat stocke ou si l'evenement entrant est >= a stripe_event_created_at
// deja stocke, sinon aucune mutation) afin de tester la REACTION du code JS
// a chaque issue possible. L'atomicite elle-meme (le fait que Postgres
// serialise reellement deux appels concurrents sur la meme ligne via
// ON CONFLICT ... WHERE) n'est pas testable ici sans instance Postgres
// reelle -- verifiee par construction/relecture de la migration, cf.
// rapport d'audit.
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
            state.checkoutUpserts.push(row);
            return { error: null };
          },
        };
      }
      if (table === "profiles") {
        return {
          select(_c: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  async maybeSingle() {
                    return { data: state.profileRow, error: null };
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(_col: string, userId: string) {
                state.profileUpdates.push({ patch, userId });
                state.profileRow = { plan: patch.plan as string };
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`stripe-webhook ne doit jamais interroger la table ${table}`);
    },
    async rpc(name: string, params: Record<string, unknown>) {
      if (name !== "apply_subscription_event") {
        throw new Error(`RPC inattendue dans ce test: ${name}`);
      }
      state.applyCalls.push(params);
      const storedAt = state.subscriptionRow?.stripe_event_created_at ?? null;
      const incoming = params.p_stripe_event_created_at as string;
      const applies = storedAt === null || new Date(incoming).getTime() >= new Date(storedAt).getTime();
      if (applies) {
        state.subscriptionRow = {
          user_id: params.p_user_id as string,
          stripe_customer_id: params.p_stripe_customer_id as string,
          stripe_event_created_at: incoming,
          status: params.p_status as string,
        };
      }
      return { data: applies, error: null };
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
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: null },
  });
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

Deno.test("subscription.updated active->past_due, meme plan -> conserve le plan payant (grace period)", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: "active" },
    profileRow: { plan: "pro" }, // deja Pro : ce past_due est un simple renouvellement echoue
  });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "past_due" }))
  );
  assertEquals(result.status, 200);
  assertEquals(state.profileUpdates.length, 1);
  assertEquals(state.profileUpdates[0].patch.plan, "pro");
  assertEquals(state.applyCalls[0].p_status, "past_due");
  clearPriceEnv();
});

Deno.test("P1-3 : Pro + upgrade Team, paiement du prorata echoue (past_due, Price ID different du plan deja accorde) -> reste Pro", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: "active" },
    profileRow: { plan: "pro" }, // plan deja accorde AVANT cet evenement
  });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    // Stripe a deja bascule le Price ID vers Team (comportement reel d'un
    // changement de plan immediat) mais le paiement de la proration a
    // echoue -> status='past_due'.
    buildEvent(
      "customer.subscription.updated",
      buildSubscriptionObject({ status: "past_due", items: { data: [{ price: { id: "price_team_test" } }] } })
    )
  );
  assertEquals(result.status, 200);
  // subscriptions.status enregistre neanmoins la realite Stripe (past_due).
  assertEquals(state.applyCalls[0].p_status, "past_due");
  assertEquals(state.subscriptionRow?.status, "past_due");
  // profiles.plan JAMAIS touche -- ni accorde Team, ni retire Pro.
  assertEquals(state.profileUpdates.length, 0);
  assertEquals(state.profileRow?.plan, "pro");
  clearPriceEnv();
});

Deno.test("P1-3 : Free + tentative d'abonnement, past_due des le depart (premier paiement jamais confirme) -> reste Free", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: null },
    profileRow: { plan: "free" },
  });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.created", buildSubscriptionObject({ status: "past_due" }))
  );
  assertEquals(result.status, 200);
  assertEquals(state.profileUpdates.length, 0);
  assertEquals(state.profileRow?.plan, "free");
  clearPriceEnv();
});

for (const status of ["canceled", "unpaid", "incomplete_expired", "paused", "incomplete"]) {
  Deno.test(`subscription.updated statut '${status}' -> profiles.plan='free'`, async () => {
    setPriceEnv();
    const state = freshState({
      subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: "active" },
      profileRow: { plan: "pro" },
    });
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
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: null },
  });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent(
      "customer.subscription.updated",
      buildSubscriptionObject({ status: "active", items: { data: [{ price: { id: "price_totalement_inconnu" } }] } })
    )
  );
  assertEquals(result.status, 200);
  assertEquals(state.applyCalls.length, 0);
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
  assertEquals(state.applyCalls.length, 0);
  assertEquals(state.profileUpdates.length, 0);
  clearPriceEnv();
});

Deno.test("evenement plus ancien que l'etat stocke -> ignore, aucune ecriture (meme sur profiles)", async () => {
  setPriceEnv();
  const storedAtIso = new Date(1700000500 * 1000).toISOString();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: storedAtIso, status: "active" },
    profileRow: { plan: "pro" },
  });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "canceled" }), 1700000000) // plus ancien que storedAtIso
  );
  assertEquals(result.status, 200);
  assertEquals(state.applyCalls.length, 1); // la RPC est bien appelee...
  assertEquals(state.profileUpdates.length, 0); // ...mais n'a rien applique, profiles jamais touche
  assertEquals(state.profileRow?.plan, "pro"); // inchange
  clearPriceEnv();
});

Deno.test("meme evenement rejoue -> idempotent, meme resultat final, pas de double effet", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: null },
  });
  const event = buildEvent("customer.subscription.created", buildSubscriptionObject({ status: "active" }), 1700000000);

  const first = await processStripeWebhookEvent({ supabaseAdmin: fakeSupabaseAdmin(state), now: NOW }, event);
  const second = await processStripeWebhookEvent({ supabaseAdmin: fakeSupabaseAdmin(state), now: NOW }, event);

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  assertEquals(state.applyCalls.length, 2); // les deux appels s'executent (idempotents)
  assertEquals(state.profileUpdates.length, 2);
  // Meme valeur finale a chaque fois -- aucune derive, aucun doublon d'effet.
  assertEquals(state.profileUpdates[0].patch.plan, state.profileUpdates[1].patch.plan);
  clearPriceEnv();
});

// P1-2 : 4 scenarios d'ordonnancement explicitement demandes par l'audit.
// event.created=100 puis event.created=200 (secondes Unix arbitraires, peu
// importe la valeur reelle) -- verifie la REACTION du code JS a ce que la
// RPC (emulee fidelement a la clause WHERE SQL reelle, voir fakeSupabaseAdmin)
// renverrait dans chaque cas.
Deno.test("P1-2 : event 100 puis event 200 -> etat final = 200 (canceled)", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: null },
    profileRow: { plan: "pro" },
  });
  const deps = { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW };
  await processStripeWebhookEvent(deps, buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "active" }), 100));
  await processStripeWebhookEvent(deps, buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "canceled" }), 200));
  assertEquals(state.subscriptionRow?.status, "canceled");
  assertEquals(state.subscriptionRow?.stripe_event_created_at, new Date(200 * 1000).toISOString());
  clearPriceEnv();
});

Deno.test("P1-2 : event 200 puis event 100 -> etat final reste 200 (le plus ancien n'ecrase jamais)", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: null },
    profileRow: { plan: "pro" },
  });
  const deps = { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW };
  await processStripeWebhookEvent(deps, buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "canceled" }), 200));
  await processStripeWebhookEvent(deps, buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "active" }), 100));
  // Le 2e appel (event 100, plus ancien) ne doit rien modifier.
  assertEquals(state.subscriptionRow?.status, "canceled");
  assertEquals(state.subscriptionRow?.stripe_event_created_at, new Date(200 * 1000).toISOString());
  assertEquals(state.profileUpdates.length, 1); // seul l'evenement 200 a ecrit profiles.plan
  clearPriceEnv();
});

Deno.test("P1-2 : events 100 et 200 traites en parallele (Promise.all) -> etat final = 200 quel que soit l'ordre de resolution", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: null },
    profileRow: { plan: "pro" },
  });
  const deps = { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW };
  await Promise.all([
    processStripeWebhookEvent(deps, buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "active" }), 100)),
    processStripeWebhookEvent(deps, buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "canceled" }), 200)),
  ]);
  // Le fake n'est pas un vrai moteur de concurrence Postgres (pas de verrou
  // de ligne reel ici) -- ce test verifie que le code JS, lui, ne fait
  // aucune hypothese d'ordre entre les deux appels ; l'atomicite reelle
  // (garantie par ON CONFLICT ... WHERE cote SQL) est verifiee par
  // construction, cf. migration 20260809100000 et rapport d'audit.
  assertEquals(state.subscriptionRow?.status, "canceled");
  assertEquals(state.subscriptionRow?.stripe_event_created_at, new Date(200 * 1000).toISOString());
  clearPriceEnv();
});

Deno.test("P1-2 : event 200 rejoue -> aucun changement incoherent (meme etat, pas d'erreur)", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: null },
    profileRow: { plan: "pro" },
  });
  const deps = { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW };
  const event200 = buildEvent("customer.subscription.updated", buildSubscriptionObject({ status: "canceled" }), 200);
  await processStripeWebhookEvent(deps, event200);
  const before = { ...state.subscriptionRow };
  const replay = await processStripeWebhookEvent(deps, event200);
  assertEquals(replay.status, 200);
  assertEquals(state.subscriptionRow?.status, before.status);
  assertEquals(state.subscriptionRow?.stripe_event_created_at, before.stripe_event_created_at);
  clearPriceEnv();
});

Deno.test("subscription.deleted -> status='canceled', profiles.plan='free', inconditionnel", async () => {
  setPriceEnv();
  const state = freshState({
    subscriptionRow: { user_id: "user-1", stripe_customer_id: "cus_1", stripe_event_created_at: null, status: "active" },
    profileRow: { plan: "team" },
  });
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.subscription.deleted", buildSubscriptionObject({ status: "active" })) // Stripe envoie souvent encore 'active'/'canceled' selon le cas, le handler force 'canceled'
  );
  assertEquals(result.status, 200);
  assertEquals(state.applyCalls[0].p_status, "canceled");
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
  assertEquals(state.checkoutUpserts.length, 1);
  assertEquals(state.checkoutUpserts[0].stripe_customer_id, "cus_new");
  assertEquals(state.checkoutUpserts[0].user_id, "user-1");
  assertEquals("status" in state.checkoutUpserts[0], false);
  assertEquals("stripe_event_created_at" in state.checkoutUpserts[0], false);
  assertEquals(state.profileUpdates.length, 0);
});

Deno.test("invoice.payment_succeeded -> aucune ecriture", async () => {
  const state = freshState();
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("invoice.payment_succeeded", {})
  );
  assertEquals(result.status, 200);
  assertEquals(state.applyCalls.length, 0);
  assertEquals(state.profileUpdates.length, 0);
});

Deno.test("invoice.payment_failed -> aucune ecriture, pas de downgrade immediat", async () => {
  const state = freshState();
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("invoice.payment_failed", {})
  );
  assertEquals(result.status, 200);
  assertEquals(state.applyCalls.length, 0);
  assertEquals(state.profileUpdates.length, 0);
});

Deno.test("type d'evenement non gere -> 200, aucune ecriture", async () => {
  const state = freshState();
  const result = await processStripeWebhookEvent(
    { supabaseAdmin: fakeSupabaseAdmin(state), now: NOW },
    buildEvent("customer.updated", {})
  );
  assertEquals(result.status, 200);
  assertEquals(state.applyCalls.length, 0);
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
