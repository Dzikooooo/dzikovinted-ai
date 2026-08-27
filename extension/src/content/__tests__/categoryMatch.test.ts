import { describe, expect, it } from "vitest";
import { deriveCategorySearchTerm, describeCategoryMatchAttempt, matchCategoryResult } from "../categoryMatch";
import type { CategoryResultCandidate } from "../categoryMatch";

describe("deriveCategorySearchTerm", () => {
  it("strips a known gender prefix and returns the remainder as the search term", () => {
    expect(deriveCategorySearchTerm("Hommes Polos")).toEqual({ searchTerm: "Polos", genderHint: "Hommes" });
  });

  it("strips 'Femmes' and 'Enfants' the same way", () => {
    expect(deriveCategorySearchTerm("Femmes Robes")).toEqual({ searchTerm: "Robes", genderHint: "Femmes" });
    expect(deriveCategorySearchTerm("Enfants Baskets")).toEqual({ searchTerm: "Baskets", genderHint: "Enfants" });
  });

  it("is case/accent-insensitive on the prefix itself, returning the canonical prefix casing", () => {
    expect(deriveCategorySearchTerm("hommes Polos")).toEqual({ searchTerm: "Polos", genderHint: "Hommes" });
  });

  it("returns the whole string as the search term when there is no known gender prefix", () => {
    expect(deriveCategorySearchTerm("Baskets")).toEqual({ searchTerm: "Baskets", genderHint: null });
  });

  it("does not strip a gender word that is not the FIRST word", () => {
    expect(deriveCategorySearchTerm("Chaussures Hommes")).toEqual({ searchTerm: "Chaussures Hommes", genderHint: null });
  });

  it("keeps a multi-word category term intact after stripping the prefix", () => {
    expect(deriveCategorySearchTerm("Hommes Hauts et t-shirts")).toEqual({
      searchTerm: "Hauts et t-shirts",
      genderHint: "Hommes",
    });
  });

  it("falls back to the full string (never an empty search term) when the gender word is alone with nothing after it", () => {
    expect(deriveCategorySearchTerm("Hommes")).toEqual({ searchTerm: "Hommes", genderHint: null });
  });

  it("returns an empty search term for an empty/whitespace-only category", () => {
    expect(deriveCategorySearchTerm("")).toEqual({ searchTerm: "", genderHint: null });
    expect(deriveCategorySearchTerm("   ")).toEqual({ searchTerm: "", genderHint: null });
  });
});

describe("matchCategoryResult", () => {
  it("resolves a unique title match", () => {
    const candidates: CategoryResultCandidate[] = [{ title: "Baskets", breadcrumb: "Hommes > Chaussures > Baskets" }];
    expect(matchCategoryResult(candidates, "Hommes Baskets")).toBe(0);
  });

  // Preuve live directe (2026-08-16) : "Polos" existe sous 3 branches
  // distinctes (Enfants x2, Hommes x1) -- meme titre, breadcrumbs differents.
  it("real live scenario -- picks the Hommes-breadcrumb 'Polos' and NOT the Enfants ones, using the gender hint from the payload", () => {
    const candidates: CategoryResultCandidate[] = [
      { title: "Polos", breadcrumb: "Enfants > Garçons (2-8 ans) > Vêtements > Polos" },
      { title: "Polos", breadcrumb: "Hommes > Vêtements > Hauts et t-shirts > Polos" },
      { title: "Polos", breadcrumb: "Enfants > Filles (2-8 ans) > Vêtements > Polos" },
    ];
    expect(matchCategoryResult(candidates, "Hommes Polos")).toBe(1);
  });

  it("multiple same-title results with different breadcrumbs, no gender hint in the category string -- stays ambiguous (null)", () => {
    const candidates: CategoryResultCandidate[] = [
      { title: "Polos", breadcrumb: "Enfants > Garçons (2-8 ans) > Vêtements > Polos" },
      { title: "Polos", breadcrumb: "Hommes > Vêtements > Hauts et t-shirts > Polos" },
    ];
    expect(matchCategoryResult(candidates, "Polos")).toBeNull();
  });

  it("ambiguous when the gender hint matches MULTIPLE breadcrumbs (e.g. two Enfants branches) -- never picks the first one", () => {
    const candidates: CategoryResultCandidate[] = [
      { title: "Polos", breadcrumb: "Enfants > Garçons (2-8 ans) > Vêtements > Polos" },
      { title: "Polos", breadcrumb: "Enfants > Filles (2-8 ans) > Vêtements > Polos" },
    ];
    expect(matchCategoryResult(candidates, "Enfants Polos")).toBeNull();
  });

  it("returns null when zero candidates are provided", () => {
    expect(matchCategoryResult([], "Hommes Polos")).toBeNull();
  });

  it("returns null when no candidate title matches the derived search term at all", () => {
    const candidates: CategoryResultCandidate[] = [{ title: "Baskets", breadcrumb: "Hommes > Chaussures > Baskets" }];
    expect(matchCategoryResult(candidates, "Hommes Polos")).toBeNull();
  });

  it("returns null for an empty category string", () => {
    const candidates: CategoryResultCandidate[] = [{ title: "Polos", breadcrumb: "Hommes > Vêtements > Polos" }];
    expect(matchCategoryResult(candidates, "")).toBeNull();
  });

  it("matches case/accent-insensitively on both title and breadcrumb", () => {
    const candidates: CategoryResultCandidate[] = [{ title: "polos", breadcrumb: "hommes > vetements > polos" }];
    expect(matchCategoryResult(candidates, "Hommes Polos")).toBe(0);
  });

  it("never picks by position -- the matching candidate can be anywhere in the array", () => {
    const candidates: CategoryResultCandidate[] = [
      { title: "Robes", breadcrumb: "Femmes > Vêtements > Robes" },
      { title: "Baskets", breadcrumb: "Hommes > Chaussures > Baskets" },
      { title: "Polos", breadcrumb: "Hommes > Vêtements > Hauts et t-shirts > Polos" },
    ];
    expect(matchCategoryResult(candidates, "Hommes Polos")).toBe(2);
  });
});

describe("describeCategoryMatchAttempt", () => {
  it("reports 'no_candidate_title_matches_search_term' when nothing matches", () => {
    const candidates: CategoryResultCandidate[] = [{ title: "Baskets", breadcrumb: "Hommes > Chaussures > Baskets" }];
    const diag = describeCategoryMatchAttempt(candidates, "Hommes Polos");
    expect(diag.reason).toBe("no_candidate_title_matches_search_term");
    expect(diag.searchTerm).toBe("Polos");
    expect(diag.genderHint).toBe("Hommes");
  });

  it("reports 'multiple_title_matches_no_context_token' when nothing beyond the leaf name is stored", () => {
    const candidates: CategoryResultCandidate[] = [
      { title: "Polos", breadcrumb: "Enfants > Garçons > Polos" },
      { title: "Polos", breadcrumb: "Hommes > Polos" },
    ];
    const diag = describeCategoryMatchAttempt(candidates, "Polos");
    expect(diag.reason).toBe("multiple_title_matches_no_context_token");
    expect(diag.titleMatchCount).toBe(2);
  });

  it("reports 'multiple_title_matches_context_matches_no_breadcrumb' when no breadcrumb echoes the stored context", () => {
    const candidates: CategoryResultCandidate[] = [
      { title: "Polos", breadcrumb: "Enfants > Garçons > Polos" },
      { title: "Polos", breadcrumb: "Femmes > Polos" },
    ];
    const diag = describeCategoryMatchAttempt(candidates, "Hommes Polos");
    expect(diag.reason).toBe("multiple_title_matches_context_matches_no_breadcrumb");
  });
});

// ---------------------------------------------------------------------------
// ECHEC LIVE du 2026-08-26 -- republication reelle bloquee sur la categorie
// ---------------------------------------------------------------------------
// Constate en direct : pour "Polos", Vinted renvoie TROIS Cells au titre
// identique, distinguees uniquement par leur chemin. Aucune n'etait cliquee.
const POLOS_LIVE: CategoryResultCandidate[] = [
  { title: "Polos", breadcrumb: "Enfants > Garçons" },
  { title: "Polos", breadcrumb: "Hommes > Vêtements" },
  { title: "Polos", breadcrumb: "Enfants > Filles" },
];

describe("cas live : trois 'Polos' homonymes", () => {
  it("choisit la branche Hommes a partir du contexte stocke", () => {
    expect(matchCategoryResult(POLOS_LIVE, "Hommes Polos")).toBe(1);
  });

  it("choisit aussi quand le contexte est un chemin complet", () => {
    // Format que l'ancienne version ne savait pas lire du tout : elle tapait
    // "> Vetements > Polos" dans la recherche.
    expect(matchCategoryResult(POLOS_LIVE, "Hommes > Vêtements > Polos")).toBe(1);
  });

  // ------------------------------------------------------------------
  // LIMITE CONNUE, documentee plutot que masquee.
  // ------------------------------------------------------------------
  // Le terme tape dans la recherche Vinted doit etre le nom EXACT de la
  // feuille, et il est derive de la chaine stockee avant d'avoir vu le
  // moindre candidat. deriveCategorySearchTerm() ne sait le faire que pour
  // les deux formats reellement observes : "{Genre} {Feuille}" et "{Feuille}"
  // seule (plus les chemins a separateurs, ajoutes ce jour).
  //
  // Generaliser demanderait de deviner ou s'arrete le contexte et ou commence
  // la feuille -- or une feuille peut compter plusieurs mots ("Hauts et
  // t-shirts"). Prendre "le dernier mot" casserait ces categories-la. On
  // prefere echouer proprement en MANUAL_REQUIRED plutot que taper un terme
  // de recherche faux et selectionner une categorie voisine.
  it("ne sait PAS lire un genre place apres la feuille (limite assumee)", () => {
    expect(matchCategoryResult(POLOS_LIVE, "Polos Hommes")).toBeNull();
  });

  it("ne sait PAS lire un contexte de plusieurs mots sans separateur (limite assumee)", () => {
    // "Enfants Filles Polos" -> le prefixe de genre est retire, il reste
    // "Filles Polos" comme terme de recherche, qui ne correspond a aucun
    // titre. Avec des separateurs ("Enfants > Filles > Polos"), ca marche --
    // voir le test suivant.
    expect(matchCategoryResult(POLOS_LIVE, "Enfants Filles Polos")).toBeNull();
  });

  it("mais y arrive des que le chemin porte des separateurs", () => {
    expect(matchCategoryResult(POLOS_LIVE, "Enfants > Filles > Polos")).toBe(2);
  });

  it("REFUSE de choisir quand seul le nom de la feuille est stocke", () => {
    // Trois candidats, aucune information pour trancher. Choisir mettrait un
    // vetement homme dans une categorie fille -- exactement ce qu'on refuse.
    expect(matchCategoryResult(POLOS_LIVE, "Polos")).toBeNull();
  });

  it("REFUSE de choisir quand le contexte designe deux branches a egalite", () => {
    // "Enfants" colle autant a Garçons qu'a Filles.
    expect(matchCategoryResult(POLOS_LIVE, "Enfants Polos")).toBeNull();
  });

  it("explique precisement pourquoi il a refuse", () => {
    expect(describeCategoryMatchAttempt(POLOS_LIVE, "Polos").reason).toBe("multiple_title_matches_no_context_token");
    expect(describeCategoryMatchAttempt(POLOS_LIVE, "Enfants Polos").reason).toBe(
      "multiple_title_matches_breadcrumb_still_ambiguous"
    );
  });

  it("expose les jetons de contexte dans le diagnostic", () => {
    expect(describeCategoryMatchAttempt(POLOS_LIVE, "Hommes Polos").contextTokens).toEqual(["hommes"]);
    expect(describeCategoryMatchAttempt(POLOS_LIVE, "Polos").contextTokens).toEqual([]);
  });
});

describe("deriveCategorySearchTerm sur un chemin complet", () => {
  it("ne tape que la feuille dans la recherche", () => {
    expect(deriveCategorySearchTerm("Hommes > Vêtements > Polos").searchTerm).toBe("Polos");
    expect(deriveCategorySearchTerm("Hommes / Vêtements / Polos").searchTerm).toBe("Polos");
  });

  it("laisse le format sans separateur strictement inchange", () => {
    expect(deriveCategorySearchTerm("Hommes Polos")).toEqual({ searchTerm: "Polos", genderHint: "Hommes" });
    expect(deriveCategorySearchTerm("Pulls")).toEqual({ searchTerm: "Pulls", genderHint: null });
  });
});
