// Lecteur DEDIE au picker "Taille" sur /items/new.
//
// Mission "FIX LIVE-GROUNDED : TAILLE + COULEUR" (2026-08-13) : preuve live
// directe dans la console Vinted apres clic synthetique sur le trigger
// [data-testid="category-size-single-grid-input"] -- le DOM ajoute
// notamment category-size-single-grid-content, PUIS une SUGGESTION
// (size-suggestions-grid-option-209, role="checkbox", textContent="L",
// ariaLabel="L") et les VRAIES options canoniques, ex. :
//   size-group-14-grid-option-206  role=checkbox  "XS"
//   size-group-14-grid-option-207  role=checkbox  "S"
//   size-group-14-grid-option-208  role=checkbox  "M"
//   size-group-14-grid-option-209  role=checkbox  "L"
//   size-group-14-grid-option-210  role=checkbox  "XL"
//   size-group-14-grid-option-211  role=checkbox  "XXL"
//   size-group-14-grid-option-212  role=checkbox  "XXXL"
//   size-group-14-grid-option-308  role=checkbox  "4XL"
//   size-group-14-grid-option-309  role=checkbox  "5XL"
//   size-group-14-grid-option-1192 role=checkbox  "6XL"
//   size-group-14-grid-option-1193 role=checkbox  "7XL"
//   size-group-14-grid-option-1194 role=checkbox  "8XL"
//   size-group-14-grid-option-213  role=checkbox  "Taille unique"
//
// La SUGGESTION (size-suggestions-grid-option-*) porte le MEME texte
// qu'une option canonique -- si elle n'etait pas exclue, un payload "L"
// produirait deux candidats identiques ("L" canonique + "L" suggestion) et
// le matching deviendrait ambigu a tort, transformant un match unique
// legitime en faux doublon. D'autres elements techniques (size-banner-*,
// size-guide-*, category-size-single-grid-chevron-up) ne sont pas non plus
// des options -- aucun d'entre eux ne demarre par "size-group-".
//
// Le "14" dans size-group-14-* est probablement CONTEXTUEL a la categorie
// choisie -- AUCUNE preuve live ne confirme qu'il est universel a toutes
// les categories Vinted. Le pattern est donc derive STRUCTURELLEMENT
// (size-group-{n'importe quel id numerique}-grid-option-{id}), jamais un
// "14" fige en dur.
//
// Module SEPARE de formFill.ts::readOptionTexts() (structure DOM propre a
// ce picker, meme discipline que conditionOptionReader.ts) -- aucun
// refactor global, edit_listing non affecte. Le MATCHING reste
// volontairement hors de ce fichier : matchOption() (matchOption.ts, deja
// prouve exact-match-first) est reutilise TEL QUEL par vinted-publish.ts,
// suffisant pour garantir "L" != "XL" != "XXL" sans aucune logique
// supplementaire a maintenir ici.

import { isVisible } from "./attributeDropdownDiagnostics";

// Exactement "size-group-" + chiffres + "-grid-option-" + chiffres --
// exclut structurellement size-suggestions-grid-option-* (prefixe different
// des le depart, non capture par la requete initiale ci-dessous), ainsi que
// size-banner-*/size-guide-*/category-size-single-grid-chevron-up.
const CANONICAL_SIZE_OPTION_REGEX = /^size-group-\d+-grid-option-\d+$/;

export interface SizeOptionCandidate {
  containerTestId: string;
  container: HTMLElement;
  label: string;
}

// Verifie par lecture live sur size-group-14-grid-option-206..213 :
// role="checkbox", isVisible:true (offsetParent/getClientRects).
function isCanonicalSizeOption(el: HTMLElement): boolean {
  const testId = el.getAttribute("data-testid") ?? "";
  return CANONICAL_SIZE_OPTION_REGEX.test(testId) && el.getAttribute("role") === "checkbox" && isVisible(el);
}

// Live : aria-label ET textContent portent tous deux le libelle propre
// ("L", "XS", "Taille unique"...) sans concatenation parasite (contrairement
// a Etat, ou aucune des deux sources n'etait fiable) -- aria-label prefere
// (attribut semantique explicite, moins sensible a un enfant additionnel
// inattendu type icone/badge), textContent en repli si aria-label est
// absent pour un candidat donne.
function readSizeOptionLabel(container: HTMLElement): string | null {
  const ariaLabel = container.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  const text = container.textContent?.trim();
  return text || null;
}

export function readSizeOptionCandidates(): SizeOptionCandidate[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="size-group-"]'));
  const candidates: SizeOptionCandidate[] = [];
  for (const container of nodes) {
    if (!isCanonicalSizeOption(container)) continue;
    const label = readSizeOptionLabel(container);
    if (!label) continue; // jamais de candidat sans libelle lisible -- illisible plutot que devine
    candidates.push({ containerTestId: container.getAttribute("data-testid") ?? "", container, label });
  }
  return candidates;
}
