// Correspondance texte entre un champ libre ResellOS (brand/size/condition/
// color) et les options reelles listees par un picker Vinted. Ne devine
// jamais : renvoie null si aucune correspondance fiable, plutot que de
// choisir une option arbitraire (coherent avec la discipline "aucune
// donnee inventee" deja appliquee dans src/lib/insights/).

const COMBINING_DIACRITICS_REGEX = /[̀-ͯ]/g;

// Mission "IDENTIFIER ET CORRIGER LES DERNIERS BLOQUAGES DES ATTRIBUTS"
// (2026-08-12) : exportee (etait privee) pour que le diagnostic des exact
// matches dupliques (attributeDropdownDiagnostics.ts) reutilise EXACTEMENT
// la meme normalisation que matchOption()/describeMatchAttempt(), sans
// dupliquer cette logique -- comportement de matchOption() lui-meme
// totalement inchange.
export function normalize(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS_REGEX, "");
}

// Mission "FINIR LES CHAMPS MANQUANTS" (2026-08-11), item 5 : securite
// AJOUTEE ici -- l'ancienne version prenait le PREMIER candidat trouve
// (`.find()`) sans jamais verifier s'il y en avait un second tout aussi
// valide (ex. DB "Ralph Lauren" face aux options Vinted ["Ralph Lauren",
// "Polo Ralph Lauren"] : les deux contiennent/sont contenus l'un dans
// l'autre -- le premier dans l'ordre du DOM gagnait silencieusement, sans
// aucune garantie que ce soit le bon). Desormais : plusieurs candidats
// egalement valides (exact OU partiel) => ambigu => null, jamais un choix
// arbitraire. Strictement plus PRUDENT que l'ancienne version (ne peut que
// refuser un cas auparavant accepte a tort, jamais accepter un cas
// auparavant refuse) -- aucune regression possible sur un match qui etait
// deja correctement unique.
export function matchOption(freeText: string | null | undefined, options: string[]): string | null {
  if (!freeText || !freeText.trim() || options.length === 0) return null;

  const normalizedText = normalize(freeText);

  const exactMatches = options.filter((option) => normalize(option) === normalizedText);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;

  const partialMatches = options.filter((option) => {
    const normalizedOption = normalize(option);
    return normalizedOption.includes(normalizedText) || normalizedText.includes(normalizedOption);
  });
  return partialMatches.length === 1 ? partialMatches[0] : null;
}

// Mission "CORRIGER LES ATTRIBUTS POST-CATEGORIE" (2026-08-12) : diagnostic
// PUREMENT observationnel, expose le raisonnement interne de matchOption()
// (candidats exacts/partiels, formes normalisees) sans jamais modifier son
// comportement de decision -- matchOption() reste l'unique source de verite
// pour la SELECTION reelle (vinted-edit.ts::selectMatchingOption en
// production en depend), cette fonction ne fait QUE reformuler la meme
// logique pour la rendre lisible en cas d'echec (no_reliable_match), au lieu
// de deviner a l'aveugle pourquoi une correspondance a ete refusee.
export interface MatchDiagnostic {
  requestedValue: string;
  normalizedRequestedValue: string;
  candidates: string[];
  normalizedCandidates: string[];
  exactMatches: string[];
  fuzzyMatches: string[];
  reason: string;
}

export function describeMatchAttempt(freeText: string, options: string[]): MatchDiagnostic {
  const normalizedRequestedValue = normalize(freeText);
  const normalizedCandidates = options.map(normalize);
  const exactMatches = options.filter((option) => normalize(option) === normalizedRequestedValue);
  const fuzzyMatches = options.filter((option) => {
    const normalizedOption = normalize(option);
    return normalizedOption.includes(normalizedRequestedValue) || normalizedRequestedValue.includes(normalizedOption);
  });

  let reason: string;
  if (exactMatches.length > 1) reason = "multiple_exact_matches_ambiguous";
  else if (exactMatches.length === 1) reason = "exact_match_unique"; // matchOption() aurait du la retourner -- ne devrait jamais apparaitre ici
  else if (fuzzyMatches.length === 0) reason = "no_candidate_contains_or_is_contained_by_requested_value";
  else if (fuzzyMatches.length > 1) reason = "multiple_partial_matches_ambiguous";
  else reason = "single_partial_match"; // idem : matchOption() aurait du la retourner

  return {
    requestedValue: freeText,
    normalizedRequestedValue,
    candidates: options,
    normalizedCandidates,
    exactMatches,
    fuzzyMatches,
    reason,
  };
}
