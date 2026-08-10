import { assertEquals, assertExists } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { createCheckoutSessionForPlan, type StripeClientForCheckout } from "./handler.ts";

interface ReserveResult {
  reserved: boolean;
  reason: "reserved" | "already_subscribed" | "checkout_in_progress";
  stripe_customer_id: string | null;
}

// Fake du RPC reserve_checkout_slot/release_checkout_reservation (P1-1,
// migration 20260809100000) -- simule exactement ce que l'UPSERT atomique
// cote Postgres renverrait pour CE test (reservation reussie, deja abonne,
// ou "en cours" -- ce dernier cas represente ce que verrait une DEUXIEME
// requete concurrente si l'UPSERT reel avait deja serialise la premiere).
// L'atomicite elle-meme vit dans la clause SQL (ON CONFLICT ... WHERE),
// verifiee par construction/relecture, pas testable ici sans Postgres reel.
interface ClaimOfferResult {
  trial_period_days: number;
  stripe_coupon_id: string | null;
}

function fakeSupabaseAdmin(opts: {
  reserveResult?: ReserveResult;
  reserveError?: unknown;
  upsertError?: unknown;
  onUpsert?: (row: Record<string, unknown>) => void;
  rpcCalls?: { name: string; params: Record<string, unknown> }[];
  fromCalls?: string[];
  // Programme Beta ResellOS (Lot 7+8) : par defaut, aucune offre pending
  // (comportement identique a aujourd'hui) -- un test passe claimOfferResult
  // pour simuler une offre reclamee.
  claimOfferResult?: ClaimOfferResult;
  claimOfferError?: unknown;
}): SupabaseClient {
  return {
    from(table: string) {
      opts.fromCalls?.push(table);
      if (table !== "subscriptions") {
        throw new Error(`create-checkout-session ne doit jamais interroger la table ${table}`);
      }
      return {
        async upsert(row: Record<string, unknown>, _conflict: { onConflict: string }) {
          opts.onUpsert?.(row);
          return { error: opts.upsertError ?? null };
        },
      };
    },
    async rpc(name: string, params: Record<string, unknown>) {
      opts.rpcCalls?.push({ name, params });
      if (name === "reserve_checkout_slot") {
        if (opts.reserveError) return { data: null, error: opts.reserveError };
        const row = opts.reserveResult ?? { reserved: true, reason: "reserved", stripe_customer_id: null };
        return { data: [row], error: null };
      }
      if (name === "release_checkout_reservation") {
        return { data: null, error: null };
      }
      if (name === "claim_commercial_offer") {
        if (opts.claimOfferError) return { data: null, error: opts.claimOfferError };
        return { data: opts.claimOfferResult ? [opts.claimOfferResult] : [], error: null };
      }
      if (name === "release_commercial_offer") {
        return { data: null, error: null };
      }
      throw new Error(`RPC inattendue dans ce test: ${name}`);
    },
  } as unknown as SupabaseClient;
}

function fakeStripe(opts: {
  retrieveResult?: { deleted?: boolean; id?: string };
  retrieveThrows?: boolean;
  createdCustomerId?: string;
  onCustomerCreate?: (params: { metadata: Record<string, string>; email?: string }) => void;
  sessionUrl?: string | null;
  sessionThrows?: boolean;
  onSessionCreate?: (params: Record<string, unknown>) => void;
}): StripeClientForCheckout {
  return {
    customers: {
      async retrieve(id: string) {
        if (opts.retrieveThrows) throw new Error("resource_missing");
        return opts.retrieveResult ?? { id };
      },
      async create(params) {
        opts.onCustomerCreate?.(params);
        return { id: opts.createdCustomerId ?? "cus_new" };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          opts.onSessionCreate?.(params);
          if (opts.sessionThrows) throw new Error("Stripe indisponible (test)");
          return { url: opts.sessionUrl === undefined ? "https://checkout.stripe.com/fake" : opts.sessionUrl };
        },
      },
    },
  };
}

const NOW = () => new Date("2026-08-08T12:00:00.000Z");

Deno.test("secret Price ID absent -> erreur 500 generique, aucun appel RPC/Stripe", async () => {
  // STRIPE_PRO_PRICE_ID delibrement non defini -- resolvePriceId() leve
  // AVANT toute tentative de reservation, handler.ts doit repondre
  // proprement sans jamais renvoyer le nom de la variable manquante.
  const rpcCalls: { name: string; params: Record<string, unknown> }[] = [];
  const result = await createCheckoutSessionForPlan(
    { stripe: fakeStripe({}), supabaseAdmin: fakeSupabaseAdmin({ rpcCalls }), now: NOW },
    "user-1",
    "user@example.invalid",
    "pro"
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 500);
    assertEquals(result.error.includes("STRIPE_PRO_PRICE_ID"), false);
  }
  assertEquals(rpcCalls.length, 0);
});

Deno.test("requete normale : reservation reussie -> Customer cree, subscriptions upsert, Checkout cree", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let createdCustomerParams: { metadata: Record<string, string>; email?: string } | null = null;
  let upsertedRow: Record<string, unknown> | null = null;
  let sessionParams: Record<string, unknown> | null = null;
  const fromCalls: string[] = [];
  const rpcCalls: { name: string; params: Record<string, unknown> }[] = [];

  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({
        createdCustomerId: "cus_brand_new",
        onCustomerCreate: (p) => {
          createdCustomerParams = p;
        },
        onSessionCreate: (p) => {
          sessionParams = p;
        },
      }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: null },
        onUpsert: (row) => {
          upsertedRow = row;
        },
        fromCalls,
        rpcCalls,
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.url, "https://checkout.stripe.com/fake");
  }

  assertEquals(rpcCalls.length, 2);
  assertEquals(rpcCalls[0].name, "reserve_checkout_slot");
  assertEquals(rpcCalls[0].params.p_user_id, "user-1");
  assertEquals(rpcCalls[1].name, "claim_commercial_offer");
  assertEquals(rpcCalls[1].params.p_user_id, "user-1");

  assertExists(createdCustomerParams);
  assertEquals((createdCustomerParams as { metadata: Record<string, string> }).metadata.user_id, "user-1");
  assertEquals((createdCustomerParams as { email?: string }).email, "user@example.invalid");

  assertExists(upsertedRow);
  const row = upsertedRow as Record<string, unknown>;
  assertEquals(row.user_id, "user-1");
  assertEquals(row.stripe_customer_id, "cus_brand_new");
  assertEquals(row.status, null);
  assertEquals(row.stripe_event_created_at, null);

  assertExists(sessionParams);
  const params = sessionParams as Record<string, unknown>;
  assertEquals(params.customer, "cus_brand_new");
  assertEquals(params.client_reference_id, "user-1");
  assertEquals(params.mode, "subscription");
  assertEquals((params.line_items as Array<{ price: string }>)[0].price, "price_pro_test");

  // Aucune offre pending pour cet utilisateur -- comportement inchange
  // (Lot 7, point 5) : ni trial_period_days ni discounts.
  assertEquals((params.subscription_data as Record<string, unknown>).trial_period_days, undefined);
  assertEquals(params.discounts, undefined);

  // Aucune modification profiles.plan/credit ici -- seule "subscriptions" a
  // ete interrogee (voir garde dans fakeSupabaseAdmin.from()).
  assertEquals(fromCalls.every((t) => t === "subscriptions"), true);

  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("utilisateur deja abonne (active) -> reservation refusee, 409, aucun appel Stripe", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let stripeWasCalled = false;
  const stripe = fakeStripe({
    onCustomerCreate: () => {
      stripeWasCalled = true;
    },
    onSessionCreate: () => {
      stripeWasCalled = true;
    },
  });
  const result = await createCheckoutSessionForPlan(
    {
      stripe,
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: false, reason: "already_subscribed", stripe_customer_id: "cus_existing" },
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 409);
    assertEquals(result.error.includes("déjà actif"), true);
  }
  assertEquals(stripeWasCalled, false);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("deux tentatives concurrentes : la 2e voit checkout_in_progress -> 409 distinct, aucun appel Stripe", async () => {
  // Represente ce que la 2e des deux requetes concurrentes recevrait
  // reellement de reserve_checkout_slot une fois la 1re serialisee par
  // Postgres (ON CONFLICT ... WHERE, migration 20260809100000) : la
  // reservation de la 1re est encore fraiche (< 5 min), la clause WHERE de
  // la 2e ne matche donc pas -> reason='checkout_in_progress'.
  Deno.env.set("STRIPE_TEAM_PRICE_ID", "price_team_test");
  let stripeWasCalled = false;
  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({
        onCustomerCreate: () => {
          stripeWasCalled = true;
        },
        onSessionCreate: () => {
          stripeWasCalled = true;
        },
      }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: false, reason: "checkout_in_progress", stripe_customer_id: null },
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "team"
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 409);
    assertEquals(result.error.includes("déjà en cours"), true);
    // Message distinct de celui d'un abonnement deja actif -- l'utilisateur
    // n'est pas encore abonne, juste bloque le temps d'une premiere
    // tentative en cours.
    assertEquals(result.error.includes("déjà actif"), false);
  }
  assertEquals(stripeWasCalled, false);
  Deno.env.delete("STRIPE_TEAM_PRICE_ID");
});

Deno.test("statut 'trialing'/'past_due' comptent aussi comme deja abonne (reserve_checkout_slot le gere cote SQL)", async () => {
  // La distinction active/trialing/past_due vit desormais entierement dans
  // la clause WHERE SQL de reserve_checkout_slot -- ce test verifie que le
  // handler respecte fidelement la reponse de la RPC quel que soit le
  // statut Stripe exact a l'origine du refus.
  Deno.env.set("STRIPE_TEAM_PRICE_ID", "price_team_test");
  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({}),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: false, reason: "already_subscribed", stripe_customer_id: "cus_existing" },
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "team"
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 409);
  Deno.env.delete("STRIPE_TEAM_PRICE_ID");
});

Deno.test("retry apres echec : Stripe indisponible apres reservation -> release_checkout_reservation appelee, 500", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  const rpcCalls: { name: string; params: Record<string, unknown> }[] = [];
  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({ sessionThrows: true }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: "cus_existing" },
        rpcCalls,
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 500);

  const releaseCalls = rpcCalls.filter((c) => c.name === "release_checkout_reservation");
  assertEquals(releaseCalls.length, 1);
  assertEquals(releaseCalls[0].params.p_user_id, "user-1");
});

Deno.test("retry apres echec : upsert subscriptions en erreur apres reservation -> release_checkout_reservation appelee", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  const rpcCalls: { name: string; params: Record<string, unknown> }[] = [];
  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({}),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: null },
        upsertError: { message: "db down" },
        rpcCalls,
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 500);
  assertEquals(rpcCalls.some((c) => c.name === "release_checkout_reservation"), true);
});

Deno.test("reserve_checkout_slot en erreur (panne DB) -> 500 generique, aucun appel Stripe", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let stripeWasCalled = false;
  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({
        onCustomerCreate: () => {
          stripeWasCalled = true;
        },
      }),
      supabaseAdmin: fakeSupabaseAdmin({ reserveError: { message: "connection refused" } }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 500);
  assertEquals(stripeWasCalled, false);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("Customer Stripe existant et toujours valide -> reutilise, aucune creation ni upsert", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let customerWasCreated = false;
  let upsertWasCalled = false;

  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({
        retrieveResult: { id: "cus_existing" },
        onCustomerCreate: () => {
          customerWasCreated = true;
        },
      }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: "cus_existing" },
        onUpsert: () => {
          upsertWasCalled = true;
        },
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );

  assertEquals(result.ok, true);
  assertEquals(customerWasCreated, false);
  assertEquals(upsertWasCalled, false);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("Customer Stripe existant mais supprime cote Stripe -> recree", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let customerWasCreated = false;

  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({
        retrieveResult: { id: "cus_existing", deleted: true },
        createdCustomerId: "cus_replacement",
        onCustomerCreate: () => {
          customerWasCreated = true;
        },
      }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: "cus_existing" },
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );

  assertEquals(result.ok, true);
  assertEquals(customerWasCreated, true);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

// Programme Beta ResellOS (Lot 7+8, 2026-08-10).

Deno.test("offre pending existante -> trial_period_days et discounts transmis a Stripe", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let sessionParams: Record<string, unknown> | null = null;

  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({ onSessionCreate: (p) => { sessionParams = p; } }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: "cus_existing" },
        claimOfferResult: { trial_period_days: 30, stripe_coupon_id: "BETA50" },
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );

  assertEquals(result.ok, true);
  assertExists(sessionParams);
  const params = sessionParams as Record<string, unknown>;
  assertEquals((params.subscription_data as Record<string, unknown>).trial_period_days, 30);
  assertEquals(params.discounts, [{ coupon: "BETA50" }]);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("offre pending sans coupon (trial seul) -> pas de discounts, trial_period_days present", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let sessionParams: Record<string, unknown> | null = null;

  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({ onSessionCreate: (p) => { sessionParams = p; } }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: "cus_existing" },
        claimOfferResult: { trial_period_days: 30, stripe_coupon_id: null },
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );

  assertEquals(result.ok, true);
  assertExists(sessionParams);
  const params = sessionParams as Record<string, unknown>;
  assertEquals((params.subscription_data as Record<string, unknown>).trial_period_days, 30);
  assertEquals(params.discounts, undefined);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("Stripe echoue apres claim de l'offre -> release_commercial_offer appelee (retry possible)", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  const rpcCalls: { name: string; params: Record<string, unknown> }[] = [];

  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({ sessionThrows: true }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: "cus_existing" },
        claimOfferResult: { trial_period_days: 30, stripe_coupon_id: "BETA50" },
        rpcCalls,
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );

  assertEquals(result.ok, false);
  const releaseOfferCalls = rpcCalls.filter((c) => c.name === "release_commercial_offer");
  assertEquals(releaseOfferCalls.length, 1);
  assertEquals(releaseOfferCalls[0].params.p_user_id, "user-1");
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("Stripe echoue sans offre reclamee -> release_commercial_offer jamais appelee", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  const rpcCalls: { name: string; params: Record<string, unknown> }[] = [];

  await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({ sessionThrows: true }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: "cus_existing" },
        rpcCalls,
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );

  assertEquals(rpcCalls.some((c) => c.name === "release_commercial_offer"), false);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("claim_commercial_offer en erreur (panne DB) -> checkout poursuit normalement sans offre", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let sessionParams: Record<string, unknown> | null = null;

  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({ onSessionCreate: (p) => { sessionParams = p; } }),
      supabaseAdmin: fakeSupabaseAdmin({
        reserveResult: { reserved: true, reason: "reserved", stripe_customer_id: "cus_existing" },
        claimOfferError: { message: "connection refused" },
      }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );

  // Une offre illisible ne doit jamais bloquer un upgrade payant normal --
  // le Checkout se cree sans trial ni coupon, exactement comme si aucune
  // offre n'existait.
  assertEquals(result.ok, true);
  assertExists(sessionParams);
  const params = sessionParams as Record<string, unknown>;
  assertEquals((params.subscription_data as Record<string, unknown>).trial_period_days, undefined);
  assertEquals(params.discounts, undefined);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});
