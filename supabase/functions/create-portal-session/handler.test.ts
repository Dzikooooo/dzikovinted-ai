import { assertEquals, assertExists } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { createPortalSessionForUser, type StripeClientForPortal } from "./handler.ts";

// "sans JWT -> 401" et "banned -> 403" ne sont pas redupliques ici :
// index.ts appelle authenticateBillingUser() sans aucune modification,
// deja teste exhaustivement dans _shared/billingAuth.test.ts (Lot 2).
// handler.ts (teste ici) ne recoit qu'un userId deja resolu -- reutiliser
// le module partage inclut reutiliser sa couverture de test.

// Fake volontairement minimal : SEUL .select() existe sur "subscriptions"
// -- aucune methode .upsert()/.update() n'est meme definie. Toute tentative
// d'ecriture ferait planter le test avec une erreur "not a function",
// preuve structurelle plus forte qu'une simple assertion sur un tableau vide.
function fakeSupabaseAdminReadOnly(row: { stripe_customer_id: string | null } | null): SupabaseClient {
  return {
    from(table: string) {
      if (table !== "subscriptions") {
        throw new Error(`create-portal-session ne doit jamais interroger la table ${table}`);
      }
      return {
        select(_c: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function fakeStripe(opts: {
  retrieveResult?: { deleted?: boolean; id?: string };
  retrieveThrows?: boolean;
  sessionUrl?: string | null;
  onSessionCreate?: (params: Record<string, unknown>) => void;
}): StripeClientForPortal {
  return {
    customers: {
      async retrieve(id: string) {
        if (opts.retrieveThrows) throw new Error("resource_missing");
        return opts.retrieveResult ?? { id };
      },
    },
    billingPortal: {
      sessions: {
        async create(params) {
          opts.onSessionCreate?.(params);
          return { url: opts.sessionUrl === undefined ? "https://billing.stripe.com/fake" : opts.sessionUrl };
        },
      },
    },
  };
}

Deno.test("aucune ligne subscriptions pour l'utilisateur -> erreur claire, aucun appel Stripe", async () => {
  let stripeCalled = false;
  const result = await createPortalSessionForUser(
    {
      stripe: fakeStripe({
        onSessionCreate: () => {
          stripeCalled = true;
        },
      }),
      supabaseAdmin: fakeSupabaseAdminReadOnly(null),
    },
    "user-1"
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 404);
    assertEquals(result.error, "Aucun abonnement Stripe n'est associé à ce compte.");
  }
  assertEquals(stripeCalled, false);
});

Deno.test("stripe_customer_id NULL en base (customer jamais cree) -> meme erreur claire", async () => {
  const result = await createPortalSessionForUser(
    { stripe: fakeStripe({}), supabaseAdmin: fakeSupabaseAdminReadOnly({ stripe_customer_id: null }) },
    "user-1"
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "Aucun abonnement Stripe n'est associé à ce compte.");
});

Deno.test("Customer existant et valide -> Portal Session creee avec l'URL", async () => {
  let sessionParams: Record<string, unknown> | null = null;
  const result = await createPortalSessionForUser(
    {
      stripe: fakeStripe({
        retrieveResult: { id: "cus_1" },
        onSessionCreate: (p) => {
          sessionParams = p;
        },
      }),
      supabaseAdmin: fakeSupabaseAdminReadOnly({ stripe_customer_id: "cus_1" }),
    },
    "user-1"
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.url, "https://billing.stripe.com/fake");
  assertExists(sessionParams);
  assertEquals((sessionParams as Record<string, unknown>).customer, "cus_1");
});

Deno.test("URL de retour uniquement sur resellosapp.com", async () => {
  let sessionParams: Record<string, unknown> | null = null;
  await createPortalSessionForUser(
    {
      stripe: fakeStripe({
        retrieveResult: { id: "cus_1" },
        onSessionCreate: (p) => {
          sessionParams = p;
        },
      }),
      supabaseAdmin: fakeSupabaseAdminReadOnly({ stripe_customer_id: "cus_1" }),
    },
    "user-1"
  );
  assertExists(sessionParams);
  const returnUrl = (sessionParams as Record<string, unknown>).return_url as string;
  assertEquals(returnUrl.startsWith("https://resellosapp.com/"), true);
});

Deno.test("Customer marque deleted cote Stripe -> erreur claire, aucune recreation, aucun appel Portal", async () => {
  let portalCalled = false;
  const result = await createPortalSessionForUser(
    {
      stripe: fakeStripe({
        retrieveResult: { id: "cus_1", deleted: true },
        onSessionCreate: () => {
          portalCalled = true;
        },
      }),
      supabaseAdmin: fakeSupabaseAdminReadOnly({ stripe_customer_id: "cus_1" }),
    },
    "user-1"
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 404);
    assertEquals(result.error, "Aucun abonnement Stripe n'est associé à ce compte.");
  }
  assertEquals(portalCalled, false);
});

Deno.test("Customer introuvable cote Stripe (retrieve leve) -> erreur claire, aucun appel Portal", async () => {
  let portalCalled = false;
  const result = await createPortalSessionForUser(
    {
      stripe: fakeStripe({
        retrieveThrows: true,
        onSessionCreate: () => {
          portalCalled = true;
        },
      }),
      supabaseAdmin: fakeSupabaseAdminReadOnly({ stripe_customer_id: "cus_1" }),
    },
    "user-1"
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 404);
  assertEquals(portalCalled, false);
});

Deno.test("aucune mutation profiles/subscriptions -- le fake n'expose meme pas de methode d'ecriture", async () => {
  // Si createPortalSessionForUser tentait un jour d'ecrire, ce test
  // planterait avec "upsert is not a function" / "update is not a
  // function" -- structurellement impossible de muter quoi que ce soit ici.
  const result = await createPortalSessionForUser(
    { stripe: fakeStripe({ retrieveResult: { id: "cus_1" } }), supabaseAdmin: fakeSupabaseAdminReadOnly({ stripe_customer_id: "cus_1" }) },
    "user-1"
  );
  assertEquals(result.ok, true);
});
