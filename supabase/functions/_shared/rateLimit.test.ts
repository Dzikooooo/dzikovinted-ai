import { assertEquals } from "jsr:@std/assert";
import { RATE_LIMIT_SCOPES, rateLimitMessage, tryConsumeRateLimit } from "./rateLimit.ts";

function fakeAdmin(response: { data: unknown; error: { message?: string } | null }) {
  return {
    calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    rpc(fn: string, args: Record<string, unknown>) {
      this.calls.push({ fn, args });
      return Promise.resolve(response);
    },
  };
}

Deno.test("tryConsumeRateLimit -- data true -> autorise", async () => {
  const admin = fakeAdmin({ data: true, error: null });
  const allowed = await tryConsumeRateLimit(admin, "u1", RATE_LIMIT_SCOPES.scanMarket);
  assertEquals(allowed, true);
  assertEquals(admin.calls, [
    { fn: "try_consume_rate_limit", args: { p_user_id: "u1", p_scope: "scan-market", p_cooldown_seconds: 300 } },
  ]);
});

Deno.test("tryConsumeRateLimit -- data null (encore en cooldown) -> refuse", async () => {
  const admin = fakeAdmin({ data: null, error: null });
  const allowed = await tryConsumeRateLimit(admin, "u1", RATE_LIMIT_SCOPES.dzikoAssistant);
  assertEquals(allowed, false);
});

Deno.test("tryConsumeRateLimit -- data false -> refuse", async () => {
  const admin = fakeAdmin({ data: false, error: null });
  const allowed = await tryConsumeRateLimit(admin, "u1", RATE_LIMIT_SCOPES.dzikoAssistant);
  assertEquals(allowed, false);
});

Deno.test("tryConsumeRateLimit -- erreur RPC -> refuse par prudence (ne bloque jamais silencieusement)", async () => {
  const admin = fakeAdmin({ data: null, error: { message: "boom" } });
  const allowed = await tryConsumeRateLimit(admin, "u1", RATE_LIMIT_SCOPES.scanMarket);
  assertEquals(allowed, false);
});

Deno.test("rateLimitMessage -- un message dedie par scope connu", () => {
  assertEquals(rateLimitMessage(RATE_LIMIT_SCOPES.scanMarket.scope).includes("scan"), true);
  assertEquals(rateLimitMessage(RATE_LIMIT_SCOPES.dzikoAssistant.scope).includes("vite"), true);
});

Deno.test("rateLimitMessage -- repli generique pour un scope inconnu", () => {
  assertEquals(rateLimitMessage("un-scope-jamais-defini"), "Merci de patienter avant de réessayer.");
});
