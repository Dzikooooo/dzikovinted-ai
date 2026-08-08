import { assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { resolveUserId } from "./userResolution.ts";

function fakeSupabaseAdmin(opts: { row?: { user_id: string } | null; error?: unknown }): SupabaseClient {
  return {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  return { data: opts.row ?? null, error: opts.error ?? null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

Deno.test("resolution primaire via subscriptions.stripe_customer_id", async () => {
  const result = await resolveUserId(
    { supabaseAdmin: fakeSupabaseAdmin({ row: { user_id: "user-from-table" } }) },
    "cus_123",
    "user-from-metadata"
  );
  assertEquals(result, { userId: "user-from-table", source: "subscriptions_table" });
});

Deno.test("fallback sur metadata.user_id si la table ne resout rien", async () => {
  const result = await resolveUserId(
    { supabaseAdmin: fakeSupabaseAdmin({ row: null }) },
    "cus_unknown",
    "user-from-metadata"
  );
  assertEquals(result, { userId: "user-from-metadata", source: "event_metadata" });
});

Deno.test("aucune resolution possible -> null", async () => {
  const result = await resolveUserId(
    { supabaseAdmin: fakeSupabaseAdmin({ row: null }) },
    "cus_unknown",
    null
  );
  assertEquals(result, null);
});

Deno.test("erreur de lecture table -> retombe sur le fallback metadata comme si absent", async () => {
  const result = await resolveUserId(
    { supabaseAdmin: fakeSupabaseAdmin({ row: null, error: new Error("db down") }) },
    "cus_123",
    "user-from-metadata"
  );
  assertEquals(result, { userId: "user-from-metadata", source: "event_metadata" });
});
