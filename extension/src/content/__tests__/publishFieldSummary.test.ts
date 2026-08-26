import { describe, expect, it } from "vitest";
import { computeManualFields, PACKAGE_SIZE_LABELS, replaceManualPlaceholder } from "../publishFieldSummary";
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
  // Mission "ROUND PACKAGE SIZE -- implementation production" (2026-08-18) :
  // "Taille du colis" n'est plus dans cette liste (6 champs, pas 7) -- ce
  // champ est desormais gere directement par vinted-publish.ts (voir
  // packageSizeSelection.ts), qui pousse lui-meme une entree confirmed/
  // pending selon le resultat REEL de la selection automatique.
  it("always lists all 6 manual fields, whatever the payload", () => {
    const manual = computeManualFields(makePayload({ brand: null, size: null, color: null, material: null }));
    expect(manual).toHaveLength(6);
    expect(manual.some((f) => f.startsWith("Catégorie"))).toBe(true);
    expect(manual.some((f) => f.startsWith("État"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Marque"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Taille"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Couleur"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Matière"))).toBe(true);
    expect(manual.some((f) => f.startsWith("Taille du colis"))).toBe(false);
  });

  it("reports 'donnée manquante' for genuinely mandatory attributes ResellOS has no value for", () => {
    const manual = computeManualFields(makePayload({ size: null, brand: null, color: null, material: null }));
    expect(manual).toContain("Marque : donnée manquante (à choisir sur Vinted)");
    expect(manual).toContain("Taille : donnée manquante (à choisir sur Vinted)");
    // Catégorie/État restent renseignés dans ce payload -- jamais "manquant" a tort.
    expect(manual).toContain("Catégorie : Pulls (à sélectionner sur Vinted)");
    expect(manual).toContain("État : Très bon état (à sélectionner sur Vinted)");
  });

  // Mission "AUDIT DIVERGENCE READY_TO_SUBMIT" (2026-08-16) : Couleur/Matière
  // sont optionnels sur Vinted (voir publishSelectors.ts) -- jamais rapportes
  // comme "donnée manquante" (qui se lit comme un blocage) quand ResellOS n'a
  // simplement pas de valeur a proposer.
  it("reports Couleur/Matière as facultatif (never 'donnée manquante') when ResellOS has no value -- both are optional on Vinted", () => {
    const manual = computeManualFields(makePayload({ color: null, material: null }));
    expect(manual).toContain("Couleur : facultatif sur Vinted, non renseigné par ResellOS (aucune action requise)");
    expect(manual).toContain("Matière : facultatif sur Vinted, non renseigné par ResellOS (aucune action requise)");
    expect(manual.some((f) => f.startsWith("Couleur : donnée manquante"))).toBe(false);
    expect(manual.some((f) => f.startsWith("Matière : donnée manquante"))).toBe(false);
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

  // Mission "ROUND PACKAGE SIZE -- implementation production" (2026-08-18) :
  // PACKAGE_SIZE_LABELS reste exporte (utilise par vinted-publish.ts pour les
  // messages confirmed/pending) meme si "Taille du colis" n'est plus dans la
  // liste computeManualFields() ci-dessus.
  it("exposes PACKAGE_SIZE_LABELS mapping small/medium/large to their French display names", () => {
    expect(PACKAGE_SIZE_LABELS.small).toBe("Petit");
    expect(PACKAGE_SIZE_LABELS.medium).toBe("Moyen");
    expect(PACKAGE_SIZE_LABELS.large).toBe("Grand");
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
