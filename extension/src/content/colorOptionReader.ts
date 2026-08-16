// Lecteur DEDIE au picker "Couleur" sur /items/new.
//
// Mission "FIX LIVE-GROUNDED : TAILLE + COULEUR" (2026-08-13) : preuve live
// directe -- apres clic synthetique sur
// [data-testid="color-select-dropdown-input"], le DOM ajoute
// color-select-dropdown-content PUIS une SUGGESTION (suggested-color-9,
// textContent="Bleu") et les vraies options canoniques, ex. :
//   color-9   role=button  textContent="Bleu"
//   color-26  role=button  textContent="Bleu clair"
//   color-27  role=button  textContent="Marine"
// D'autres sous-elements techniques existent (color-{id}--prefix/--title/
// --suffix ou equivalent) -- ce ne sont PAS des options independantes.
//
// CRITIQUE : suggested-color-9 porte le MEME texte ("Bleu") que l'option
// canonique color-9. Si elle n'etait pas exclue, un payload "Bleu"
// produirait deux candidats identiques ("Bleu" canonique + "Bleu"
// suggestion) et le matching deviendrait ambigu a tort, transformant un
// match unique legitime en faux doublon. Le pattern canonique (^color-\d+$,
// prefixe "color-" strict) exclut naturellement cette suggestion des la
// requete initiale ci-dessous ("suggested-color-9" ne demarre PAS par
// "color-"), sans cas particulier ajoute.
//
// Module SEPARE de formFill.ts::readOptionTexts(), meme discipline que
// conditionOptionReader.ts/sizeOptionReader.ts -- aucun refactor global,
// edit_listing non affecte. Le payload ResellOS actuel ne porte qu'UNE
// couleur -- ce module ne matche et ne clique jamais plus d'une option,
// jamais une seconde couleur inventee (Vinted en autorise jusqu'a 2, hors
// perimetre de cette mission). MATCHING volontairement hors de ce fichier :
// matchOption() (matchOption.ts, exact-match-first) est reutilise TEL QUEL
// par vinted-publish.ts -- suffisant pour garantir "Bleu" != "Bleu clair"
// != "Marine" sans logique supplementaire a maintenir ici.

import { isVisible } from "./attributeDropdownDiagnostics";

// Exactement "color-" suivi de chiffres, RIEN d'autre -- exclut
// structurellement color-{id}--prefix/--title/--suffix (suffixe apres les
// chiffres). suggested-color-{id} est deja exclu par la requete initiale
// (prefixe different de "color-").
const CANONICAL_COLOR_OPTION_REGEX = /^color-\d+$/;

export interface ColorOptionCandidate {
  containerTestId: string;
  container: HTMLElement;
  label: string;
}

// Verifie par lecture live sur color-9/color-26/color-27 : role="button",
// isVisible:true.
function isCanonicalColorOption(el: HTMLElement): boolean {
  const testId = el.getAttribute("data-testid") ?? "";
  return CANONICAL_COLOR_OPTION_REGEX.test(testId) && el.getAttribute("role") === "button" && isVisible(el);
}

// Live : le textContent du container canonique est directement propre
// ("Bleu", "Bleu clair", "Marine") -- aucune concatenation parasite
// observee pour ce picker (contrairement a Etat).
function readColorOptionLabel(container: HTMLElement): string | null {
  const text = container.textContent?.trim();
  return text || null;
}

export function readColorOptionCandidates(): ColorOptionCandidate[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="color-"]'));
  const candidates: ColorOptionCandidate[] = [];
  for (const container of nodes) {
    if (!isCanonicalColorOption(container)) continue;
    const label = readColorOptionLabel(container);
    if (!label) continue; // jamais de candidat sans libelle lisible -- illisible plutot que devine
    candidates.push({ containerTestId: container.getAttribute("data-testid") ?? "", container, label });
  }
  return candidates;
}
