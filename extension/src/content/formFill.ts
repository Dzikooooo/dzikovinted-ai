// Logique de remplissage partagee entre vinted-publish.ts (creation,
// /items/new) et vinted-edit.ts (modification, /items/{id}/edit) --
// extraite ici quand le second appelant reel est apparu (Partie 4, sprint
// extension V1), pas avant : les deux formulaires partagent vraisemblablement
// le meme composant Vinted (categorie/marque/taille/etat/couleur/matiere
// identiques), donc la meme logique de remplissage doit rester en un seul
// endroit plutot que d'etre dupliquee et risquer de diverger.

import { waitForElement } from "./domWait";
import { matchOption } from "./matchOption";
import * as sel from "./publishSelectors";

export class PublishError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// dispatchFullClick (2026-07-25, correctif reel apres echec confirme du
// champ marque) : element.click() natif ne dispatch QUE l'evenement "click"
// -- jamais pointerdown/mousedown/pointerup/mouseup. Preuve disponible sans
// nouveau diagnostic : sur le DOM reel inspecte par l'utilisateur,
// __reactEvents$... du <input> "brand-select-dropdown-input" ne liste aucun
// handler click/mousedown directement sur ce noeud (seulement
// "invalid_bubble", la validation HTML native) -- le vrai gestionnaire
// d'ouverture vit ailleurs dans l'arbre (icone soeur role="button", ou
// delegation au conteneur parent), et de nombreux composants de ce type
// (non natifs, ici visiblement le design system "core" de Vinted) ouvrent
// sur mousedown plutot que click, precisement pour gerer proprement le clic
// exterieur qui referme le menu. bubbles:true pour atteindre un eventuel
// handler delegue plus haut dans l'arbre.
export function dispatchFullClick(el: HTMLElement): void {
  const pointerInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: 1,
  };
  const mouseInit: MouseEventInit = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1 };

  el.dispatchEvent(new PointerEvent("pointerdown", pointerInit));
  el.dispatchEvent(new MouseEvent("mousedown", mouseInit));
  el.dispatchEvent(new PointerEvent("pointerup", { ...pointerInit, buttons: 0 }));
  el.dispatchEvent(new MouseEvent("mouseup", { ...mouseInit, buttons: 0 }));
  el.dispatchEvent(new MouseEvent("click", { ...mouseInit, buttons: 0 }));
}

// Mission "LIVE RETEST RESULTS -- FIX SIZE/COLOR CONFIRMATION + COLOR
// DROPDOWN CLOSURE" (2026-08-13) : preuve live directe -- apres une
// selection Couleur reussie ("Bleu" correctement stocke, visible sur
// Vinted), le dropdown restait visuellement ouvert. Un appui MANUEL sur
// Echap l'a ferme SANS desselectionner "Bleu" -- Escape est donc une
// fermeture live-confirmee sure APRES une selection reussie. keydown ET
// keyup emis (comme dispatchFullClick emet toute la sequence pointer/mouse)
// -- certains gestionnaires de fermeture ecoutent l'un ou l'autre, jamais
// verifie lequel precisement pour ce composant.
export function dispatchEscapeKey(el: Element): void {
  const keyInit: KeyboardEventInit = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new KeyboardEvent("keydown", keyInit));
  el.dispatchEvent(new KeyboardEvent("keyup", keyInit));
}

// Positionne la valeur d'un champ controle React : passer par le setter
// natif puis emettre "input" bouillonnant, seule methode fiable pour qu'un
// input controle par React detecte le changement (assigner .value
// directement est ignore par React).
//
// BUG REEL suspecte le 2026-07-13 (prix modifie dans ResellOS jamais
// reporte sur Vinted, sans erreur visible -- le formulaire se soumettait
// "avec succes" mais gardait l'ancien prix) : "input" seul suffit pour la
// plupart des champs, mais un champ prix/monetaire reformate ou valide
// tres souvent sur "change"/"blur" plutot que sur "input" seul (masque de
// devise, arrondi...) -- si Vinted fait ca, notre ecriture restait
// visuellement correcte dans le DOM mais jamais "confirmee" par l'etat
// interne React avant le clic sur Enregistrer. Ajoute "change" et "blur"
// en plus de "input" : ne peut pas casser un champ qui n'ecoutait dejà
// que "input", ne peut qu'aider un champ qui a besoin de plus.
// Confirmation explicite de chaque evenement disparu (demande 2026-07-16 :
// "je veux savoir precisement laquelle de ces etapes ne se produit
// jamais") -- dispatchEvent() est synchrone et ne peut pas "echouer"
// silencieusement en soi, mais un handler React qui leve une exception
// PEUT interrompre la propagation avant les evenements suivants sans que
// rien ne le signale ailleurs. Logue donc explicitement avant/apres
// chaque dispatch, tag identique quel que soit l'appelant (publish ou
// edit) puisque c'est la meme fonction partagee.
// onEvent (2026-07-22, demande explicite -- audit branche titre) : callback
// optionnel invoque apres CHAQUE dispatch (succes ou exception), pour que
// l'appelant puisse journaliser dans le canal PERSISTE (chrome.storage.local)
// avec un nom d'etape specifique au champ (ex. TITLE_INPUT_EVENT) sans
// dupliquer les dispatchEvent() ci-dessous. Aucun callback fourni = aucun
// changement de comportement (typeIntoPriceField/le flux prix ne passent
// jamais par cette fonction, fillTextFields ne fournit pas ce parametre).
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  onEvent?: (eventName: "input" | "change" | "blur", detail: { ok: boolean; domValueAfter: string; error?: string }) => void
): void {
  const fieldLabel = el.getAttribute("data-testid") ?? el.tagName;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  console.log(`[ResellOS][STEP] FIELD_VALUE_SET`, { field: fieldLabel, value, domValueAfterSetter: el.value });

  try {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    console.log(`[ResellOS][STEP] INPUT_EVENT`, { field: fieldLabel, domValueAfter: el.value });
    onEvent?.("input", { ok: true, domValueAfter: el.value });
  } catch (err) {
    console.error(`[ResellOS][STEP] INPUT_EVENT leve une exception`, { field: fieldLabel, err });
    onEvent?.("input", { ok: false, domValueAfter: el.value, error: String(err) });
  }

  try {
    el.dispatchEvent(new Event("change", { bubbles: true }));
    console.log(`[ResellOS][STEP] CHANGE_EVENT`, { field: fieldLabel, domValueAfter: el.value });
    onEvent?.("change", { ok: true, domValueAfter: el.value });
  } catch (err) {
    console.error(`[ResellOS][STEP] CHANGE_EVENT leve une exception`, { field: fieldLabel, err });
    onEvent?.("change", { ok: false, domValueAfter: el.value, error: String(err) });
  }

  try {
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    console.log(`[ResellOS][STEP] BLUR_EVENT`, { field: fieldLabel, domValueAfter: el.value });
    onEvent?.("blur", { ok: true, domValueAfter: el.value });
  } catch (err) {
    console.error(`[ResellOS][STEP] BLUR_EVENT leve une exception`, { field: fieldLabel, err });
    onEvent?.("blur", { ok: false, domValueAfter: el.value, error: String(err) });
  }
}

// Deduit le KeyboardEvent.code plausible pour un caractere du prix (chiffres
// et separateur decimal uniquement -- payload.price.toString() ne produit
// jamais autre chose). Purement cosmetique pour le realisme de la sequence
// synthetique -- rien dans Vinted n'est suppose lire ce champ precis pour
// valider quoi que ce soit, mais autant rester fidele a ce qu'un vrai
// clavier produirait.
function deriveKeyCodeForDigitChar(char: string): string {
  if (/^[0-9]$/.test(char)) return `Digit${char}`;
  if (char === ".") return "Period";
  if (char === ",") return "Comma";
  return "";
}

// Mission "ROUND PRIX -- micro-test synthetique complet" (2026-08-17) :
// reproduit la sequence EXACTE d'evenements observee en direct pour une
// vraie frappe humaine (TEST B, PRICE_INPUT_EVENT_TRACE) -- keydown ->
// keypress -> beforeinput -> input -> keyup pour un caractere insere.
// EXPERIMENTAL : isTrusted reste TOUJOURS false sur ces evenements
// synthetiques (propriete native du navigateur, jamais falsifiable depuis
// JavaScript, voir waitForTrustedClick ailleurs dans ce projet) -- ce
// correctif teste UNIQUEMENT l'hypothese "sequence d'evenements
// incomplete", jamais l'hypothese isTrusted (qui reste structurellement
// invalidable depuis un content script).
function dispatchPriceCharacterInsertSequence(
  el: HTMLInputElement,
  setter: ((this: HTMLInputElement, v: string) => void) | undefined,
  char: string,
  valueAfter: string
): void {
  const keyInit: KeyboardEventInit = { key: char, code: deriveKeyCodeForDigitChar(char), bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", keyInit));
  el.dispatchEvent(new KeyboardEvent("keypress", keyInit));
  el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: char }));
  setter?.call(el, valueAfter);
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }));
  el.dispatchEvent(new KeyboardEvent("keyup", keyInit));
}

// Meme mission -- sequence d'effacement (Backspace) EXACTEMENT comme
// specifiee : keydown Backspace -> beforeinput deleteContentBackward ->
// input deleteContentBackward -> keyup Backspace. Deliberement SANS
// keypress (absent de la sequence humaine specifiee pour l'effacement --
// coherent avec le comportement des navigateurs reels, qui n'emettent
// jamais keypress pour une touche non imprimable).
function dispatchPriceClearSequence(el: HTMLInputElement, setter: ((this: HTMLInputElement, v: string) => void) | undefined): void {
  const keyInit: KeyboardEventInit = { key: "Backspace", code: "Backspace", bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", keyInit));
  el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" }));
  setter?.call(el, "");
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  el.dispatchEvent(new KeyboardEvent("keyup", keyInit));
}

// Ecriture par frappe caractere par caractere, reservee au champ PRIX de
// la page d'edition (/items/{id}/edit) -- BUG REEL demontre en test manuel
// direct le 2026-07-16 : setNativeValue() (ecriture "98" en un seul bloc,
// puis un seul jeu d'evenements input/change/blur) VIDE silencieusement ce
// champ precis (passe de "99,00 €" a "") au lieu de le reformater --
// reproduit deux fois depuis un etat frais. Le composant de prix de cette
// page semble exiger un flux de frappes incrementales (comme un vrai
// utilisateur) plutot qu'un remplacement en bloc pour recalculer son
// masque de devise correctement. Verifie en test manuel direct : la meme
// sequence (selection totale, suppression, puis un evenement input par
// caractere ajoute) produit fidelement "98,00 €", stable apres blur.
// N'affecte QUE ce champ -- titre/description/autres champs continuent
// d'utiliser setNativeValue (jamais reproduit comme fautif ailleurs).
//
// Mission "ROUND PRIX -- micro-test synthetique complet" (2026-08-17) :
// CAUSE PROBABLE identifiee par comparaison live directe -- le prix ecrit
// par ResellOS s'affiche correctement ("24,00 €") mais est refuse au
// submit, alors qu'une frappe humaine identique est acceptee. La trace
// live (PRICE_INPUT_EVENT_TRACE) montre que la frappe humaine emet
// keydown/keypress/beforeinput/input/keyup pour CHAQUE caractere, alors que
// l'ancienne version de cette fonction n'emettait qu'un seul "input" par
// caractere (aucun evenement clavier). Cette version reproduit la sequence
// complete -- si Vinted accepte desormais le prix sans retape humaine, la
// cause etait la sequence incomplete ; si le refus persiste malgre une
// sequence identique, isTrusted (impossible a produire depuis ce contexte)
// est isole comme verrou principal.
export async function typeIntoPriceField(el: HTMLInputElement, value: string): Promise<void> {
  const fieldLabel = el.getAttribute("data-testid") ?? el.tagName;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  el.focus();
  el.setSelectionRange(0, el.value.length);
  dispatchPriceClearSequence(el, setter);
  console.log(`[ResellOS][STEP] FIELD_CLEARED (frappe simulee)`, { field: fieldLabel, domValueAfter: el.value });

  let current = "";
  for (const char of value) {
    current += char;
    dispatchPriceCharacterInsertSequence(el, setter, char, current);
    // Delai court entre chaque caractere : laisse le composant Vinted
    // (masque de devise controle) traiter chaque frappe individuellement
    // plutot que de recevoir plusieurs evenements synchrones empiles avant
    // tout re-render -- comportement observe necessaire en test manuel.
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  console.log(`[ResellOS][STEP] FIELD_TYPED (frappe simulee)`, { field: fieldLabel, value, domValueAfter: el.value });

  el.dispatchEvent(new Event("change", { bubbles: true }));
  console.log(`[ResellOS][STEP] CHANGE_EVENT`, { field: fieldLabel, domValueAfter: el.value });
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  console.log(`[ResellOS][STEP] BLUR_EVENT`, { field: fieldLabel, domValueAfter: el.value });
}

// Mission "BRAND SEARCH INPUT LOCATOR" (2026-08-16) : les 3 tentatives
// precedentes (setNativeValue en bloc, frappe caractere par caractere,
// puis + keydown/keyup) ciblaient TOUTES BRAND_DROPDOWN_TRIGGER_SELECTOR --
// preuve live directe (diagnostic dedie, listener document/capture) que ce
// trigger ne recoit JAMAIS de frappe, meme humaine reelle (readonly, voir
// son DOM). Cause du blocage : mauvais element cible depuis le debut, pas
// une sequence d'evenements insuffisante. Le vrai champ de recherche est
// #brand-search-input (BRAND_SEARCH_INPUT_SELECTOR, publishSelectors.ts),
// un input SEPARE monte dans le panneau une fois ouvert. Technique
// CONFIRMEE EN DIRECT sur CE champ precis (test manuel isole avant
// implementation) : setter natif + UN SEUL InputEvent("input",
// inputType:"insertText") suffit a declencher le filtrage reel Vinted --
// aucune frappe caractere par caractere ni evenement clavier necessaire ici
// (contrairement a l'hypothese precedente, qui s'averait fausse parce que
// testee sur le mauvais element). Remplace typeIntoBrandSearchField
// (supprimee, plus jamais appelee -- ciblait un element dont on sait
// desormais qu'il ne peut structurellement pas recevoir de frappe).
//
// Deliberement SANS "blur" (comme l'ancienne version) : le champ de
// recherche Marque fait partie d'un dropdown encore OUVERT -- le flou
// fermerait tres probablement ce dropdown avant que le clic sur le
// resultat filtre puisse avoir lieu.
export function typeIntoBrandSearchInput(el: HTMLInputElement, value: string): void {
  const fieldLabel = el.getAttribute("data-testid") ?? el.id ?? el.tagName;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  setter?.call(el, value);
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  console.log(`[ResellOS][STEP] BRAND_SEARCH_INPUT_TYPED (frappe simulee)`, { field: fieldLabel, value, domValueAfter: el.value });
}

// Mission "REPUBLICATION FIDELE" (2026-08-11) : extrait de vinted-edit.ts
// (fonction locale non exportee jusqu'ici, deja live-testee sur ce meme
// champ prix cote edit_listing -- voir son commentaire "bug reel demontre en
// test manuel direct le 2026-07-16"). Le champ prix Vinted reformate sa
// valeur affichee ("24" -> "24,00") synchroniquement des les evenements
// input/change/blur (voir setNativeValue) -- une comparaison de chaines
// stricte compare alors "24" (attendu) a "24,00" (reellement affiche APRES
// le reformatage) et rapporte a tort un echec, meme quand l'ecriture a
// parfaitement reussi (cause du faux negatif observe en direct sur
// vinted-publish.ts, mission "diagnostic final PHOTOS + CATEGORIE").
export function parsePriceToNumber(raw: string | null): number | null {
  if (!raw) return null;
  const normalized = raw
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");
  if (normalized === "") return null;
  const value = parseFloat(normalized);
  return Number.isNaN(value) ? null : value;
}

// Mission "REPUBLICATION VINTED : BUG PRIX + FAUX READY_TO_SUBMIT" (2026-08-16) :
// CAUSE CONFIRMEE par preuve live directe -- "24,00 €" reellement AFFICHE dans
// le champ (donc parsePriceToNumber() ci-dessus confirme deja une egalite
// stricte avec la valeur demandee) alors que Vinted affiche simultanement
// "Le champ prix doit être supérieur ou égal à 1.0" et que ResellOS annoncait
// pourtant "Tout est prêt". La comparaison de VALEUR AFFICHEE seule ne prouve
// donc plus rien : elle peut rester correcte visuellement (reformatage
// cosmetique de Vinted) alors que l'etat de validation INTERNE du champ reste
// invalide (ex. Vinted appelle setCustomValidity() sur ce meme <input> quand
// le montant qu'il a reellement parse est hors bornes -- mecanisme standard,
// fonctionne quel que soit le type de l'input, contrairement a min/max qui ne
// s'appliquent qu'aux inputs type=number). Cette fonction agrege TOUS les
// signaux de preuve reels explicitement autorises par la mission (validity.
// valid, aria-invalid, disparition du message d'erreur) plutot qu'une simple
// comparaison de chaine -- source UNIQUE de verite reutilisee a la fois par
// la confirmation de remplissage (vinted-publish.ts::fillTextFieldsWithConfirmation)
// et par la readiness (vinted-publish.ts::watchForPublishReadiness, via
// publishReadiness.ts), jamais deux logiques divergentes.
//
// PRICE_ERROR_TEXT_PATTERN : texte EXACT rapporte en direct par l'utilisateur
// (pas invente) -- signal de secours purement textuel, jamais la seule
// condition (valid exige AUSSI validity.valid et l'absence d'aria-invalid),
// pour rester robuste si Vinted ne cable pas setCustomValidity() sur ce champ
// precis. Recherche scopee au <form> englobant (jamais tout le document) pour
// ne jamais confondre une erreur affichee sur un AUTRE champ.
const PRICE_ERROR_TEXT_PATTERN = /doit être (supérieur|supérieure) ou égal/i;

export interface PriceValidationState {
  found: boolean;
  domValue: string | null;
  parsedValue: number | null;
  validityValid: boolean | null; // null uniquement si l'element est introuvable
  validationMessage: string | null;
  ariaInvalid: string | null;
  errorTextFound: boolean;
  // Agrege tous les signaux ci-dessus -- found:false vaut `true` (permissif :
  // impossible de prouver une erreur sur un champ qu'on ne peut pas observer,
  // jamais transforme en blocage indefini de la readiness pour ce cas).
  valid: boolean;
}

export function describePriceValidationState(priceInput: HTMLInputElement | null): PriceValidationState {
  if (!priceInput) {
    return { found: false, domValue: null, parsedValue: null, validityValid: null, validationMessage: null, ariaInvalid: null, errorTextFound: false, valid: true };
  }
  const domValue = priceInput.value;
  const parsedValue = parsePriceToNumber(domValue);
  const validityValid = priceInput.validity.valid;
  const validationMessage = priceInput.validationMessage || null;
  const ariaInvalid = priceInput.getAttribute("aria-invalid");
  const scope = priceInput.closest("form") ?? document.body;
  const errorTextFound = PRICE_ERROR_TEXT_PATTERN.test(scope.textContent ?? "");
  const valid = validityValid && ariaInvalid !== "true" && !errorTextFound;
  return { found: true, domValue, parsedValue, validityValid, validationMessage, ariaInvalid, errorTextFound, valid };
}

export async function fillTextFields(fields: { title: string; description: string; price: number }): Promise<void> {
  const titleInput = await waitForElement<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
  setNativeValue(titleInput, fields.title);

  const descriptionInput = await waitForElement<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
  setNativeValue(descriptionInput, fields.description);

  const priceInput = await waitForElement<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
  setNativeValue(priceInput, fields.price.toString());
}

// Automatisation abandonnee (2026-07-26, preuve directe en test live,
// instrumentation dediee) : l'ouverture de ce picker exige un evenement
// isTrusted:true (un vrai clic utilisateur). Log reel compare cote a cote --
// sequence synthetique (dispatchFullClick, focus(), sur le trigger ou son
// conteneur .c-input__content) : isTrusted:false, panneau jamais ouvert (3
// tests consecutifs). Clic REEL de l'utilisateur sur ce MEME trigger :
// isTrusted:true, panneau catalog-select-dropdown-content insere ~75ms
// apres. isTrusted est une propriete calculee nativement par le navigateur,
// jamais modifiable depuis du JavaScript -- dispatchEvent() et .click()
// produisent tous deux isTrusted:false, sans exception, quel que soit
// l'element cible ou la sequence d'evenements. Aucune automatisation ne
// peut donc jamais ouvrir ce picker precis -- meme contrainte, deja
// rencontree et documentee, que le bouton "Valider" (voir le commentaire
// d'en-tete de vinted-edit.ts). Ancienne logique de navigation dans l'arbre
// (getCategoryOptions/isLeafCategoryReached/boucle MAX_DEPTH) retiree :
// jamais atteignable puisque le panneau ne s'ouvre jamais automatiquement.
export async function resolveCategory(categoryText: string): Promise<void> {
  throw new PublishError(
    "category_requires_manual_selection",
    `Vinted exige un clic réel pour ouvrir le sélecteur de catégorie (même contrainte que le bouton Valider) : impossible à automatiser. Sélectionne toi-même la catégorie "${categoryText}" dans l'onglet Vinted, puis clique sur Valider.`
  );
}

// contentSelector n'a plus de valeur par defaut (2026-07-25, bug reel
// confirme en test live sur le champ marque) : un defaut implicite sur
// CATEGORY_DROPDOWN_CONTENT_SELECTOR etait silencieusement reutilise pour
// TOUS les pickers (marque/taille/etat/couleur/matiere) par
// selectMatchingOption, qui ne le passait jamais explicitement -- alors que
// chaque champ a son propre conteneur avec son propre data-testid (verifie
// en direct pour la marque : "brand-select-dropdown-content", distinct de
// celui de la categorie). Rendre ce parametre obligatoire force chaque
// appelant a etre explicite plutot que de deviner silencieusement.
// Mission "FINIR LES CHAMPS MANQUANTS" (2026-08-11) : exportee (etait privee)
// pour permettre a vinted-publish.ts de reutiliser TELLE QUELLE cette
// mecanique d'ouverture/lecture DEJA prouvee en production (edit_listing),
// sans dupliquer sa logique ni toucher a selectMatchingOption() (dont le
// comportement/signature restent inchanges pour edit_listing).
// Mission "CORRIGER LES ATTRIBUTS POST-CATEGORIE" (2026-08-12) : `triggerTimeoutMs`
// AJOUTE (optionnel, defaut inchange -- 8000ms via waitForElement) -- preuve
// live directe : sur /items/new, le trigger ETAT/TAILLE echoue en
// "trigger_not_found" alors que MARQUE (3e champ tente dans la meme
// sequence, donc ~16s+ apres la selection de categorie) reussit -- signal
// fort que ces triggers ne sont pas absents mais rendus plus tardivement
// (chargement asynchrone specifique a la categorie choisie cote Vinted),
// jamais confirme en direct comme un probleme de selecteur errone. Elargir
// CE timeout precis (appele uniquement par la reprise post-categorie) laisse
// selectMatchingOption()/edit_listing totalement inchanges (aucun appel
// existant ne passe ce parametre).
// Mission "STOPPER LE DEBUG EN BOUCLE" (2026-08-12) : preuve directe, a LA
// FRONTIERE meme ou l'argument pourrait se perdre (mauvais parametre
// positionnel, valeur non transmise...), de ce que cette fonction a
// REELLEMENT recu -- DEV uniquement (import.meta.env.DEV, meme convention
// que le reste du projet, Lot 0) pour ne jamais alourdir les logs de
// production ordinaires.
//
// Mission "REPUBLICATION VINTED : CORRIGER LES 5 ATTRIBUTS APRES CATEGORIE"
// (2026-08-12) : BUG REEL CONFIRME PAR LECTURE DE CODE (pas une hypothese) --
// `triggerTimeoutMs` n'etait applique QU'AU PREMIER waitForElement (le
// trigger). Le SECOND, `waitForElement(contentSelector)` juste en dessous,
// n'a jamais recu ce parametre et retombait donc TOUJOURS sur le defaut de
// domWait.ts (8000ms), meme quand l'appelant demandait explicitement 20000ms.
// Explique exactement le symptome live : conditionTriggerFound:true (le
// PREMIER wait reussit, quasi instantane car l'element existe deja) mais
// l'erreur finale porte toujours "8000ms" -- c'est le wait du CONTENU du
// dropdown qui echouait, pas celui du trigger, mais le catch de l'appelant
// (vinted-publish.ts) etiquetait a tort les deux "trigger_not_found". Les
// deux waits partagent desormais le meme `triggerTimeoutMs` (le nom du
// parametre reste, mais s'applique maintenant identiquement aux deux
// etapes -- pas de nouveau parametre distinct, aucune raison de traiter le
// contenu differemment du trigger).
//
// `onStep` (nouveau, optionnel) : callback appele a chaque etape franchie
// AVANT de savoir si la suite va reussir -- meme pattern deja etabli dans ce
// fichier pour `setNativeValue()` (`onEvent`). Permet a l'appelant (ici
// vinted-publish.ts) de distinguer PRECISEMENT "trigger jamais trouve" de
// "trigger trouve + clic tente mais contenu jamais apparu" de "contenu
// trouve mais 0 options" -- au lieu d'un seul message generique. Aucun appel
// existant (selectMatchingOption, jamais modifie) ne passe ce parametre :
// comportement d'edit_listing rigoureusement inchange.
export type ReadOptionTextsStep = "trigger_found" | "trigger_click_attempted" | "dropdown_content_found" | "options_read";

export async function readOptionTexts(
  triggerSelector: string,
  contentSelector: string,
  triggerTimeoutMs?: number,
  onStep?: (step: ReadOptionTextsStep, detail: Record<string, unknown>) => void
) {
  if (import.meta.env.DEV) {
    console.log("[ResellOS] READ_OPTION_TEXTS_CONFIG", { triggerSelector, contentSelector, receivedTriggerTimeoutMs: triggerTimeoutMs });
  }
  const timeoutOptions = triggerTimeoutMs ? { timeoutMs: triggerTimeoutMs } : {};

  const trigger = await waitForElement<HTMLElement>(triggerSelector, timeoutOptions);
  onStep?.("trigger_found", { triggerSelector });

  // dispatchFullClick (pas trigger.click()) : voir le commentaire de la
  // fonction -- un simple .click() natif n'a jamais ouvert le dropdown
  // marque en test reel (timeout confirme sur son contenu, pourtant
  // correctement cible par son selecteur).
  dispatchFullClick(trigger);
  onStep?.("trigger_click_attempted", { triggerSelector });

  const content = await waitForElement(contentSelector, timeoutOptions);
  onStep?.("dropdown_content_found", { contentSelector });

  const items = Array.from(content.querySelectorAll("li"));
  onStep?.("options_read", { contentSelector, optionsCount: items.length });

  return { trigger, content, items, texts: items.map((li) => (li.textContent ?? "").trim()) };
}

// Selectionne une option dans un picker generique (marque/taille/etat/
// couleur) par correspondance texte contre les options REELLEMENT rendues
// (jamais une liste codee en dur, qui pourrait diverger du DOM reel).
export async function selectMatchingOption(
  triggerSelector: string,
  contentSelector: string,
  freeText: string | null,
  { required }: { required: boolean }
): Promise<void> {
  if (!freeText) {
    if (required) throw new PublishError("missing_required_field", "Champ obligatoire manquant");
    return;
  }

  const { items, texts } = await readOptionTexts(triggerSelector, contentSelector);
  const match = matchOption(freeText, texts);
  if (!match) {
    if (required) {
      throw new PublishError("attribute_not_resolved", `Aucune correspondance pour "${freeText}"`);
    }
    // Best-effort pour les champs optionnels : on ferme le picker sans rien
    // selectionner plutot que d'inventer une valeur.
    document.body.click();
    return;
  }
  const index = texts.indexOf(match);
  items[index].click();
}

export async function verifyLoggedInAccount(expectedUsername: string): Promise<void> {
  const avatar = await waitForElement<HTMLImageElement>(sel.LOGGED_IN_USERNAME_SELECTOR);
  const actualUsername = avatar.getAttribute("alt");
  if (actualUsername !== expectedUsername) {
    throw new PublishError(
      "account_mismatch",
      `Le compte connecté sur Vinted ("${actualUsername ?? "inconnu"}") ne correspond pas au compte sélectionné ("${expectedUsername}")`
    );
  }
}
