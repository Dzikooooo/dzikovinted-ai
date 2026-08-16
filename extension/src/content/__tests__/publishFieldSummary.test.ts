import { describe, expect, it } from "vitest";
import { computeManualFields, replaceManualPlaceholder } from "../publishFieldSummary";
import type { PublishListingPayload } from "../../lib/messages";

function makePayload(overrides: Partial<PublishListingPayload> = {}): PublishListingPayload {
  return {
    title: "Pull Zara",
    description: "Très bon état",
    price: 15,
    category: "Pulls",
    brand: "Zara",
    size: "M",
    condition: "Très bon état",
    color: "Noir",
    material: "Coton",
    imageUrls: ["https://example.com/1.jpg"],
    packageSize: "medium",
    expectedVintedUsername: "testuser",
    ...overrides,
  };
}

// Mission "REPUBLICATION FIDELE" (2026-08-11), item G ("liste DYNAMIQUE" --
// "DONNÉE MANQUANTE" vs valeur connue "À CONFIRMER") : computeManualFields()
// n'omet plus silencieusement un champ absent -- il liste desormais TOUJOURS
// les 7 champs manuels, chacun portant soit la valeur reelle connue de
// ResellOS (ex. "Marque : Ralph Lauren"), soit un statut explicite "donnée
// manquante" quand ResellOS n'a rien a proposer. Permet a l'utilisateur de
// savoir EXACTEMENT quoi selectionner sur Vinted, au lieu d'un simple nom de
// champ sans contexte (voir PublishProgressModal.tsx, qui affiche ces
// chaines telles quelles).
describe("computeManualFields", () => {
  it("always lists all 7 manual fields, whatever the payload", () => {
    const manual = computeManualFields(makePayload({ brand: null, size: null, color: null, material: null }));
    expect(manual).toHaveLength(7);
    expect(manual.some((f) => f.startsWith("Catégorie"))).toBe(true);
    expect(manual.some((f) => f.startsWith("État"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Marque"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Taille"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Couleur"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Matière"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Taille du colis"))).toBe(true);
  });

  it("reports 'donnée manquante' for every attribute ResellOS genuinely has no value for", () => {
    const manual = computeManualFields(makePayload({ size: null, brand: null, color: null, material: null }));
    expect(manual).toContain("Marque : donnée manquante (à choisir sur Vinted)");
    expect(manual).toContain("Taille : donnée manquante (à choisir sur Vinted)");
    expect(manual).toContain("Couleur : donnée manquante (à choisir sur Vinted)");
    expect(manual).toContain("Matière : donnée manquante (à choisir sur Vinted)");
    // Catégorie/État restent renseignés dans ce payload -- jamais "manquant" a tort.
    expect(manual).toContain("Catégorie : Pulls (à sélectionner sur Vinted)");
    expect(manual).toContain("État : Très bon état (à sélectionner sur Vinted)");
  });

  it("surfaces the real known value for every attribute ResellOS actually has -- 'Catégorie à sélectionner : Hommes Polos'", () => {
    const manual = computeManualFields(makePayload({ category: "Hommes Polos", brand: "Ralph Lauren" }));
    expect(manual).toContain("Catégorie : Hommes Polos (à sélectionner sur Vinted)");
    expect(manual).toContain("Marque : Ralph Lauren (à sélectionner sur Vinted)");
  });

  it("lists every optional attribute with its real value on a fully-filled listing", () => {
    const manual = computeManualFields(makePayload());
    expect(manual).toEqual([
      "Catégorie : Pulls (à sélectionner sur Vinted)",
      "État : Très bon état (à sélectionner sur Vinted)",
      "Marque : Zara (à sélectionner sur Vinted)",
      "Taille : M (à sélectionner sur Vinted)",
      "Couleur : Noir (à sélectionner sur Vinted)",
      "Matière : Coton (à sélectionner sur Vinted)",
      "Taille du colis : Moyen (à sélectionner sur Vinted)",
    ]);
  });

  // BUG LIVE N°2, 3e volet (2026-08-11) : category/condition n'etant plus
  // garantis non-vides en amont (checks.ts::checkListingHasRequiredVintedFields
  // retire), le payload reel peut desormais porter category:"" / condition:""
  // (voir ListingsManagementSection.tsx::buildPublishPayload, "?? ''").
  // computeManualFields() ne doit jamais planter ni omettre ces deux champs
  // dans ce cas -- ils doivent apparaitre comme "donnée manquante", jamais
  // silencieusement disparaitre.
  it("reports Catégorie/État as 'donnée manquante' (never omitted, never a crash) when the listing has empty-string category/condition", () => {
    const manual = computeManualFields(makePayload({ category: "", condition: "" }));
    expect(manual).toContain("Catégorie : donnée manquante (à choisir sur Vinted)");
    expect(manual).toContain("État : donnée manquante (à choisir sur Vinted)");
  });

  it("labels package size with its real French name (small/medium/large)", () => {
    expect(computeManualFields(makePayload({ packageSize: "small" }))).toContain("Taille du colis : Petit (à sélectionner sur Vinted)");
    expect(computeManualFields(makePayload({ packageSize: "large" }))).toContain("Taille du colis : Grand (à sélectionner sur Vinted)");
  });
});

// Mission "FINIR LES CHAMPS MANQUANTS" (2026-08-11) : replaceManualPlaceholder()
// est la seule mutation de `pending` que la reprise post-categorie
// (vinted-publish.ts::watchForCategorySelectionAndPrefillAttributes) effectue
// -- ces tests couvrent directement les exigences explicites de la mission
// ("no double-fill", auto-selection unique -> retrait du placeholder,
// aucune correspondance/valeur -> reste manuel avec message explicite).
describe("replaceManualPlaceholder", () => {
  it("removes the placeholder and pushes nothing when a field is confirmed (replacement: null) -- never left dangling as 'manual' once auto-selected", () => {
    const pending = ["Marque : Ralph Lauren (à sélectionner sur Vinted)", "Taille : M (à sélectionner sur Vinted)"];
    replaceManualPlaceholder(pending, "Marque", null);
    expect(pending).toEqual(["Taille : M (à sélectionner sur Vinted)"]);
  });

  it("replaces the placeholder with an explicit 'no reliable match' message when matching is ambiguous or absent -- stays MANUAL_REQUIRED, never silently dropped", () => {
    const pending = ["Matière : Coton (à sélectionner sur Vinted)"];
    replaceManualPlaceholder(pending, "Matière", "Matière : Coton (aucune correspondance fiable sur Vinted -- à choisir toi-même)");
    expect(pending).toEqual(["Matière : Coton (aucune correspondance fiable sur Vinted -- à choisir toi-même)"]);
  });

  it("never produces a double entry for the same field -- replaces in place rather than appending", () => {
    const pending = ["Couleur : Noir (à sélectionner sur Vinted)"];
    replaceManualPlaceholder(pending, "Couleur", null);
    replaceManualPlaceholder(pending, "Couleur", "Couleur : Noir (aucune correspondance fiable sur Vinted -- à choisir toi-même)");
    expect(pending).toEqual(["Couleur : Noir (aucune correspondance fiable sur Vinted -- à choisir toi-même)"]);
    expect(pending.filter((p) => p.startsWith("Couleur :"))).toHaveLength(1);
  });

  it("only touches the matching label's placeholder, leaving unrelated pending entries (incl. 'Taille du colis', a distinct field) untouched", () => {
    const pending = [
      "Taille : M (à sélectionner sur Vinted)",
      "Taille du colis : Moyen (à sélectionner sur Vinted)",
      "Marque : Zara (à sélectionner sur Vinted)",
    ];
    replaceManualPlaceholder(pending, "Taille", null);
    expect(pending).toEqual(["Taille du colis : Moyen (à sélectionner sur Vinted)", "Marque : Zara (à sélectionner sur Vinted)"]);
  });

  it("is a no-op push when there was no existing placeholder to remove and replacement is null", () => {
    const pending = ["Marque : Zara (à sélectionner sur Vinted)"];
    replaceManualPlaceholder(pending, "État", null);
    expect(pending).toEqual(["Marque : Zara (à sélectionner sur Vinted)"]);
  });
});
