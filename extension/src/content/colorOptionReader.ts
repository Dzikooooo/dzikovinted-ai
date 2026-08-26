// Lecteur DEDIE au picker "Couleur" sur /items/new.
//
// Mission "ROUND DIAGNOSTIC COULEUR" (2026-08-19) -- CAUSE CONFIRMEE en test
// live (instrumentation dediee, voir historique de ce fichier) : la structure
// DOM documentee ci-dessous jusque-la (color-{id}, role="button", confirmation
// via la valeur du trigger <input>) est OBSOLETE. Preuve live directe fournie
// par l'utilisateur pour l'option "Bleu" :
//   data-testid="filter-grid-option-9"  role="checkbox"
//   avant clic humain : aria-checked="false"
//   apres clic humain : aria-checked="true"
//   aucun <input> interne
// Vinted a migre ce picker vers le meme type de composant "grid" que Taille
// (voir sizeOptionReader.ts, role="checkbox" egalement) -- mais avec un
// prefixe de testid GENERIQUE ("filter-grid-option-"), contrairement a
// "size-group-{n}-grid-option-{id}" qui est deja specifique a Taille. La
// confirmation de selection n'est donc PLUS la valeur du trigger (jamais
// prouvee fiable pour ce widget precis -- c'est exactement ce qui causait le
// faux "confirmed" suivi d'un retour silencieux a "Sélectionne 2 couleurs
// maximum" + erreur de validation) : c'est desormais aria-checked==="true" sur
// le CANDIDAT lui-meme, lu FRAICHEMENT apres le clic -- meme discipline
// structurelle que checkbox.checked pour Matiere (materialOptionReader.ts).
//
// Le payload ResellOS actuel ne porte qu'UNE couleur -- ce module ne matche
// et ne clique jamais plus d'une option (Vinted en autorise jusqu'a 2, hors
// perimetre de cette mission). MATCHING volontairement hors de ce fichier :
// matchOption() (matchOption.ts, exact-match-first) est reutilise TEL QUEL
// par vinted-publish.ts -- suffisant pour garantir "Bleu" != "Bleu clair" !=
// "Marine" sans logique supplementaire a maintenir ici.
//
// RISQUE RESIDUEL CONNU (jamais observe en live, jamais suppose resolu) : le
// prefixe "filter-grid-option-" est GENERIQUE -- rien ne prouve qu'il est
// exclusif au picker Couleur sur cette page (contrairement a "size-group-"/
// "condition-"/"material-", tous specifiques a leur champ). Aucun conteneur
// de scoping DOM n'a ete prouve en direct pour ce picker -- en ajouter un
// invente serait justement la faute que ce module cherche a eviter. Si une
// collision reelle est un jour observee (une AUTRE checkbox "filter-grid-
// option-N" visible simultanement hors du picker Couleur), elle se
// manifestera comme un candidat inattendu dans readColorOptionCandidates() --
// a instrumenter/scoper alors avec une preuve live, jamais en amont sans elle.

import { isVisible } from "./attributeDropdownDiagnostics";

// Exactement "filter-grid-option-" suivi de chiffres, RIEN d'autre.
const CANONICAL_COLOR_OPTION_REGEX = /^filter-grid-option-\d+$/;

export interface ColorOptionCandidate {
  containerTestId: string;
  container: HTMLElement;
  label: string;
}

// Verifie par preuve live (option "Bleu", filter-grid-option-9) :
// role="checkbox", isVisible:true (offsetParent/getClientRects).
function isCanonicalColorOption(el: HTMLElement): boolean {
  const testId = el.getAttribute("data-testid") ?? "";
  return CANONICAL_COLOR_OPTION_REGEX.test(testId) && el.getAttribute("role") === "checkbox" && isVisible(el);
}

// Meme discipline defensive que sizeOptionReader.ts (structure "grid-option"
// analogue) : aria-label prefere (attribut semantique explicite, moins
// sensible a un enfant additionnel type icone/pastille de couleur), repli sur
// textContent si aria-label est absent -- jamais suppose sans preuve pour ce
// widget precis (contrairement a l'ancienne structure color-{id}, dont le
// textContent propre etait deja confirme en direct).
function readColorOptionLabel(container: HTMLElement): string | null {
  const ariaLabel = container.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  const text = container.textContent?.trim();
  return text || null;
}

// Mission "CAUSE COULEUR CONFIRMEE LIVE -- doublon DOM" (2026-08-19) : preuve
// live directe -- pour textContent==="Bleu", Vinted retourne DEUX noeuds DOM
// distincts portant EXACTEMENT le meme data-testid ("filter-grid-option-9",
// "filter-grid-option-9"). Ce sont deux representations DOM de la MEME option
// logique (pas deux couleurs differentes) -- non deduplique, matchOption()
// recevait deux labels "Bleu" identiques et refusait a raison le match
// ("ambiguous_match", cf. materialOptionReader.ts/colorOptionReader.test.ts
// pour la meme discipline sur un vrai doublon logique). La deduplication se
// fait STRICTEMENT sur data-testid (l'identifiant canonique de l'option),
// JAMAIS sur le label seul -- "Bleu" et "Bleu clair" ont des data-testid
// differents et doivent rester deux candidats distincts ; deux "Bleu" avec
// des data-testid REELLEMENT differents (jamais observe, mais pas exclu)
// restent tout aussi delibarement ambigus qu'avant, aucune deduplication par
// label ne doit jamais les fusionner.
export function readColorOptionCandidates(): ColorOptionCandidate[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="filter-grid-option-"]'));
  const seenTestIds = new Set<string>();
  const candidates: ColorOptionCandidate[] = [];
  for (const container of nodes) {
    if (!isCanonicalColorOption(container)) continue;
    const testId = container.getAttribute("data-testid") ?? "";
    // Deuxieme (ou N-ieme) noeud DOM portant le MEME data-testid -- meme
    // option logique deja retenue via son premier noeud, jamais un second
    // candidat pour la meme option.
    if (seenTestIds.has(testId)) continue;
    const label = readColorOptionLabel(container);
    if (!label) continue; // jamais de candidat sans libelle lisible -- illisible plutot que devine
    seenTestIds.add(testId);
    candidates.push({ containerTestId: testId, container, label });
  }
  return candidates;
}

// Re-resolution EXPLICITE par data-testid canonique -- utilisee juste avant
// le clic (vinted-publish.ts::attemptColorPrefill) pour ne jamais cliquer une
// reference DOM conservee depuis le matching. querySelector() renvoie le
// PREMIER noeud portant ce data-testid dans l'ordre du document -- suffisant
// et correct ici puisque les deux noeuds dupliques representent la MEME
// option logique (voir readColorOptionCandidates() ci-dessus) : cliquer l'un
// ou l'autre est equivalent par construction.
export function resolveColorOptionByTestId(testId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

// Source UNIQUE de verite pour "cette couleur est reellement selectionnee" --
// jamais la valeur du trigger (voir en-tete). Relit l'attribut FRAIS a chaque
// appel, jamais une valeur mise en cache.
export function isColorCandidateChecked(candidate: ColorOptionCandidate): boolean {
  return candidate.container.getAttribute("aria-checked") === "true";
}
