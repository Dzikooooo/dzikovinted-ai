// Logique de remplissage partagee entre vinted-publish.ts (creation,
// /items/new) et vinted-edit.ts (modification, /items/{id}/edit) --
// extraite ici quand le second appelant reel est apparu (Partie 4, sprint
// extension V1), pas avant : les deux formulaires partagent vraisemblablement
// le meme composant Vinted (categorie/marque/taille/etat/couleur/matiere
// identiques), donc la meme logique de remplissage doit rester en un seul
// endroit plutot que d'etre dupliquee et risquer de diverger.

import { waitForElement, waitForCondition } from "./domWait";
import { matchOption } from "./matchOption";
import * as sel from "./publishSelectors";

export class PublishError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
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
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

export async function fillTextFields(fields: { title: string; description: string; price: number }): Promise<void> {
  const titleInput = await waitForElement<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
  setNativeValue(titleInput, fields.title);

  const descriptionInput = await waitForElement<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
  setNativeValue(descriptionInput, fields.description);

  const priceInput = await waitForElement<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
  setNativeValue(priceInput, fields.price.toString());
}

function getCategoryOptions(): { id: string; text: string; el: HTMLElement }[] {
  const content = document.querySelector(sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR);
  if (!content) return [];
  return Array.from(content.querySelectorAll<HTMLElement>(`[id^="${sel.CATEGORY_ITEM_ID_PREFIX}"]`))
    .filter((el) => el.id !== "catalog-search-input")
    .map((el) => ({ id: el.id, text: (el.textContent ?? "").trim(), el }));
}

function isLeafCategoryReached(): boolean {
  return !!document.querySelector(sel.BRAND_DROPDOWN_TRIGGER_SELECTOR);
}

// Navigue l'arbre de categories Vinted en cliquant, a chaque niveau, sur
// l'option dont le texte correspond le mieux a categoryText, jusqu'a
// atteindre une categorie feuille (apparition de Marque/Taille/Etat) - ne
// devine jamais une branche sans correspondance texte.
//
// Cas edition (vinted-edit.ts) : contrairement a la creation (categorie
// toujours vide au depart), une annonce en cours d'edition a deja une
// categorie -- feuille (marque/taille/etat) deja presents dans le DOM AVANT
// toute navigation. Le premier controle isLeafCategoryReached() peut donc
// etre vrai immediatement, sans qu'aucun clic de navigation n'ait eu lieu :
// dans ce cas le panneau qu'on vient d'ouvrir (trigger.click() ci-dessus)
// doit etre explicitement referme plutot que laisse ouvert (risque
// d'interference avec les selecteurs suivants). Limite honnete : ceci ne
// verifie PAS que la categorie actuelle correspond a categoryText -- changer
// reellement la categorie d'une annonce deja publiee (depuis une feuille
// vers une autre) n'est pas gere par cette version, jamais teste en direct.
export async function resolveCategory(categoryText: string): Promise<void> {
  const trigger = await waitForElement<HTMLElement>(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR);
  trigger.click();
  await waitForElement(sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR);

  const MAX_DEPTH = 6;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (isLeafCategoryReached()) {
      if (depth === 0) document.body.click(); // panneau ouvert pour rien : le refermer
      return;
    }

    const options = getCategoryOptions();
    const match = matchOption(
      categoryText,
      options.map((o) => o.text)
    );
    if (!match) {
      throw new PublishError(
        "category_not_resolved",
        `Aucune catégorie Vinted ne correspond à "${categoryText}"`
      );
    }
    const optionEl = options.find((o) => o.text === match)!.el;
    optionEl.click();

    // Soit une nouvelle liste d'options apparait (niveau suivant), soit les
    // champs feuille apparaissent - attendre l'un ou l'autre plutot qu'un
    // delai fixe.
    await waitForCondition(() => isLeafCategoryReached() || getCategoryOptions().length > 0);
  }

  if (!isLeafCategoryReached()) {
    throw new PublishError("category_not_resolved", `Catégorie "${categoryText}" trop profonde ou ambiguë`);
  }
}

async function readOptionTexts(triggerSelector: string, contentSelector = sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR) {
  const trigger = await waitForElement<HTMLElement>(triggerSelector);
  trigger.click();
  const content = await waitForElement(contentSelector);
  const items = Array.from(content.querySelectorAll("li"));
  return { trigger, content, items, texts: items.map((li) => (li.textContent ?? "").trim()) };
}

// Selectionne une option dans un picker generique (marque/taille/etat/
// couleur) par correspondance texte contre les options REELLEMENT rendues
// (jamais une liste codee en dur, qui pourrait diverger du DOM reel).
export async function selectMatchingOption(
  triggerSelector: string,
  freeText: string | null,
  { required }: { required: boolean }
): Promise<void> {
  if (!freeText) {
    if (required) throw new PublishError("missing_required_field", "Champ obligatoire manquant");
    return;
  }

  const { items, texts } = await readOptionTexts(triggerSelector);
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
