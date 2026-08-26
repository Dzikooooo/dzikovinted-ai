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
import { logger } from "../background/logger";
import {
  PRICE_WRITER_INSTALLED_ATTR,
  PRICE_WRITE_REQUEST_EVENT,
  PRICE_WRITE_RESULT_EVENT,
  type PriceWriteRequestDetail,
  type PriceWriteResultDetail,
} from "./priceMainWorldWriter";

// Mission "ROUND SUIVANT -- AUDIT FOCUS PRIX" (2026-08-19) : identifiant
// lisible de `document.activeElement`, purement diagnostique -- aucune
// lecture ne modifie quoi que ce soit. Extrait ici (plutot que duplique)
// pour etre reutilise par publishSyntheticClickPoc.ts (POC diagnostique
// isole, jamais le flow normal).
export function describeActiveElement(): string {
  const el = document.activeElement;
  if (!el) return "null";
  const testId = el.getAttribute("data-testid");
  const id = (el as HTMLElement).id;
  return `${el.tagName}${id ? `#${id}` : ""}${testId ? `[data-testid="${testId}"]` : ""}`;
}

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


// Mission "SYNCHRONISATION DU TRACKER REACT" (2026-08-26) : React memorise la
// derniere valeur qu'il a vue dans un `_valueTracker` attache a l'element, et
// c'est a CELLE-LA qu'il compare pour decider s'il y a eu changement -- jamais
// a un relecture de el.value. Un champ ecrit par le setter du prototype peut
// donc rester "inchange" a ses yeux.
//
// Le tracker doit se retrouver avec une valeur DIFFERENTE de celle qu'on vient
// d'ecrire. La chaine vide convient dans le cas courant ; quand la valeur
// ecrite est elle-meme vide, il faut un sentinelle non vide, sinon React
// conclurait a l'absence de changement.
//
// Retourne l'etat reellement constate plutot qu'un booleen : au prochain run,
// "absent" et "reset" ne demandent pas le meme diagnostic.
// PREUVE LIVE 2026-08-26 : trackerState vaut "absent" en conditions reelles,
// et c'est ATTENDU -- ne pas le rediagnostiquer. vinted-publish.ts tourne dans
// le monde ISOLE (seul publishCreateResponseCaptureBoot.ts declare
// world:"MAIN", voir manifest.config.ts). `_valueTracker` est une propriete
// expando posee par React dans le monde PRINCIPAL : les deux mondes partagent
// le DOM mais pas les wrappers JS, donc elle est structurellement invisible
// ici. "absent" ne dit donc RIEN sur la presence reelle d'un tracker React.
//
// Corollaire, et c'est la bonne nouvelle : le meme cloisonnement fait que
// l'override de `value` pose par React sur l'element (monde principal) ne
// s'applique pas a nos ecritures (monde isole). Notre setter ne peut donc pas
// resynchroniser son tracker par accident -- il reste perime, ce qui est
// exactement ce qu'il faut pour que React detecte un changement. Le tracker
// n'a jamais ete le blocage.
//
// La fonction est CONSERVEE malgre tout : elle est sans effet de bord quand le
// tracker est inaccessible, et couvre le cas ou ce code serait un jour appele
// depuis un contexte en monde principal.
type ReactValueTrackerState = "reset" | "absent" | "unavailable";

function resetReactValueTracker(el: HTMLInputElement, writtenValue: string): ReactValueTrackerState {
  try {
    const tracker = (el as HTMLInputElement & { _valueTracker?: { setValue?: (v: string) => void } })._valueTracker;
    if (!tracker || typeof tracker.setValue !== "function") return "absent";
    tracker.setValue(writtenValue === "" ? "\u0001" : "");
    return "reset";
  } catch {
    return "unavailable";
  }
}

// Mission "ECRITURE DU PRIX EN MONDE MAIN" (2026-08-26) : demande au module
// monde MAIN (priceMainWorldWriter.ts) d'effectuer l'ecriture dans le contexte
// JS de React, et attend son accuse. Voir ce module pour la preuve live et la
// cause structurelle.
//
// Le selecteur est derive du data-testid de l'element pour que le monde MAIN
// retrouve EXACTEMENT le meme noeud (les deux mondes partagent le DOM mais pas
// les references JS -- un element ne peut pas etre transmis tel quel).
//
// Timeout court et repli obligatoire : si le module MAIN n'est pas installe
// (page hors /items/new, version d'extension partiellement rechargee), rien ne
// repondra jamais. On ne bloque pas le flux de publication pour autant.
const MAIN_WORLD_WRITE_TIMEOUT_MS = 1500;

async function writePriceViaMainWorld(el: HTMLInputElement, value: string): Promise<PriceWriteResultDetail | null> {
  const testId = el.getAttribute("data-testid");
  if (!testId) return null;
  if (!document.documentElement.hasAttribute(PRICE_WRITER_INSTALLED_ATTR)) return null;

  const requestId = crypto.randomUUID();
  return new Promise<PriceWriteResultDetail | null>((resolve) => {
    let settled = false;
    const finish = (result: PriceWriteResultDetail | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener(PRICE_WRITE_RESULT_EVENT, onResult);
      clearTimeout(timer);
      resolve(result);
    };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<PriceWriteResultDetail>).detail;
      // Correlation stricte : une reponse portant un autre requestId (ou
      // fabriquee par la page) n'est jamais prise pour la notre.
      if (!detail || detail.requestId !== requestId) return;
      finish(detail);
    };
    const timer = setTimeout(() => finish(null), MAIN_WORLD_WRITE_TIMEOUT_MS);

    document.addEventListener(PRICE_WRITE_RESULT_EVENT, onResult);
    document.dispatchEvent(
      new CustomEvent(PRICE_WRITE_REQUEST_EVENT, {
        detail: { requestId, selector: `[data-testid="${testId}"]`, value } satisfies PriceWriteRequestDetail,
      })
    );
  });
}

export async function typeIntoPriceField(el: HTMLInputElement, value: string, documentInstanceId?: string): Promise<void> {
  const fieldLabel = el.getAttribute("data-testid") ?? el.tagName;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;


  // Mission "ECRITURE ATOMIQUE DU PRIX" (2026-08-25) -- FIN DE LA FRAPPE
  // CARACTERE PAR CARACTERE. Preuve live decisive, apres deux correctifs
  // successifs sur la position d'insertion :
  //   domValueBefore "2,00 €"   valueWritten "24,00 €"   domValueAfter "NaN €"
  //
  // La valeur ecrite etait cette fois structurellement correcte -- et le
  // champ est quand meme passe a NaN. Ce n'etait donc jamais un probleme de
  // position : le composant rejette toute REECRITURE d'une valeur portant
  // deja les caracteres de son masque (virgule, espace insecable, "€"). Or
  // des le 1er chiffre, le masque formate -- donc toute frappe suivante
  // reinjecte du texte formate. La frappe incrementale est structurellement
  // incompatible avec ce composant.
  //
  // Nouvelle strategie : une seule ecriture ATOMIQUE de la valeur BRUTE
  // ("24", sans virgule, sans espace, sans symbole), et on laisse le masque
  // produire ",00 €" lui-meme. Le masque n'a alors plus jamais a interpreter
  // sa propre sortie.
  el.focus();
  el.select();

  // Mission "SYNCHRONISATION DU TRACKER REACT" (2026-08-26) -- PREUVE LIVE :
  // avec execCommand seul, le DOM restait stable a "24,00 €" (isNaN:false de
  // +100 a +600 ms) mais Vinted affichait "Le champ prix doit etre superieur
  // ou egal a 1.0". Le DOM etait donc correct et l'etat React vide : ecrire
  // dans le champ ne suffit pas, il faut que React VOIE le changement.
  //
  // React ne relit jamais el.value pour detecter une modification : il
  // compare a la valeur memorisee par son `_valueTracker` (installe sur
  // l'element). Ecrire via le setter du PROTOTYPE contourne le setter
  // surcharge par React, donc le tracker reste perime -- mais s'il a ete
  // resynchronise entre-temps, React conclut "aucun changement" et ignore
  // l'evenement input. Reinitialiser explicitement le tracker rend la
  // detection deterministe au lieu de dependre de cet etat.
  //
  // execCommand est ABANDONNE ici : il ecrivait correctement le DOM (et sa
  // chaine d'evenements native etait bien emise) mais ne touchait pas
  // davantage au tracker. Un seul chemin desormais, ce qui supprime aussi
  // l'ambiguite des deux sequences distinctes du round precedent.
  //
  // `change` n'est volontairement PAS emis : React synthetise son onChange a
  // partir de "input" pour un champ controle, et la trace live du round
  // precedent a montre que le `change` synthetique vidait le champ.
  const valueBeforeWrite = el.value;

  // Chemin PRINCIPAL depuis ce round : l'ecriture complete (setter, tracker,
  // input, change) est deleguee au monde MAIN, seul contexte ou l'etat interne
  // de React est reellement atteignable. Voir priceMainWorldWriter.ts.
  const mainWorldResult = await writePriceViaMainWorld(el, value);
  const writtenInMainWorld = mainWorldResult?.ok === true;
  let trackerState: ReactValueTrackerState = mainWorldResult?.trackerState ?? "unavailable";

  if (!writtenInMainWorld) {
    // Repli monde ISOLE, sequence INCHANGEE de ce round. Elle n'a jamais
    // suffi a valider le formulaire en conditions reelles -- elle reste
    // neanmoins le seul recours si le module MAIN n'est pas installe, et
    // laisse au moins le DOM dans un etat correct.
    setter?.call(el, value);
    trackerState = resetReactValueTracker(el, value);

    // Un `Event` generique ne porte ni inputType ni data -- un controleur de
    // formulaire qui lit ces champs l'ignore. On emet un InputEvent complet.
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: value.length > 0 ? "insertText" : "deleteContentBackward",
        data: value.length > 0 ? value : null,
      })
    );

    const changeEvent = new Event("change", { bubbles: true });
    el.dispatchEvent(changeEvent);
    console.log(`[ResellOS][STEP] CHANGE_EVENT`, { field: fieldLabel, domValueAfter: el.value });
  } else {
  }

  // el.blur() plutot qu'un FocusEvent fabrique : vraie operation de focus, qui
  // deplace reellement document.activeElement et emet blur PUIS focusout
  // nativement. Satisfait le besoin etabli le 2026-08-19 (React ecoute
  // focusout, pas blur -- sans quoi le POST partait avec price:null).
  //
  // Mission "CYCLE COMPLET EN MONDE MAIN" (2026-08-26) : SAUTE quand le monde
  // MAIN a deja blure. C'est la-bas que le blur compte -- seul le contexte JS
  // de React peut commiter la valeur dans l'etat du composant -- et un second
  // blur ici relancerait tout le cycle onBlur sur un champ deja quitte.
  if (mainWorldResult?.blurred === true) {
  } else {
    el.blur();
    console.log(`[ResellOS][STEP] NATIVE_BLUR`, { field: fieldLabel, domValueAfter: el.value });
  }

  console.log(`[ResellOS][STEP] FIELD_WRITTEN (ecriture atomique)`, {
    field: fieldLabel,
    value,
    writtenInMainWorld,
    trackerState,
    domValueAfter: el.value,
  });

  // Sonde CONSERVEE : `writtenInMainWorld` est le fait NOUVEAU a verifier au
  // prochain run -- il dit si l ecriture a bien eu lieu dans le contexte JS de
  // React, seul endroit ou son etat interne est atteignable.
  try {
    const write = {
      rawValueWritten: value,
      writtenInMainWorld,
      mainWorldReason: mainWorldResult?.reason ?? null,
      mainWorldBlurred: mainWorldResult?.blurred ?? false,
      trackerState,
      valueBeforeWrite,
      domValueAfter: el.value,
      documentInstanceId: documentInstanceId ?? null,
    };
    logger.info(`PRICE_ATOMIC_WRITE ${JSON.stringify(write)}`, write);
  } catch {
    /* sonde de diagnostic -- ne doit jamais interrompre l'ecriture */
  }
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
// Mission "ROUND PRIX + COLIS -- CORRECTIF NaN" (2026-08-19) : CAUSE
// CONFIRMEE en test live -- Vinted affichait "NaN €" apres republication.
// Mecanisme trace precisement : payload.price.toString() (vinted-publish.ts)
// n'a jamais verifie que payload.price est un nombre fini AVANT de le
// convertir en chaine -- NaN.toString() reussit silencieusement et retourne
// la chaine litterale "NaN" (contrairement a null/undefined, dont
// .toString() leverait une exception deja interceptee ailleurs), qui est
// alors tapee caractere par caractere par typeIntoPriceField(). Cette
// fonction devient desormais la source UNIQUE de normalisation, reutilisee a
// la fois pour lire l'etat DOM (comme avant) et pour valider payload.price
// AVANT toute frappe (nouveau) -- jamais deux logiques de parsing
// divergentes. Accepte desormais `number` en plus de `string` : rejette tout
// nombre non fini (NaN, Infinity, -Infinity) via Number.isFinite() plutot
// que le seul Number.isNaN() precedent (Infinity n'est pas NaN mais n'est
// pas plus une valeur de prix valide).
export function parsePriceToNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (!raw) return null; // chaine vide
  const normalized = raw
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");
  if (normalized === "") return null;
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
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
  // Agrege tous les signaux ci-dessus. found:false vaut desormais `false`
  // (voir mission ci-dessous) : le prix est obligatoire dans ce flow de
  // publication, un champ qu'on ne peut pas observer ne peut plus etre
  // suppose valide.
  valid: boolean;
}

// Mission "BUG CONFIRME -- readiness prix faussement positive" (2026-08-19) :
// CAUSE CONFIRMEE en test live -- apres typeIntoPriceField(), le champ prix
// peut se retrouver reellement VIDE en DOM (domValue:"", cf. PREFILL_PRICE)
// alors que priceInput.validity.valid reste `true` (Vinted ne cable
// apparemment pas de contrainte native sur un champ simplement vide, par
// opposition au cas "24,00 € rejete" deja traite plus haut) et qu'aucun
// aria-invalid/texte d'erreur n'est encore affiche (aucun submit tente).
// `valid` n'agregeait alors QUE des signaux de validation Vinted, jamais la
// valeur elle-meme -- PUBLISH_READY_TO_SUBMIT partait donc avec un prix
// reellement vide. `valid` exige maintenant EN PLUS un `parsedValue`
// reellement parsable et >= 1 (seuil Vinted reel, message "doit être
// supérieur ou égal à 1.0"). `parsePriceToNumber("")` retourne deja `null`
// (chaine vide falsy), donc `domValue:""` est deja couvert par ce seul
// check, aucune condition separee necessaire.
// Number.isFinite() explicite (defense en profondeur, demande explicite
// "refuser toute valeur non finie... avant readiness") : deja garanti par
// parsePriceToNumber() en amont (jamais NaN/Infinity au-dela de `null`),
// mais rend l'invariant evident ici sans dependre de le savoir.
function isPriceParsedAndAboveMinimum(parsedValue: number | null): boolean {
  return parsedValue !== null && Number.isFinite(parsedValue) && parsedValue >= 1;
}

export function describePriceValidationState(priceInput: HTMLInputElement | null): PriceValidationState {
  if (!priceInput) {
    // Le prix est un champ obligatoire dans ce flow -- un champ introuvable
    // ne peut plus etre suppose valide (voir mission ci-dessus).
    return { found: false, domValue: null, parsedValue: null, validityValid: null, validationMessage: null, ariaInvalid: null, errorTextFound: false, valid: false };
  }
  const domValue = priceInput.value;
  const parsedValue = parsePriceToNumber(domValue);
  const validityValid = priceInput.validity.valid;
  const validationMessage = priceInput.validationMessage || null;
  const ariaInvalid = priceInput.getAttribute("aria-invalid");
  const scope = priceInput.closest("form") ?? document.body;
  const errorTextFound = PRICE_ERROR_TEXT_PATTERN.test(scope.textContent ?? "");
  const valid = isPriceParsedAndAboveMinimum(parsedValue) && validityValid && ariaInvalid !== "true" && !errorTextFound;
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
