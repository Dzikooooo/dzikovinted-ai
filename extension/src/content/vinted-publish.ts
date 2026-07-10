// Injecte sur https://www.vinted.fr/items/new (voir manifest.config.ts).
// Phase 3.1 (publication) : remplit et soumet le formulaire de creation
// d'annonce Vinted a partir d'une commande recue du background. Premiere
// action d'ECRITURE reelle de l'extension (contrairement a vinted-profile.ts,
// purement lecture) - toujours declenchee par une commande explicite,
// jamais d'initiative propre (voir EXTENSION.md §8).
//
// Selecteurs verifies en direct le 2026-07-10 (compte matleshop) - voir
// publishSelectors.ts pour le detail et les points encore a confirmer en
// test live (liste complete des etats, comportement exact de l'upload
// photo, bandeau d'erreur Vinted).

import { waitForElement, waitForCondition, WaitTimeoutError } from "./domWait";
import { matchOption } from "./matchOption";
import * as sel from "./publishSelectors";
import { isContentCommand } from "../lib/messages";
import type { PublishListingPayload, PublishStep, RunActionOutcome } from "../lib/messages";

function reportProgress(step: PublishStep): void {
  chrome.runtime.sendMessage({ type: "PUBLISH_PROGRESS", step });
}

function reportResult(outcome: RunActionOutcome): void {
  chrome.runtime.sendMessage({ type: "PUBLISH_RESULT", outcome });
}

// Positionne la valeur d'un champ controle React : passer par le setter
// natif puis emettre un evenement "input" bouillonnant, seule methode
// fiable pour qu'un input controle par React detecte le changement
// (assigner .value directement est ignore par React).
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function fillTextFields(payload: PublishListingPayload): Promise<void> {
  const titleInput = await waitForElement<HTMLInputElement>(sel.TITLE_INPUT_SELECTOR);
  setNativeValue(titleInput, payload.title);

  const descriptionInput = await waitForElement<HTMLTextAreaElement>(sel.DESCRIPTION_INPUT_SELECTOR);
  setNativeValue(descriptionInput, payload.description);

  const priceInput = await waitForElement<HTMLInputElement>(sel.PRICE_INPUT_SELECTOR);
  setNativeValue(priceInput, payload.price.toString());
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
// l'option dont le texte correspond le mieux a listing.category, jusqu'a
// atteindre une categorie feuille (apparition de Marque/Taille/Etat) - ne
// devine jamais une branche sans correspondance texte.
async function resolveCategory(categoryText: string): Promise<void> {
  const trigger = await waitForElement<HTMLElement>(sel.CATEGORY_DROPDOWN_TRIGGER_SELECTOR);
  trigger.click();
  await waitForElement(sel.CATEGORY_DROPDOWN_CONTENT_SELECTOR);

  const MAX_DEPTH = 6;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (isLeafCategoryReached()) return;

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
async function selectMatchingOption(
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

async function selectPackageSize(packageSize: PublishListingPayload["packageSize"]): Promise<void> {
  // Assomption a confirmer en test live : 1=petit, 2=moyen, 3=grand (ordre
  // d'affichage observe, pas garanti par un attribut explicite).
  const n = packageSize === "small" ? 1 : packageSize === "medium" ? 2 : 3;
  const cell = await waitForElement<HTMLElement>(sel.PACKAGE_SIZE_CELL_SELECTOR(n as 1 | 2 | 3));
  cell.click();
}

async function injectPhotos(imageUrls: string[]): Promise<void> {
  if (imageUrls.length === 0) return;

  const files: File[] = [];
  for (const url of imageUrls) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new PublishError("invalid_photo", `Échec de récupération d'une photo (${url})`);
    }
    if (!response.ok) {
      throw new PublishError("invalid_photo", `Échec de récupération d'une photo (${url})`);
    }
    const blob = await response.blob();
    const name = url.split("/").pop() || "photo.jpg";
    files.push(new File([blob], name, { type: blob.type || "image/jpeg" }));
  }

  const input = await waitForElement<HTMLInputElement>(sel.ADD_PHOTOS_INPUT_SELECTOR);
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));

  // Attend l'apparition d'autant de vignettes que de photos envoyees -
  // technique et selecteur exact de vignette a confirmer en test live
  // (repli documente dans le plan : simulation d'un evenement "drop" sur
  // DROPZONE_SELECTOR si "change" ne declenche pas l'upload React).
  await waitForCondition(() => {
    const grid = document.querySelector(sel.MEDIA_UPLOAD_GRID_SELECTOR);
    return !!grid && grid.querySelectorAll("img").length >= files.length;
  }, { timeoutMs: 30000 });
}

async function submitListing(): Promise<{ vintedItemId: string; vintedUrl: string }> {
  const saveButton = await waitForElement<HTMLButtonElement>(sel.SAVE_BUTTON_SELECTOR);
  await waitForCondition(() => !saveButton.disabled && saveButton.getAttribute("aria-disabled") !== "true");
  saveButton.click();

  // Attend soit une redirection vers /items/{id} (succes), soit un bandeau
  // d'erreur Vinted (selecteur exact a confirmer en test live - non observe
  // durant l'analyse, aucune soumission n'ayant ete tentee).
  await waitForCondition(() => /\/items\/\d+/.test(location.pathname), { timeoutMs: 20000 });

  const match = location.pathname.match(/\/items\/(\d+)/);
  if (!match) {
    throw new PublishError("vinted_validation_error", "Vinted n'a pas confirmé la création de l'annonce");
  }
  return { vintedItemId: match[1], vintedUrl: location.href };
}

class PublishError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function verifyLoggedInAccount(expectedUsername: string): Promise<void> {
  const avatar = await waitForElement<HTMLImageElement>(sel.LOGGED_IN_USERNAME_SELECTOR);
  const actualUsername = avatar.getAttribute("alt");
  if (actualUsername !== expectedUsername) {
    throw new PublishError(
      "account_mismatch",
      `Le compte connecté sur Vinted ("${actualUsername ?? "inconnu"}") ne correspond pas au compte sélectionné ("${expectedUsername}")`
    );
  }
}

async function runPublish(payload: PublishListingPayload): Promise<void> {
  try {
    reportProgress("connecting");
    await waitForElement(sel.TITLE_INPUT_SELECTOR);
    await verifyLoggedInAccount(payload.expectedVintedUsername);

    reportProgress("filling_form");
    await fillTextFields(payload);
    await resolveCategory(payload.category);
    await selectMatchingOption(sel.CONDITION_LIST_TRIGGER_SELECTOR, payload.condition, { required: true });
    await selectMatchingOption(sel.SIZE_GRID_TRIGGER_SELECTOR, payload.size, { required: false });
    await selectMatchingOption(sel.BRAND_DROPDOWN_TRIGGER_SELECTOR, payload.brand, { required: false });
    await selectMatchingOption(sel.COLOR_DROPDOWN_TRIGGER_SELECTOR, payload.color, { required: false });
    await selectMatchingOption(sel.MATERIAL_LIST_TRIGGER_SELECTOR, payload.material, { required: false });
    await selectPackageSize(payload.packageSize);

    reportProgress("uploading_photos");
    await injectPhotos(payload.imageUrls);

    reportProgress("publishing");
    const { vintedItemId, vintedUrl } = await submitListing();

    reportResult({ status: "success", resultPayload: { vintedItemId, vintedUrl } });
  } catch (err) {
    if (err instanceof WaitTimeoutError) {
      // Une session expirée redirige typiquement vers une page de
      // connexion - heuristique sur l'URL, a confirmer/affiner en test live
      // (motif exact de la page de login Vinted non observé durant
      // l'analyse, aucune déconnexion testée).
      const looksLikeLoginPage = /\/(login|auth)/i.test(location.pathname);
      reportResult({
        status: "error",
        errorMessage: looksLikeLoginPage
          ? "Session Vinted expirée, reconnecte-toi sur vinted.fr"
          : "La page Vinted n'a pas répondu à temps",
      });
      return;
    }
    if (err instanceof PublishError) {
      reportResult({ status: "error", errorMessage: err.message });
      return;
    }
    reportResult({ status: "error", errorMessage: err instanceof Error ? err.message : String(err) });
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (!isContentCommand(message)) return false;
  if (message.type === "PUBLISH_LISTING") {
    void runPublish(message.payload);
  }
  return false;
});
