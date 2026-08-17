// Logique de correspondance PURE (aucun DOM, aucun chrome.*) pour la
// selection automatique de categorie Vinted -- extraite pour rester
// testable sans mock chrome, meme discipline que matchOption.ts/
// publishFieldSummary.ts/domWait.ts (voir leurs en-tetes).
//
// Mission "AUTOMATISATION CATEGORIE" (2026-08-16) : le champ ResellOS
// `category` (extrait du ld+json Vinted, voir itemSelectors.ts) est un texte
// libre du type "Hommes Polos" -- jamais un id numerique, jamais une
// arborescence structuree. Le panneau de recherche Vinted renvoie souvent
// PLUSIEURS resultats pour un terme court (ex. "Polos" existe sous Hommes ET
// sous Enfants) : le titre seul ne suffit jamais a departager, il faut le
// "chemin" (breadcrumb, ex. "Hommes > Vêtements > Hauts et t-shirts") de
// chaque candidat. deriveCategorySearchTerm() isole le prefixe de genre
// connu (s'il existe) du reste de la chaine ResellOS pour a) chercher sur le
// terme le plus court/fiable possible et b) fournir un indice de
// desambiguisation independant du titre. matchCategoryResult() ne choisit
// JAMAIS par position ni par id -- ambigu ou vide => null (MANUAL_REQUIRED
// cote appelant), meme discipline que matchOption().

import { normalize } from "./matchOption";

// Derive de la connaissance du propre arbre Vinted (les 3 branches de genre
// racines), jamais invente -- aucune liste equivalente n'existait ailleurs
// dans le repo (verifie : opportunityCategories.ts est une taxonomie
// Watchlist sans rapport, aucun helper genre/univers dans src/lib/types.ts).
export const KNOWN_CATEGORY_GENDER_PREFIXES = ["Hommes", "Femmes", "Enfants"] as const;

export interface DerivedCategorySearchTerm {
  searchTerm: string;
  genderHint: string | null;
}

// "Hommes Polos" -> { searchTerm: "Polos", genderHint: "Hommes" }
// "Polos" (sans prefixe) -> { searchTerm: "Polos", genderHint: null }
// "Hommes" (seul, rien apres) -> { searchTerm: "Hommes", genderHint: null }
//   (rien a chercher si on retire le seul mot -- on garde la chaine entiere
//   plutot que de chercher un terme vide)
export function deriveCategorySearchTerm(category: string): DerivedCategorySearchTerm {
  const trimmed = category.trim();
  if (!trimmed) return { searchTerm: "", genderHint: null };

  const words = trimmed.split(/\s+/);
  if (words.length > 1) {
    const matchedPrefix = KNOWN_CATEGORY_GENDER_PREFIXES.find((prefix) => normalize(prefix) === normalize(words[0]));
    if (matchedPrefix) {
      const remainder = words.slice(1).join(" ").trim();
      if (remainder) return { searchTerm: remainder, genderHint: matchedPrefix };
    }
  }
  return { searchTerm: trimmed, genderHint: null };
}

export interface CategoryResultCandidate {
  title: string;
  breadcrumb: string;
}

// null si : terme de recherche vide, aucun titre ne correspond exactement,
// OU plusieurs titres correspondent sans qu'un indice de genre fiable ne
// permette de trancher a un candidat unique. Jamais de correspondance
// partielle/floue (contrairement a matchOption()) : un titre de categorie
// Vinted doit correspondre exactement au terme recherche, le risque de
// selectionner une categorie voisine mais differente etant trop eleve pour
// une ecriture reelle sur Vinted.
export function matchCategoryResult(candidates: CategoryResultCandidate[], category: string): number | null {
  const { searchTerm, genderHint } = deriveCategorySearchTerm(category);
  if (!searchTerm) return null;

  const normalizedSearchTerm = normalize(searchTerm);
  const titleMatches = candidates
    .map((candidate, index) => ({ ...candidate, index }))
    .filter((candidate) => normalize(candidate.title) === normalizedSearchTerm);

  if (titleMatches.length === 0) return null;
  if (titleMatches.length === 1) return titleMatches[0].index;

  if (!genderHint) return null;
  const normalizedGenderHint = normalize(genderHint);
  const genderMatches = titleMatches.filter((candidate) => normalize(candidate.breadcrumb).startsWith(normalizedGenderHint));
  return genderMatches.length === 1 ? genderMatches[0].index : null;
}

// Diagnostic PUREMENT observationnel (meme role que describeMatchAttempt()
// dans matchOption.ts) : explique POURQUOI matchCategoryResult() a renvoye
// null, sans jamais influencer sa decision.
export interface CategoryMatchDiagnostic {
  requestedCategory: string;
  searchTerm: string;
  genderHint: string | null;
  candidates: CategoryResultCandidate[];
  titleMatchCount: number;
  titleMatchBreadcrumbs: string[];
  reason: string;
}

export function describeCategoryMatchAttempt(candidates: CategoryResultCandidate[], category: string): CategoryMatchDiagnostic {
  const { searchTerm, genderHint } = deriveCategorySearchTerm(category);
  const normalizedSearchTerm = normalize(searchTerm);
  const titleMatches = candidates.filter((candidate) => normalize(candidate.title) === normalizedSearchTerm);

  let reason: string;
  if (!searchTerm) {
    reason = "empty_search_term";
  } else if (titleMatches.length === 0) {
    reason = "no_candidate_title_matches_search_term";
  } else if (titleMatches.length === 1) {
    reason = "unique_title_match"; // matchCategoryResult() aurait du la retourner -- ne devrait jamais apparaitre ici
  } else if (!genderHint) {
    reason = "multiple_title_matches_no_gender_hint";
  } else {
    const normalizedGenderHint = normalize(genderHint);
    const genderMatches = titleMatches.filter((candidate) => normalize(candidate.breadcrumb).startsWith(normalizedGenderHint));
    reason =
      genderMatches.length === 0
        ? "multiple_title_matches_gender_hint_matches_none"
        : genderMatches.length === 1
          ? "unique_gender_match" // idem : matchCategoryResult() aurait du la retourner
          : "multiple_title_matches_gender_hint_still_ambiguous";
  }

  return {
    requestedCategory: category,
    searchTerm,
    genderHint,
    candidates,
    titleMatchCount: titleMatches.length,
    titleMatchBreadcrumbs: titleMatches.map((candidate) => candidate.breadcrumb),
    reason,
  };
}
