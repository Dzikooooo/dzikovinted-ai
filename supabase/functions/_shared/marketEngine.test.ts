import { assertEquals, assertExists } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { buildMarketContext, classifyFreshness } from "./marketEngine.ts";

interface FakeResponse {
  data: { price: number; scanned_at: string }[] | null;
  error: unknown;
}

// Chainable minimal qui se resout lui-meme (thenable) -- couvre exactement
// les methodes appelees par marketEngine.ts::queryObservations (select/
// ilike/gte/order/limit), rien de plus.
interface FakeQueryBuilder {
  select(): FakeQueryBuilder;
  ilike(): FakeQueryBuilder;
  gte(): FakeQueryBuilder;
  order(): FakeQueryBuilder;
  limit(): FakeQueryBuilder;
  then(resolve: (v: FakeResponse) => void): void;
}

// Fake Supabase minimal : chaque .from() consomme la reponse suivante dans
// la liste fournie (findComparables() appelle .from() une fois pour le tier
// "strong", puis une 2e fois pour "broad" UNIQUEMENT si "strong" n'a pas
// assez de lignes -- l'ordre des reponses reflete cet ordre d'appel reel).
function fakeSupabase(responses: FakeResponse[]): SupabaseClient {
  let call = 0;
  return {
    from(_table: string): FakeQueryBuilder {
      const resp = responses[Math.min(call, responses.length - 1)];
      call++;
      const builder: FakeQueryBuilder = {
        select: () => builder,
        ilike: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve) => resolve(resp),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function rowsAt(prices: number[], scannedAt: string) {
  return prices.map((price) => ({ price, scanned_at: scannedAt }));
}

const NOW = new Date("2026-08-10T12:00:00.000Z");
const RECENT = "2026-08-10T11:00:00.000Z"; // 1h avant NOW

Deno.test("beaucoup de comparables pertinents, frais, peu disperses -> tier strong, confiance elevee", async () => {
  const prices = [24, 25, 24, 26, 25, 24, 25, 26, 24, 25, 24, 26, 25, 24]; // 14 valeurs, dispersion faible
  const supabase = fakeSupabase([{ data: rowsAt(prices, RECENT), error: null }]);
  const ctx = await buildMarketContext(supabase, { brand: "Nike", category: "Sneakers" }, NOW);

  assertEquals(ctx.tier, "strong");
  assertEquals(ctx.comparablesCount, 14);
  assertExists(ctx.pricing);
  assertEquals(ctx.confidence.level, "elevee");
  assertEquals(ctx.confidence.score, 70);
  assertEquals(ctx.freshness, "recent");
});

Deno.test("peu de comparables au tier strong -> tier none si sous le seuil minimum et pas de fallback exploitable", async () => {
  const supabase = fakeSupabase([
    { data: rowsAt([20, 22], RECENT), error: null }, // strong: 2 lignes, sous MIN_COMPARABLES_FOR_MARKET_PRICE=3
    { data: [], error: null }, // broad: aucune ligne
  ]);
  const ctx = await buildMarketContext(supabase, { brand: "Nike", category: "Sneakers" }, NOW);

  assertEquals(ctx.tier, "none");
  assertEquals(ctx.pricing, null);
  assertEquals(ctx.confidence.level, "ia_uniquement");
  assertEquals(ctx.confidence.score, 0);
});

Deno.test("aucun comparable du tout -> tier none, aucune requete broad inutile si categorie sans mot exploitable", async () => {
  const supabase = fakeSupabase([{ data: [], error: null }]);
  const ctx = await buildMarketContext(supabase, { brand: "Nike", category: "?!" }, NOW);

  assertEquals(ctx.tier, "none");
  assertEquals(ctx.comparablesCount, 0);
});

Deno.test("categorie assouplie (tier broad) quand le tier strong est insuffisant mais le tier large suffit", async () => {
  const supabase = fakeSupabase([
    { data: rowsAt([30], RECENT), error: null }, // strong: 1 ligne seulement
    { data: rowsAt([28, 30, 32, 31], RECENT), error: null }, // broad: 4 lignes
  ]);
  const ctx = await buildMarketContext(supabase, { brand: "Ralph Lauren", category: "Polo Homme" }, NOW);

  assertEquals(ctx.tier, "broad");
  assertEquals(ctx.comparablesCount, 4);
  assertExists(ctx.pricing);
  // Penalite tier "broad" appliquee (voir marketEngine.ts::computeConfidence).
  assertEquals(ctx.confidence.reasons.includes("Categorie rapprochee, pas une correspondance exacte"), true);
});

Deno.test("comparables avec forte dispersion -> confiance penalisee, pricing quand meme calcule", async () => {
  const prices = [10, 80, 15, 90, 20, 85]; // tres disperse
  const supabase = fakeSupabase([{ data: rowsAt(prices, RECENT), error: null }]);
  const ctx = await buildMarketContext(supabase, { brand: "Nike", category: "Sneakers" }, NOW);

  assertEquals(ctx.tier, "strong");
  assertExists(ctx.pricing);
  assertEquals(ctx.confidence.reasons.some((r) => r.includes("disperses")), true);
});

Deno.test("donnees anciennes (mais dans la fenetre de 60 jours) -> fraicheur stale, confiance penalisee", async () => {
  const oldDate = "2026-07-05T12:00:00.000Z"; // 36 jours avant NOW -> au-dela du seuil "old" (30j)
  const prices = [24, 25, 24, 26, 25, 24, 25, 26, 24, 25, 24, 26, 25, 24];
  const supabase = fakeSupabase([{ data: rowsAt(prices, oldDate), error: null }]);
  const ctx = await buildMarketContext(supabase, { brand: "Nike", category: "Sneakers" }, NOW);

  assertEquals(ctx.freshness, "stale");
  assertEquals(ctx.confidence.reasons.includes("Donnees de marche anciennes"), true);
  // Le score de confiance (70 sans penalite) doit refleter la penalite de fraicheur.
  assertEquals(ctx.confidence.score, 55);
});

Deno.test("brand ou category vide -> tier none immediat, aucune requete Supabase", async () => {
  let fromCalled = false;
  const supabase = {
    from() {
      fromCalled = true;
      return {};
    },
  } as unknown as SupabaseClient;

  const ctx = await buildMarketContext(supabase, { brand: "", category: "Sneakers" }, NOW);
  assertEquals(ctx.tier, "none");
  assertEquals(fromCalled, false);
});

Deno.test("erreur Supabase sur la requete -> degrade en tier none plutot que de lever une exception", async () => {
  const supabase = fakeSupabase([
    { data: null, error: { message: "connection refused" } },
    { data: null, error: { message: "connection refused" } },
  ]);
  const ctx = await buildMarketContext(supabase, { brand: "Nike", category: "Sneakers" }, NOW);
  assertEquals(ctx.tier, "none");
  assertEquals(ctx.confidence.level, "ia_uniquement");
});

Deno.test("classifyFreshness : fenetres recent/acceptable/old/stale", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  assertEquals(classifyFreshness(new Date("2026-08-10T11:00:00.000Z"), now), "recent"); // -1h
  assertEquals(classifyFreshness(new Date("2026-08-08T12:00:00.000Z"), now), "acceptable"); // -2j
  assertEquals(classifyFreshness(new Date("2026-07-25T12:00:00.000Z"), now), "old"); // -16j
  assertEquals(classifyFreshness(new Date("2026-07-01T12:00:00.000Z"), now), "stale"); // -40j
});
