// Lecteur DEDIE au picker "Etat" (condition) sur /items/new.
//
// Mission "FIX REEL DU PICKER ETAT SUR /items/new" (2026-08-12) : premiere
// version basee sur l'hypothese que condition-{id}-title portait, dans son
// PROPRE textContent, le libelle court -- INFIRMEE par le test live suivant.
//
// Mission "FIX FINAL ETAT : MATCHER LE CONTAINER REEL" (2026-08-13) : test
// DOM effectue en direct dans la console Vinted sur les 5 candidats reels
// (condition-1/2/3/4/6). Pour TOUS, sans exception :
//   condition-{id}-title.textContent      === null
//   condition-{id}-title.innerText        === null
//   condition-{id}-content.textContent    === null
//   condition-{id}-content.innerText      === null
// CONDITION TITLE CHILD SOURCE: INVALID -- CONFIRMED LIVE.
//
// En revanche, le CONTENEUR LOGIQUE lui-meme (condition-{id}) porte bien le
// texte exploitable, concatene sans separateur entre libelle et description
// ("Très bon étatTrès peu porté, peut présenter quelques légères traces...").
// CONDITION CONTAINER TEXT SOURCE: VALID -- CONFIRMED LIVE.
//
// Consequence directe : aucun libelle court ne peut etre extrait de facon
// fiable (pas de sous-element isole, pas de separateur connu dans le texte
// concatene -- une regex de decoupage serait une supposition, pas une
// preuve). La valeur cible est deja connue exactement (payload ResellOS, ex.
// "Très bon état") : la strategie retenue est donc un matching par PREFIXE
// normalise du texte COMPLET du conteneur contre cette valeur connue, jamais
// une extraction de libelle court independante ni un fuzzy matching.
//
// Toujours un module SEPARE de formFill.ts::readOptionTexts() (structure DOM
// d'Etat fondamentalement differente des autres pickers -- Taille/Marque/
// Couleur/Matiere restent sur readOptionTexts() generique tant que leur
// propre diagnostic live n'a pas prouve la meme structure).
//
// Aucun refactor global : readOptionTexts()/selectMatchingOption()/
// matchOption() restent totalement inchanges, edit_listing non affecte.

import { isVisible } from "./attributeDropdownDiagnostics";
import { normalize } from "./matchOption";

// Exactement "condition-" suivi de chiffres, RIEN d'autre -- exclut
// explicitement condition-{id}-title/-content/-suffix (suffixe textuel apres
// les chiffres) ET condition-radio-{id}* (prefixe different, "radio-" avant
// les chiffres).
const CONDITION_OPTION_CONTAINER_REGEX = /^condition-\d+$/;

export interface ConditionOptionCandidate {
  containerTestId: string;
  container: HTMLElement;
  containerText: string;
}

// Mission "ROUND CONDITION / ETAT -- correctif role" (2026-08-19) : CAUSE
// RACINE confirmee en live -- les 5 conteneurs condition-{id} portent
// desormais role="radio" (pas "button"), regression du DOM Vinted survenue
// depuis la preuve live du 2026-08-13 (qui avait confirme role="button" a
// l'epoque). "radio" est donc la valeur ATTENDUE aujourd'hui ; "button" est
// conserve en repli de compatibilite pour ne jamais regresser si Vinted
// revient a l'ancienne variante (ou fait cohabiter les deux selon le
// contexte) -- CONDITION_OPTION_CONTAINER_VALID_ROLES n'est JAMAIS elargi
// au-dela de ces deux valeurs deja prouvees en live, jamais un role devine.
const CONDITION_OPTION_CONTAINER_VALID_ROLES = new Set(["radio", "button"]);

function isConditionOptionContainer(el: HTMLElement): boolean {
  const testId = el.getAttribute("data-testid") ?? "";
  const role = el.getAttribute("role");
  return (
    CONDITION_OPTION_CONTAINER_REGEX.test(testId) &&
    role !== null &&
    CONDITION_OPTION_CONTAINER_VALID_ROLES.has(role) &&
    isVisible(el)
  );
}

// Source CONFIRMEE LIVE (2026-08-13) : el.textContent est la seule lecture
// prouvee fiable pour ce picker -- condition-{id}-title/-content sont
// illisibles (null) pour tous les candidats testes en direct. innerText
// garde uniquement en repli si textContent est vide, jamais utilise en
// priorite (textContent est la source confirmee, pas une supposition).
function readContainerText(container: HTMLElement): string {
  const text = container.textContent?.trim();
  if (text) return text;
  return container.innerText?.trim() ?? "";
}

export function readConditionOptionCandidates(): ConditionOptionCandidate[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="condition-"]'));
  return nodes.filter(isConditionOptionContainer).map((container) => ({
    containerTestId: container.getAttribute("data-testid") ?? "",
    container,
    containerText: readContainerText(container),
  }));
}

export type ConditionMatchReason = "unique_match" | "no_match" | "ambiguous_match";

export interface ConditionMatchResult {
  matched: ConditionOptionCandidate | null;
  reason: ConditionMatchReason;
  matchingCandidates: ConditionOptionCandidate[];
}

// Strategie dediee Etat (mission "FIX FINAL ETAT", item C) : UNIQUE PREFIX
// MATCH ONLY. Pas de decoupage du texte concatene (aucun separateur fiable
// dans le DOM reel), pas de fuzzy matching agressif -- un candidat n'est
// compatible que si son texte complet normalise EST EGAL AU, ou COMMENCE
// PAR, le texte demande normalise. Exactement un candidat compatible =>
// selection autorisee ; 0 ou plusieurs => manuel, jamais un choix "au plus
// proche" invente.
export function matchConditionOption(
  requestedValue: string | null | undefined,
  candidates: ConditionOptionCandidate[]
): ConditionMatchResult {
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

// Mission "FINALISER ETAT : CONFIRMATION POST-SELECTION" (2026-08-13) :
// preuve live -- matching/clic fonctionnent (matchedTestId:"condition-2"
// correctement identifie et clique), mais readTriggerText() renvoie null
// sur [data-testid="category-condition-single-list-input"] apres la
// selection : outcome reste "click_not_confirmed_in_trigger" alors que la
// selection Vinted a probablement reussi. AUCUNE preuve live n'existe
// encore sur QUELLE propriete DOM porte reellement "Très bon état" une fois
// selectionne (input.value ? aria-valuetext ? texte d'un parent ? autre
// enfant ?) -- ne PAS deviner. Ce diagnostic capture TOUTES les sources
// plausibles en une seule fois pour trancher au prochain test live, sans
// modifier le matching/clic/selecteur d'option (hors perimetre de cette
// mission).
export interface ConditionTriggerAfterSelectionDiagnostic {
  triggerTagName: string | null;
  triggerType: string | null;
  valueProperty: string | null;
  valueAttribute: string | null;
  textContent: string | null;
  innerText: string | null;
  ariaLabel: string | null;
  ariaValueText: string | null;
  placeholder: string | null;
  outerHTML: string | null;
  parentTextContent: string | null;
  parentInnerText: string | null;
  parentOuterHTML: string | null;
}

const EMPTY_CONDITION_TRIGGER_DIAGNOSTIC: ConditionTriggerAfterSelectionDiagnostic = {
  triggerTagName: null,
  triggerType: null,
  valueProperty: null,
  valueAttribute: null,
  textContent: null,
  innerText: null,
  ariaLabel: null,
  ariaValueText: null,
  placeholder: null,
  outerHTML: null,
  parentTextContent: null,
  parentInnerText: null,
  parentOuterHTML: null,
};

// Purement observationnel -- ne decide de rien, ne remplace pas
// readTriggerText() (qui reste la source de confirmation active tant que
// aucune propriete fiable n'est prouvee en live, voir vinted-publish.ts).
export function describeConditionTriggerAfterSelection(triggerSelector: string): ConditionTriggerAfterSelectionDiagnostic {
  const trigger = document.querySelector<HTMLElement>(triggerSelector);
  if (!trigger) return { ...EMPTY_CONDITION_TRIGGER_DIAGNOSTIC };

  const inputEl = trigger as HTMLInputElement;
  const parent = trigger.parentElement;

  return {
    triggerTagName: trigger.tagName,
    triggerType: trigger.getAttribute("type"),
    valueProperty: typeof inputEl.value === "string" ? inputEl.value : null,
    valueAttribute: trigger.getAttribute("value"),
    textContent: trigger.textContent,
    innerText: trigger.innerText ?? null,
    ariaLabel: trigger.getAttribute("aria-label"),
    ariaValueText: trigger.getAttribute("aria-valuetext"),
    placeholder: trigger.getAttribute("placeholder"),
    outerHTML: trigger.outerHTML,
    parentTextContent: parent?.textContent ?? null,
    parentInnerText: parent?.innerText ?? null,
    parentOuterHTML: parent?.outerHTML ?? null,
  };
}
