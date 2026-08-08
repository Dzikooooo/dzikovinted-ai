import { assertEquals, assertExists } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { createCheckoutSessionForPlan, type StripeClientForCheckout } from "./handler.ts";

interface FakeSubscriptionRow {
  stripe_customer_id: string | null;
  status: string | null;
}

// Fake couvrant exactement les deux methodes reellement appelees par
// handler.ts sur "subscriptions" (select/eq/maybeSingle, upsert) --
// `fromCalls` capture chaque table interrogee pour prouver structurellement
// que profiles n'est jamais touche par create-checkout-session (aucune
// modification profiles.plan exigee par le Lot 2).
function fakeSupabaseAdmin(opts: {
  existingRow?: FakeSubscriptionRow | null;
  fetchError?: unknown;
  upsertError?: unknown;
  onUpsert?: (row: Record<string, unknown>) => void;
  fromCalls?: string[];
}): SupabaseClient {
  return {
    from(table: string) {
      opts.fromCalls?.push(table);
      if (table !== "subscriptions") {
        throw new Error(`create-checkout-session ne doit jamais interroger la table ${table}`);
      }
      return {
        select(_columns: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  return { data: opts.existingRow ?? null, error: opts.fetchError ?? null };
                },
              };
            },
          };
        },
        async upsert(row: Record<string, unknown>, _conflict: { onConflict: string }) {
          opts.onUpsert?.(row);
          return { error: opts.upsertError ?? null };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function fakeStripe(opts: {
  retrieveResult?: { deleted?: boolean; id?: string };
  retrieveThrows?: boolean;
  createdCustomerId?: string;
  onCustomerCreate?: (params: { metadata: Record<string, string>; email?: string }) => void;
  sessionUrl?: string | null;
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
          return { url: opts.sessionUrl === undefined ? "https://checkout.stripe.com/fake" : opts.sessionUrl };
        },
      },
    },
  };
}

const NOW = () => new Date("2026-08-08T12:00:00.000Z");

Deno.test("secret Price ID absent -> erreur 500 generique, message ne contient jamais le nom du secret", async () => {
  // STRIPE_PRO_PRICE_ID delibrement non defini dans l'environnement Deno du
  // test -- resolvePriceId() leve, handler.ts doit intercepter et repondre
  // proprement sans jamais renvoyer le nom de la variable manquante.
  const result = await createCheckoutSessionForPlan(
    { stripe: fakeStripe({}), supabaseAdmin: fakeSupabaseAdmin({}), now: NOW },
    "user-1",
    "user@example.invalid",
    "pro"
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 500);
    assertEquals(result.error.includes("STRIPE_PRO_PRICE_ID"), false);
  }
});

Deno.test("abonnement deja actif -> Checkout refuse (409), aucun appel Stripe", async () => {
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
      supabaseAdmin: fakeSupabaseAdmin({ existingRow: { stripe_customer_id: "cus_existing", status: "active" } }),
      now: NOW,
    },
    "user-1",
    "user@example.invalid",
    "pro"
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 409);
  }
  assertEquals(stripeWasCalled, false);
  Deno.env.delete("STRIPE_PRO_PRICE_ID");
});

Deno.test("statut 'trialing' compte aussi comme abonnement actif (refuse)", async () => {
  Deno.env.set("STRIPE_TEAM_PRICE_ID", "price_team_test");
  const result = await createCheckoutSessionForPlan(
    {
      stripe: fakeStripe({}),
      supabaseAdmin: fakeSupabaseAdmin({ existingRow: { stripe_customer_id: "cus_existing", status: "trialing" } }),
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

Deno.test("aucun abonnement existant + aucun Customer -> Customer cree, subscriptions upsert, Checkout cree", async () => {
  Deno.env.set("STRIPE_PRO_PRICE_ID", "price_pro_test");
  let createdCustomerParams: { metadata: Record<string, string>; email?: string } | null = null;
  let upsertedRow: Record<string, unknown> | null = null;
  let sessionParams: Record<string, unknown> | null = null;
  const fromCalls: string[] = [];

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
        existingRow: null,
        onUpsert: (row) => {
          upsertedRow = row;
        },
        fromCalls,
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

  // Aucune modification profiles.plan/credit ici -- seule "subscriptions" a
  // ete interrogee (voir garde dans fakeSupabaseAdmin.from()).
  assertEquals(fromCalls.every((t) => t === "subscriptions"), true);

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
        existingRow: { stripe_customer_id: "cus_existing", status: null },
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
      supabaseAdmin: fakeSupabaseAdmin({ existingRow: { stripe_customer_id: "cus_existing", status: null } }),
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
