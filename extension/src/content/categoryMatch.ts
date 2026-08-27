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
// chaque candidat. deriveCategorySearchTerm() isole le nom de la FEUILLE (le
// terme le plus court/fiable a taper dans la recherche) du reste de la chaine
// ResellOS, qui devient le CONTEXTE de desambiguisation.
//
// MAJ 2026-08-26, apres echec live : la desambiguisation ne regardait que le
// premier mot, et seulement s'il valait Hommes/Femmes/Enfants. Elle compare
// desormais les JETONS du contexte a ceux du chemin de chaque candidat --
// voir categoryTokens(). matchCategoryResult() ne choisit JAMAIS par position
// ni par id, et ambigu ou vide => null (MANUAL_REQUIRED cote appelant), meme
// discipline que matchOption().

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
  const raw = category.trim();
  if (!raw) return { searchTerm: "", genderHint: null };

  // Chemin complet ("Hommes > Vetements > Polos") : la feuille est le DERNIER
  // segment, et c'est elle qu'on tape dans la recherche. Sans ce traitement,
  // le decoupage par espaces plus bas produisait le terme aberrant
  // "> Vetements > Polos". Aucun effet quand il n'y a pas de separateur : le
  // format observe en direct reste "Hommes Polos" ou "Pulls".
  const segments = raw
    .split(/[>|/]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const trimmed = segments.length > 1 ? segments[segments.length - 1] : raw;

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

// Tokenisation pour la comparaison de breadcrumb (2026-08-26).
//
// PREUVE LIVE de ce jour : pour "Polos", Vinted renvoie TROIS Cells au titre
// strictement identique, distinguees uniquement par leur chemin --
// "Enfants > Garcons", "Hommes > Vetements", "Enfants > Filles". Le titre ne
// tranchera jamais ; seul le chemin le peut.
//
// L'ancienne desambiguisation ne regardait QUE le premier mot de la categorie
// stockee, et seulement s'il valait exactement Hommes/Femmes/Enfants. Elle
// echouait donc des que ce mot etait ailleurs dans la chaine ("Polos Hommes"),
// que le chemin etait stocke en entier ("Hommes > Vetements > Polos"), ou que
// le contexte utile n'etait pas un genre ("Vetements", "Garcons").
//
// Les separateurs de chemin (>, /, |) et la ponctuation deviennent des
// espaces : "Hommes > Vetements" et "Hommes Vetements" doivent produire les
// memes jetons, puisque Vinted ecrit l'un dans son ld+json et l'autre dans son
// fil d'ariane.
const TOKEN_SPLIT_REGEX = /[^a-z0-9]+/;

export function categoryTokens(value: string): string[] {
  return normalize(value)
    .split(TOKEN_SPLIT_REGEX)
    .filter((token) => token.length > 0);
}

export interface CategoryResultCandidate {
  title: string;
  breadcrumb: string;
}

// Jetons de CONTEXTE : tout ce que la categorie stockee dit EN PLUS du nom
// de la feuille. Le nom de la feuille est retire parce qu'il est identique
// sur tous les candidats a departager -- il ne peut rien discriminer, et le
// garder ferait scorer tout le monde a egalite.
export function categoryContextTokens(category: string, searchTerm: string): string[] {
  const leafTokens = new Set(categoryTokens(searchTerm));
  return categoryTokens(category).filter((token) => !leafTokens.has(token));
}

// null si : terme de recherche vide, aucun titre ne correspond exactement, OU
// plusieurs titres correspondent sans qu'aucun chemin ne les departage a un
// candidat unique. Jamais de correspondance partielle/floue (contrairement a
// matchOption()) : un titre de categorie Vinted doit correspondre EXACTEMENT
// au terme recherche -- le risque de selectionner une categorie voisine mais
// differente est trop eleve pour une ecriture reelle sur Vinted.
export function matchCategoryResult(candidates: CategoryResultCandidate[], category: string): number | null {
  const { searchTerm } = deriveCategorySearchTerm(category);
  if (!searchTerm) return null;

  const normalizedSearchTerm = normalize(searchTerm);
  const titleMatches = candidates
    .map((candidate, index) => ({ ...candidate, index }))
    .filter((candidate) => normalize(candidate.title) === normalizedSearchTerm);

  if (titleMatches.length === 0) return null;
  if (titleMatches.length === 1) return titleMatches[0].index;

  // Plusieurs titres identiques : on tranche sur le CHEMIN, pas sur le titre.
  // Score = nombre de jetons de contexte reellement presents dans le chemin
  // du candidat. "Hommes Polos" face a ["Enfants > Garcons",
  // "Hommes > Vetements", "Enfants > Filles"] donne 0 / 1 / 0 -> le deuxieme.
  const contextTokens = categoryContextTokens(category, searchTerm);
  if (contextTokens.length === 0) return null; // rien pour departager

  const scored = titleMatches.map((candidate) => {
    const breadcrumbTokens = new Set(categoryTokens(candidate.breadcrumb));
    return { index: candidate.index, score: contextTokens.filter((token) => breadcrumbTokens.has(token)).length };
  });

  const bestScore = Math.max(...scored.map((entry) => entry.score));
  // Aucun chemin ne reprend le moindre jeton de contexte : le contexte stocke
  // ne parle pas de cet arbre, on n'en deduit rien.
  if (bestScore === 0) return null;

  const winners = scored.filter((entry) => entry.score === bestScore);
  // Ex aequo : deux chemins collent aussi bien. Choisir serait arbitraire --
  // meme discipline que matchOption(), on rend la main a l'utilisateur.
  return winners.length === 1 ? winners[0].index : null;
}

// Diagnostic PUREMENT observationnel (meme role que describeMatchAttempt()
// dans matchOption.ts) : explique POURQUOI matchCategoryResult() a renvoye
// null, sans jamais influencer sa decision.
export interface CategoryMatchDiagnostic {
  requestedCategory: string;
  searchTerm: string;
  genderHint: string | null;
  /** Ce que la categorie stockee dit EN PLUS du nom de la feuille. Vide = rien pour departager des homonymes. */
  contextTokens: string[];
  candidates: CategoryResultCandidate[];
  titleMatchCount: number;
  titleMatchBreadcrumbs: string[];
  reason: string;
}

export function describeCategoryMatchAttempt(candidates: CategoryResultCandidate[], category: string): CategoryMatchDiagnostic {
  const { searchTerm, genderHint } = deriveCategorySearchTerm(category);
  const normalizedSearchTerm = normalize(searchTerm);
  const titleMatches = candidates.filter((candidate) => normalize(candidate.title) === normalizedSearchTerm);
  const contextTokens = searchTerm ? categoryContextTokens(category, searchTerm) : [];

  let reason: string;
  if (!searchTerm) {
    reason = "empty_search_term";
  } else if (titleMatches.length === 0) {
    reason = "no_candidate_title_matches_search_term";
  } else if (titleMatches.length === 1) {
    reason = "unique_title_match"; // matchCategoryResult() aurait du la retourner -- ne devrait jamais apparaitre ici
  } else if (contextTokens.length === 0) {
    // Cas a surveiller en priorite : la categorie stockee ne contient QUE le
    // nom de la feuille ("Polos"), sans genre ni chemin. Aucune information ne
    // permet alors de choisir entre les homonymes -- il en faudrait une
    // nouvelle A LA SOURCE, aucun algorithme ne peut la deviner.
    reason = "multiple_title_matches_no_context_token";
  } else {
    const scores = titleMatches.map((candidate) => {
      const breadcrumbTokens = new Set(categoryTokens(candidate.breadcrumb));
      return contextTokens.filter((token) => breadcrumbTokens.has(token)).length;
    });
    const best = Math.max(...scores);
    const winners = scores.filter((score) => score === best).length;
    reason =
      best === 0
        ? "multiple_title_matches_context_matches_no_breadcrumb"
        : winners === 1
          ? "unique_breadcrumb_match" // idem : matchCategoryResult() aurait du la retourner
          : "multiple_title_matches_breadcrumb_still_ambiguous";
  }

  return {
    requestedCategory: category,
    searchTerm,
    genderHint,
    contextTokens,
    candidates,
    titleMatchCount: titleMatches.length,
    titleMatchBreadcrumbs: titleMatches.map((candidate) => candidate.breadcrumb),
    reason,
  };
}
