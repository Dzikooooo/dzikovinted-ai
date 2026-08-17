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

  it("reports 'multiple_title_matches_no_gender_hint' when ambiguous without a gender hint", () => {
    const candidates: CategoryResultCandidate[] = [
      { title: "Polos", breadcrumb: "Enfants > Garçons > Polos" },
      { title: "Polos", breadcrumb: "Hommes > Polos" },
    ];
    const diag = describeCategoryMatchAttempt(candidates, "Polos");
    expect(diag.reason).toBe("multiple_title_matches_no_gender_hint");
    expect(diag.titleMatchCount).toBe(2);
  });

  it("reports 'multiple_title_matches_gender_hint_matches_none' when the gender hint matches no breadcrumb", () => {
    const candidates: CategoryResultCandidate[] = [
      { title: "Polos", breadcrumb: "Enfants > Garçons > Polos" },
      { title: "Polos", breadcrumb: "Femmes > Polos" },
    ];
    const diag = describeCategoryMatchAttempt(candidates, "Hommes Polos");
    expect(diag.reason).toBe("multiple_title_matches_gender_hint_matches_none");
  });
});
