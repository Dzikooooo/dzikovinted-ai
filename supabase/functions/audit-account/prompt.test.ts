import { assertStringIncludes } from "jsr:@std/assert";
import { buildAccountAuditPrompt } from "./prompt.ts";
import type { AccountStats } from "./stats.ts";

function makeStats(overrides: Partial<AccountStats> = {}): AccountStats {
  return {
    totalListings: 42,
    activeCount: 30,
    draftCount: 5,
    pendingCount: 2,
    soldCount: 5,
    missingDescriptionCount: 3,
    noPhotoCount: 1,
    singlePhotoCount: 4,
    agingActiveCount: 6,
    needsRepublishCount: 2,
    avgPhotoCount: 3.2,
    topCategory: "Pulls",
    topBrand: "Carhartt",
    score: 78,
    ...overrides,
  };
}

Deno.test("le prompt inclut chaque statistique reelle transmise", () => {
  const prompt = buildAccountAuditPrompt(makeStats());
  assertStringIncludes(prompt, "42");
  assertStringIncludes(prompt, "30");
  assertStringIncludes(prompt, "Pulls");
  assertStringIncludes(prompt, "Carhartt");
  assertStringIncludes(prompt, "78/100");
});

Deno.test("categorie/marque absentes -> mention honnete, jamais une valeur vide silencieuse", () => {
  const prompt = buildAccountAuditPrompt(makeStats({ topCategory: null, topBrand: null }));
  assertStringIncludes(prompt, "aucune");
});

Deno.test("interdit explicitement de mentionner photo de profil/bio (hors perimetre de ce lot)", () => {
  const prompt = buildAccountAuditPrompt(makeStats());
  assertStringIncludes(prompt, "Ne mentionne jamais la photo de profil ni la bio Vinted");
});
