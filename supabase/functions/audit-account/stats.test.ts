import { assertEquals } from "jsr:@std/assert";
import { computeAccountStats, computeIssueKinds, type AccountAuditListingRow } from "./stats.ts";

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
    vinted_sync_status: null,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

Deno.test("aucune annonce -> stats a zero, score 0, jamais une division par zero qui plante", () => {
  const stats = computeAccountStats([], NOW);
  assertEquals(stats.totalListings, 0);
  assertEquals(stats.score, 0);
  assertEquals(stats.flaggedListings, []);
});

Deno.test("computeIssueKinds : une annonce vendue ne remonte jamais aucun defaut", () => {
  assertEquals(computeIssueKinds(makeListing({ status: "vendu", image_urls: [] })), []);
});

Deno.test("computeIssueKinds : detecte chaque defaut independamment", () => {
  assertEquals(computeIssueKinds(makeListing({ image_urls: [] })), ["no_photo"]);
  assertEquals(computeIssueKinds(makeListing({ image_urls: ["a.jpg"] })), ["single_photo"]);
  assertEquals(computeIssueKinds(makeListing({ description: null })), ["missing_description"]);
  assertEquals(computeIssueKinds(makeListing({ category: null })), ["missing_category_or_condition"]);
  assertEquals(computeIssueKinds(makeListing({ vinted_sync_status: "sync_failed" })), ["sync_failed"]);
});

Deno.test("computeIssueKinds : sync_failed ignore hors en_stock", () => {
  assertEquals(computeIssueKinds(makeListing({ status: "draft", vinted_sync_status: "sync_failed" })), []);
});

Deno.test("perfectCount compte les annonces sans aucun defaut, flaggedListings ne liste que les autres", () => {
  const stats = computeAccountStats(
    [makeListing(), makeListing({ image_urls: [] }), makeListing()],
    NOW
  );
  assertEquals(stats.perfectCount, 2);
  assertEquals(stats.flaggedListings.length, 1);
  assertEquals(stats.flaggedListings[0].issueCount, 1);
});

Deno.test("flaggedListings est trie par nombre de defauts decroissant", () => {
  const stats = computeAccountStats(
    [
      makeListing({ title: "Un defaut", image_urls: [] }),
      makeListing({ title: "Trois defauts", image_urls: [], description: null, category: null }),
      makeListing({ title: "Deux defauts", image_urls: [], description: null }),
    ],
    NOW
  );
  assertEquals(stats.flaggedListings.map((f) => f.title), ["Trois defauts", "Deux defauts", "Un defaut"]);
});

Deno.test("agingCount/needsRepublishCount restent des signaux de compte distincts des defauts qualite", () => {
  const oldDate = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const stats = computeAccountStats(
    [
      makeListing({ created_at: oldDate }),
      makeListing({ vinted_item_id: null, vinted_status: null }),
      makeListing(),
    ],
    NOW
  );
  assertEquals(stats.agingCount, 1);
  assertEquals(stats.needsRepublishCount, 1);
  // Ces deux annonces restent "parfaites" au sens qualite/SEO -- aging et
  // republication sont un axe distinct (performance), jamais mele aux
  // defauts structurels comptes dans flaggedListings/perfectCount.
  assertEquals(stats.perfectCount, 3);
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
  const stats = computeAccountStats([makeListing(), makeListing(), makeListing()], NOW);
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
