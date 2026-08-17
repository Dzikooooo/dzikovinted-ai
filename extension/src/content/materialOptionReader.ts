// Lecteur DEDIE au picker "Matiere" sur /items/new.
//
// Mission "MATIERE : MULTI-SELECT" (2026-08-16) : structure DOM reelle
// fournie par preuve live directe (diagnostic dedie execute par
// l'utilisateur dans la console Vinted, PAS un script ResellOS) sur
// category-material-multi-list-input/-content. Par option (exemple observe :
// id 44 = Coton, id 45 = Polyester) :
//   material-44                    (conteneur logique)
//   material-44--title
//   material-44--suffix
//   material-checkbox-44
//   material-checkbox-44--input    <input type="checkbox">  <-- controle reel
//
// Preuve de confirmation (meme diagnostic) : apres avoir coche manuellement
// Coton PUIS Polyester, les DEUX <input type="checkbox"> associes avaient
// .checked === true SIMULTANEMENT -- CONFIRME EN DIRECT que Matiere est un
// vrai multi-select (contrairement a Etat/Taille, single-select confirmes,
// et a Couleur, jamais verifiee au-dela d'une seule valeur). Signal de
// confirmation UNIQUE prouve fiable : checkbox.checked. trigger.value,
// trigger.textContent, aria-checked, aria-selected et les chips sont tous
// restes vides/absents pendant ce meme diagnostic -- explicitement ECARTES
// comme source de confirmation ici (voir vinted-publish.ts::attemptMaterialPrefill).
//
// Le lien conteneur <-> checkbox est reconstruit par CORRELATION D'ID (regex
// sur les deux data-testid, tous deux portant le meme id numerique), jamais
// par une hypothese de structure parent/enfant precise -- la geometrie
// exacte de l'arbre n'a pas ete fournie par le diagnostic, seule la
// correlation d'id l'a ete. Le libelle utilise pour le matching est le
// textContent COMPLET du conteneur material-{id} -- -title/-suffix ne sont
// PAS supposes lisibles isolement (aucune preuve dans un sens ou l'autre),
// meme prudence deja necessaire et confirmee pour Etat (voir
// conditionOptionReader.ts, dont -title/-content se sont averes illisibles
// une fois testes en direct). Matching en consequence : PREFIXE normalise du
// texte complet du conteneur contre la valeur demandee (identique a
// matchConditionOption), jamais un decoupage suppose du texte concatene.
//
// Module SEPARE de formFill.ts::readOptionTexts() (structure fondamentalement
// differente -- l'ancien code reutilisait a tort CATEGORY_DROPDOWN_CONTENT_SELECTOR
// pour ce champ, jamais valide independamment, cause probable des echecs
// observes avant cette mission). Aucun refactor global : readOptionTexts()/
// selectMatchingOption()/matchOption() restent inchanges. edit_listing
// (vinted-edit.ts) reutilise encore l'ancien chemin generique pour Matiere --
// gap connu, explicitement hors perimetre de cette mission (voir le rapport).

import { isVisible } from "./attributeDropdownDiagnostics";
import { normalize } from "./matchOption";

// Exactement "material-" suivi de chiffres, RIEN d'autre -- exclut
// explicitement material-{id}--title/--suffix (suffixe apres les chiffres)
// ET material-checkbox-{id}* (prefixe different, "checkbox-" avant les
// chiffres).
const MATERIAL_CONTAINER_REGEX = /^material-(\d+)$/;
// Le VRAI controle : <input type="checkbox"> confirme en direct.
const MATERIAL_CHECKBOX_INPUT_REGEX = /^material-checkbox-(\d+)--input$/;

export interface MaterialOptionCandidate {
  id: string;
  containerTestId: string;
  containerText: string;
  checkbox: HTMLInputElement;
}

// Mission "MATIERE : BUG MATCHING" (2026-08-16) : preuve live d'un
// optionsCount inhabituellement eleve (55) + demande explicite de
// l'utilisateur ("le diagnostic live montrait plusieurs elements DOM lies au
// meme id") -- dedupliquee ici en PREMIER-GAGNE (dans l'ordre du DOM), pour
// les conteneurs ET les checkboxes INDEPENDAMMENT : si Vinted rend deux fois
// le meme id (ex. variante desktop/mobile simultanee, deja un pattern connu
// ailleurs dans ce projet pour d'autres composants), UNE seule matiere
// logique doit en resulter, jamais deux candidats "Coton" distincts pour le
// meme id 44 qui rendraient le matching ambigu a tort.
export function readMaterialOptionCandidates(): MaterialOptionCandidate[] {
  const containerById = new Map<string, HTMLElement>();
  for (const container of Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="material-"]'))) {
    const match = MATERIAL_CONTAINER_REGEX.exec(container.getAttribute("data-testid") ?? "");
    if (!match) continue;
    const id = match[1];
    if (!containerById.has(id)) containerById.set(id, container); // premier gagne
  }

  const checkboxById = new Map<string, HTMLInputElement>();
  for (const checkbox of Array.from(
    document.querySelectorAll<HTMLInputElement>('[data-testid^="material-checkbox-"][data-testid$="--input"]')
  )) {
    const match = MATERIAL_CHECKBOX_INPUT_REGEX.exec(checkbox.getAttribute("data-testid") ?? "");
    if (!match) continue;
    if (!isVisible(checkbox)) continue; // jamais un candidat sur un controle invisible
    const id = match[1];
    if (!checkboxById.has(id)) checkboxById.set(id, checkbox); // premiere checkbox VISIBLE gagne
  }

  const candidates: MaterialOptionCandidate[] = [];
  for (const [id, checkbox] of checkboxById) {
    const container = containerById.get(id);
    if (!container) continue; // pas de conteneur logique correspondant -- jamais invente

    const containerText = container.textContent?.trim() ?? "";
    if (!containerText) continue; // illisible -- jamais un candidat sans libelle

    candidates.push({ id, containerTestId: container.getAttribute("data-testid") ?? "", containerText, checkbox });
  }
  return candidates;
}

export type MaterialMatchReason = "unique_match" | "no_match" | "ambiguous_match";

export interface MaterialMatchResult {
  matched: MaterialOptionCandidate | null;
  reason: MaterialMatchReason;
  matchingCandidates: MaterialOptionCandidate[];
}

// Meme strategie que matchConditionOption (conditionOptionReader.ts, deja
// prouvee necessaire pour un scenario DOM analogue -- libelle isole non
// confirme lisible) : match UNIQUEMENT si exactement un candidat a un texte
// de conteneur egal-au ou commencant-par la valeur demandee normalisee. 0 ou
// plusieurs candidats compatibles => manuel, jamais un choix invente.
export function matchMaterialOption(
  requestedValue: string | null | undefined,
  candidates: MaterialOptionCandidate[]
): MaterialMatchResult {
  if (!requestedValue || !requestedValue.trim()) {
    return { matched: null, reason: "no_match", matchingCandidates: [] };
  }

  const requested = normalize(requestedValue);
  const matchingCandidates = candidates.filter((candidate) => {
    const text = normalize(candidate.containerText);
    return text === requested || text.startsWith(requested);
  });

  if (matchingCandidates.length === 1) {
    return { matched: matchingCandidates[0], reason: "unique_match", matchingCandidates };
  }
  if (matchingCandidates.length === 0) {
    return { matched: null, reason: "no_match", matchingCandidates: [] };
  }
  return { matched: null, reason: "ambiguous_match", matchingCandidates };
}
