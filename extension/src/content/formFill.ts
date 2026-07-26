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
export async function typeIntoPriceField(el: HTMLInputElement, value: string): Promise<void> {
  const fieldLabel = el.getAttribute("data-testid") ?? el.tagName;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  el.focus();
  el.setSelectionRange(0, el.value.length);
  setter?.call(el, "");
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  console.log(`[ResellOS][STEP] FIELD_CLEARED (frappe simulee)`, { field: fieldLabel, domValueAfter: el.value });

  let current = "";
  for (const char of value) {
    current += char;
    setter?.call(el, current);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
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
async function readOptionTexts(triggerSelector: string, contentSelector: string) {
  const trigger = await waitForElement<HTMLElement>(triggerSelector);
  // dispatchFullClick (pas trigger.click()) : voir le commentaire de la
  // fonction -- un simple .click() natif n'a jamais ouvert le dropdown
  // marque en test reel (timeout confirme sur son contenu, pourtant
  // correctement cible par son selecteur).
  dispatchFullClick(trigger);
  const content = await waitForElement(contentSelector);
  const items = Array.from(content.querySelectorAll("li"));
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
