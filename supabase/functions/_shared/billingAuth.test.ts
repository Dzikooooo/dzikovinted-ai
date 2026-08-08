import { assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { authenticateBillingUser, type AuthenticateBillingUserDeps } from "./billingAuth.ts";

function fakeAnonClient(opts: { user?: { id: string } | null; authError?: unknown }): SupabaseClient {
  return {
    auth: {
      async getUser() {
        return { data: { user: opts.user ?? null }, error: opts.authError ?? null };
      },
    },
  } as unknown as SupabaseClient;
}

function fakeAdminClient(opts: {
  profile?: { banned: boolean; email: string | null } | null;
  profileError?: unknown;
}): SupabaseClient {
  return {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async single() {
                  return { data: opts.profile ?? null, error: opts.profileError ?? null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function requestWithAuth(header?: string): Request {
  const headers = new Headers();
  if (header !== undefined) headers.set("Authorization", header);
  return new Request("https://example.invalid/", { method: "POST", headers });
}

Deno.test("sans en-tete Authorization -> 401, aucun client Supabase cree", async () => {
  const deps: AuthenticateBillingUserDeps = {
    createAnonClient: () => {
      throw new Error("ne doit jamais etre appele sans Authorization");
    },
    createAdminClient: () => {
      throw new Error("ne doit jamais etre appele sans Authorization");
    },
  };
  const result = await authenticateBillingUser(requestWithAuth(), deps);
  assertEquals(result instanceof Response, true);
  if (result instanceof Response) {
    assertEquals(result.status, 401);
  }
});

Deno.test("JWT invalide (getUser renvoie une erreur) -> 401", async () => {
  const deps: AuthenticateBillingUserDeps = {
    createAnonClient: () => fakeAnonClient({ user: null, authError: new Error("invalid token") }),
    createAdminClient: () => fakeAdminClient({}),
  };
  const result = await authenticateBillingUser(requestWithAuth("Bearer bad-token"), deps);
  assertEquals(result instanceof Response, true);
  if (result instanceof Response) {
    assertEquals(result.status, 401);
  }
});

Deno.test("utilisateur banned -> 403 'Compte suspendu'", async () => {
  const deps: AuthenticateBillingUserDeps = {
    createAnonClient: () => fakeAnonClient({ user: { id: "user-1" } }),
    createAdminClient: () => fakeAdminClient({ profile: { banned: true, email: "a@example.invalid" } }),
  };
  const result = await authenticateBillingUser(requestWithAuth("Bearer good-token"), deps);
  assertEquals(result instanceof Response, true);
  if (result instanceof Response) {
    assertEquals(result.status, 403);
    const body = await result.json();
    assertEquals(body.error, "Compte suspendu");
  }
});

Deno.test("utilisateur normal -> contexte authentifie renvoye", async () => {
  const deps: AuthenticateBillingUserDeps = {
    createAnonClient: () => fakeAnonClient({ user: { id: "user-1" } }),
    createAdminClient: () => fakeAdminClient({ profile: { banned: false, email: "a@example.invalid" } }),
  };
  const result = await authenticateBillingUser(requestWithAuth("Bearer good-token"), deps);
  assertEquals(result instanceof Response, false);
  if (!(result instanceof Response)) {
    assertEquals(result.userId, "user-1");
    assertEquals(result.userEmail, "a@example.invalid");
  }
});

Deno.test("profil introuvable -> 500, pas de fuite d'info", async () => {
  const deps: AuthenticateBillingUserDeps = {
    createAnonClient: () => fakeAnonClient({ user: { id: "user-1" } }),
    createAdminClient: () => fakeAdminClient({ profile: null, profileError: new Error("not found") }),
  };
  const result = await authenticateBillingUser(requestWithAuth("Bearer good-token"), deps);
  assertEquals(result instanceof Response, true);
  if (result instanceof Response) {
    assertEquals(result.status, 500);
  }
});
