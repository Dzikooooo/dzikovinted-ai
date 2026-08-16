// Logique de detection PURE (lecture DOM sans aucun effet de bord chrome.*),
// extraite de vinted-publish.ts::watchForCategorySelectionAndPrefillAttributes
// pour rester testable sans mock chrome -- meme discipline que matchOption.ts/
// publishFieldSummary.ts/domWait.ts (voir leurs en-tetes).
//
// Mission "CATEGORY_SELECTION_NOT_DETECTED CONFIRME EN LIVE" (2026-08-12) :
// avant cette extraction, "categorie choisie" et "picker Etat rendu"
// n'etaient PAS distingues -- la meme apparition de CONDITION_LIST_TRIGGER_SELECTOR
// servait de preuve aux deux. Preuve live directe que c'est faux (categorie
// visiblement choisie sur Vinted, aucun trigger d'attribut jamais detecte en
// 10 minutes). Ces deux fonctions encodent desormais deux verifications
// INDEPENDANTES : hasCategoryChanged() ne regarde QUE le trigger categorie
// lui-meme, hasAnyAttributeTrigger() ne regarde QUE les 5 pickers d'attribut.

import { normalize } from "./matchOption";

export interface AttributeTriggerSelectors {
  brand: string;
  size: string;
  condition: string;
  color: string;
  material: string;
}

export interface AttributeTriggerPresence {
  brandTriggerFound: boolean;
  sizeTriggerFound: boolean;
  conditionTriggerFound: boolean;
  colorTriggerFound: boolean;
  materialTriggerFound: boolean;
}

// null si l'element est absent OU si son texte est vide -- un texte vide
// n'est pas une valeur exploitable pour detecter un changement.
export function readTriggerText(selector: string): string | null {
  const trigger = document.querySelector<HTMLElement>(selector);
  const text = trigger?.textContent?.trim();
  return text ? text : null;
}

// Mission "LIVE RETEST RESULTS -- FIX SIZE/COLOR CONFIRMATION + COLOR
// DROPDOWN CLOSURE" (2026-08-13) : preuve live directe -- pour Taille et
// Couleur, le trigger est un <input> dont readTriggerText() (textContent)
// est TOUJOURS vide (un <input> n'a pas de noeuds texte enfants), alors que
// le diagnostic field-specific deja construit montre valueProperty:"L"/
// "Bleu" correctement rempli. readTriggerText() ne peut structurellement
// jamais lire un <input> -- ce n'etait pas un echec de confirmation, c'etait
// la mauvaise source lue. Lecture DEDIEE, .value UNIQUEMENT si le trigger
// est reellement un <input> (jamais suppose pour un autre tagName) -- null
// sinon, pour que l'appelant sache explicitement retomber sur le repli
// existant (readTriggerText) plutot que de deviner.
export function readTriggerValue(selector: string): string | null {
  const trigger = document.querySelector<HTMLElement>(selector);
  if (!trigger || trigger.tagName !== "INPUT") return null;
  const value = (trigger as HTMLInputElement).value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface TriggerValueConfirmation {
  confirmed: boolean;
  observedValue: string | null;
}

// Mission "LIVE RETEST RESULTS -- FIX SIZE/COLOR CONFIRMATION + COLOR
// DROPDOWN CLOSURE" (2026-08-13) : extrait de vinted-publish.ts pour rester
// testable sans mock chrome, meme discipline que le reste de ce fichier.
// Ordre de preuve DOM-grounded, minimal :
// 1) si readTriggerValue() renvoie une valeur (trigger reellement un
//    <input>), comparaison en EGALITE STRICTE normalisee -- jamais
//    d'inclusion ("XL".includes("L") est vrai, confirmerait faussement "L"
//    depuis "XL", regression explicitement interdite par la mission).
// 2) sinon (pas un input, ou .value vide), repli EXISTANT INCHANGE
//    (readTriggerText(), egal-ou-contient) -- comportement deja utilise par
//    Etat et le chemin generique, jamais touche par cette fonction.
export function confirmTriggerValue(triggerSelector: string, matchedValue: string): TriggerValueConfirmation {
  const inputValue = readTriggerValue(triggerSelector);
  if (inputValue !== null) {
    return { confirmed: normalize(inputValue) === normalize(matchedValue), observedValue: inputValue };
  }

  const textValue = readTriggerText(triggerSelector);
  if (!textValue) return { confirmed: false, observedValue: null };
  const normalizedText = normalize(textValue);
  const normalizedMatch = normalize(matchedValue);
  return { confirmed: normalizedText === normalizedMatch || normalizedText.includes(normalizedMatch), observedValue: textValue };
}

export function readAttributeTriggerPresence(selectors: AttributeTriggerSelectors): AttributeTriggerPresence {
  return {
    brandTriggerFound: !!document.querySelector(selectors.brand),
    sizeTriggerFound: !!document.querySelector(selectors.size),
    conditionTriggerFound: !!document.querySelector(selectors.condition),
    colorTriggerFound: !!document.querySelector(selectors.color),
    materialTriggerFound: !!document.querySelector(selectors.material),
  };
}

// Une categorie est consideree "choisie" quand le texte du trigger a
// reellement change par rapport a sa valeur AVANT toute selection --
// jamais uniquement "non vide" (un texte deja present au depart, ex. un
// libelle statique, ne doit jamais se faire passer pour une selection).
export function hasCategoryChanged(currentText: string | null, initialText: string | null): boolean {
  return currentText !== null && currentText !== initialText;
}

export function hasAnyAttributeTrigger(presence: AttributeTriggerPresence): boolean {
  return Object.values(presence).some(Boolean);
}

// Mission "CORRIGER LA DETECTION POST-SELECTION MANUELLE DE CATEGORIE"
// (2026-08-12) : preuve live directe -- categoryTriggerFound:true mais
// currentCategoryText:null AVANT ET APRES une selection humaine reelle
// ("Polos" visible sur Vinted, jamais lu par readTriggerText()). La lecture
// texte du trigger categorie ne fonctionne donc pas (cause exacte non
// confirmee sans capture DOM -- voir describeCategoryTriggerDom ci-dessous),
// alors que la TRANSITION "aucun trigger d'attribut -> au moins un present"
// EST observee de façon fiable au meme instant. Deux chemins de detection
// desormais implementes, dans cet ordre de priorite :
// 1) category_value_changed : le texte du trigger categorie a change
//    (fonctionnera automatiquement si readTriggerText() se met a lire une
//    vraie valeur un jour, aucune modification requise ici).
// 2) attribute_controls_appeared : repli structurel, valide PAR LA PREUVE
//    LIVE elle-meme -- ne se declenche QUE sur une transition reelle
//    (initial.hadAnyAttributeTrigger === false ET current en a au moins un),
//    jamais sur un etat deja present au demarrage (protection faux-positif
//    explicitement demandee -- voir le test "attributs deja presents a
//    l'etat initial").
export type CategoryDetectionMethod = "category_value_changed" | "attribute_controls_appeared";

export interface CategoryDetectionState {
  categoryText: string | null;
  attributesPresent: AttributeTriggerPresence;
}

export interface CategoryDetectionInitialState {
  categoryText: string | null;
  hadAnyAttributeTrigger: boolean;
}

export function detectCategorySelection(
  current: CategoryDetectionState,
  initial: CategoryDetectionInitialState
): CategoryDetectionMethod | null {
  if (hasCategoryChanged(current.categoryText, initial.categoryText)) {
    return "category_value_changed";
  }
  if (!initial.hadAnyAttributeTrigger && hasAnyAttributeTrigger(current.attributesPresent)) {
    return "attribute_controls_appeared";
  }
  return null;
}

// Diagnostic DEV-only PUREMENT observationnel (aucune decision dessus) :
// dump la structure REELLE de l'element trouve par CATEGORY_DROPDOWN_TRIGGER_SELECTOR,
// pour que le prochain test live revele OU se trouve reellement "Polos" dans
// le DOM (texte enfant profond, attribut aria, propriete .value d'un input
// cache, etc.) -- jamais devine ici, jamais de recherche globale du texte.
export interface CategoryTriggerDomDiagnostic {
  found: boolean;
  tagName: string | null;
  textContent: string | null;
  innerText: string | null;
  value: string | null;
  ariaLabel: string | null;
  ariaValueText: string | null;
  title: string | null;
  role: string | null;
  dataTestId: string | null;
  childCount: number | null;
  outerHTML: string | null;
}

const OUTER_HTML_MAX_LENGTH = 500;

export function describeCategoryTriggerDom(selector: string): CategoryTriggerDomDiagnostic {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) {
    return {
      found: false,
      tagName: null,
      textContent: null,
      innerText: null,
      value: null,
      ariaLabel: null,
      ariaValueText: null,
      title: null,
      role: null,
      dataTestId: null,
      childCount: null,
      outerHTML: null,
    };
  }
  const valueProp = "value" in el ? String((el as unknown as { value?: unknown }).value ?? "") : null;
  const outer = el.outerHTML ?? "";
  return {
    found: true,
    tagName: el.tagName,
    textContent: el.textContent,
    innerText: el.innerText ?? null,
    value: valueProp,
    ariaLabel: el.getAttribute("aria-label"),
    ariaValueText: el.getAttribute("aria-valuetext"),
    title: el.getAttribute("title"),
    role: el.getAttribute("role"),
    dataTestId: el.getAttribute("data-testid"),
    childCount: el.children.length,
    outerHTML: outer.length > OUTER_HTML_MAX_LENGTH ? `${outer.slice(0, OUTER_HTML_MAX_LENGTH)}…` : outer,
  };
}
