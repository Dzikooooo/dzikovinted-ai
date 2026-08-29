import { assertEquals } from "jsr:@std/assert";
import { computeAccountStats, type AccountAuditListingRow } from "./stats.ts";

const NOW = new Date("2026-08-30T12:00:00Z");

function makeListing(overrides: Partial<AccountAuditListingRow> = {}): AccountAuditListingRow {
  return {
    id: crypto.randomUUID(),
    title: "Pull Carhartt",
    description: "Un pull en tres bon etat, jamais porte, taille M.",
    category: "Pulls",
    brand: "Carhartt",
    condition: "Très bon état",
    price: 30,
    image_urls: ["a.jpg", "b.jpg"],
    vinted_item_id: "123",
    vinted_status: "online",
    status: "en_stock",
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

Deno.test("aucune annonce -> stats a zero, score 0, jamais une division par zero qui plante", () => {
  const stats = computeAccountStats([], NOW);
  assertEquals(stats.totalListings, 0);
  assertEquals(stats.score, 0);
  assertEquals(stats.topCategory, null);
  assertEquals(stats.topBrand, null);
});

Deno.test("compte chaque statut ResellOS separement", () => {
  const stats = computeAccountStats(
    [
      makeListing({ status: "en_stock" }),
      makeListing({ status: "draft" }),
      makeListing({ status: "en_attente" }),
      makeListing({ status: "vendu" }),
    ],
    NOW
  );
  assertEquals(stats.activeCount, 1);
  assertEquals(stats.draftCount, 1);
  assertEquals(stats.pendingCount, 1);
  assertEquals(stats.soldCount, 1);
  assertEquals(stats.totalListings, 4);
});

Deno.test("detecte une description trop courte ou absente", () => {
  const stats = computeAccountStats(
    [
      makeListing({ description: "ok" }),
      makeListing({ description: null }),
      makeListing({ description: "Une description bien assez longue pour compter." }),
    ],
    NOW
  );
  assertEquals(stats.missingDescriptionCount, 2);
});

Deno.test("distingue 0 photo (bloquant) et exactement 1 photo (a ameliorer)", () => {
  const stats = computeAccountStats(
    [
      makeListing({ image_urls: [] }),
      makeListing({ image_urls: null }),
      makeListing({ image_urls: ["a.jpg"] }),
      makeListing({ image_urls: ["a.jpg", "b.jpg", "c.jpg"] }),
    ],
    NOW
  );
  assertEquals(stats.noPhotoCount, 2);
  assertEquals(stats.singlePhotoCount, 1);
  assertEquals(stats.avgPhotoCount, 1); // (0+0+1+3)/4 = 1
});

Deno.test("agingActiveCount ne compte que le stock actif (en_stock) au-dela du seuil, jamais draft/en_attente/vendu", () => {
  const oldDate = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const stats = computeAccountStats(
    [
      makeListing({ status: "en_stock", created_at: oldDate }),
      makeListing({ status: "draft", created_at: oldDate }),
      makeListing({ status: "en_attente", created_at: oldDate }),
      makeListing({ status: "en_stock", created_at: NOW.toISOString() }),
    ],
    NOW
  );
  assertEquals(stats.agingActiveCount, 1);
});

Deno.test("needsRepublishCount : en_stock sans vinted_item_id, ou vinted_status hidden/deleted/draft/unknown", () => {
  const stats = computeAccountStats(
    [
      makeListing({ status: "en_stock", vinted_item_id: null, vinted_status: null }),
      makeListing({ status: "en_stock", vinted_item_id: "1", vinted_status: "hidden" }),
      makeListing({ status: "en_stock", vinted_item_id: "2", vinted_status: "online" }),
      makeListing({ status: "draft", vinted_item_id: null, vinted_status: null }),
    ],
    NOW
  );
  assertEquals(stats.needsRepublishCount, 2);
});

Deno.test("topCategory/topBrand renvoient la valeur la plus frequente, jamais une valeur vide", () => {
  const stats = computeAccountStats(
    [
      makeListing({ category: "Pulls", brand: "Carhartt" }),
      makeListing({ category: "Pulls", brand: "Nike" }),
      makeListing({ category: "Pantalons", brand: null }),
    ],
    NOW
  );
  assertEquals(stats.topCategory, "Pulls");
  assertEquals(stats.topBrand, "Carhartt");
});

Deno.test("un compte impeccable obtient un score proche de 100", () => {
  const stats = computeAccountStats(
    [makeListing(), makeListing(), makeListing()],
    NOW
  );
  assertEquals(stats.score >= 95, true);
});

Deno.test("un compte avec beaucoup de problemes obtient un score nettement plus bas", () => {
  const oldDate = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const stats = computeAccountStats(
    [
      makeListing({ image_urls: [], description: null, vinted_item_id: null, vinted_status: null, created_at: oldDate }),
      makeListing({ image_urls: [], description: null, vinted_item_id: null, vinted_status: null, created_at: oldDate }),
    ],
    NOW
  );
  assertEquals(stats.score < 50, true);
});
