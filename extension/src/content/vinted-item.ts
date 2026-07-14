// Injecte sur https://www.vinted.fr/items/{id} (annonce existante -- voir
// manifest.config.ts, exclude_matches ecarte /items/new). Import intelligent
// (sprint V1) : contrairement a vinted-profile.ts (lecture automatique
// autorisee), ceci n'envoie JAMAIS rien tant que l'utilisateur n'a pas
// cliqué explicitement sur le bouton injecté -- l'utilisateur garde
// toujours la validation finale (principe explicite du sprint).
//
// BUG REEL trouve le 2026-07-14 : le bouton pouvait disparaitre
// silencieusement (3 `return` sans aucun log dans init() : timeout ld+json,
// timeout selecteur de compte connecte, attribut alt absent). Chaque
// branche logue desormais explicitement pourquoi, et plus aucune ne
// s'arrete sans le dire -- demande explicite utilisateur : "jamais masquer
// silencieusement le bouton sans expliquer pourquoi".

import { waitForElement, WaitTimeoutError } from "./domWait";
import { LOGGED_IN_USERNAME_SELECTOR } from "./publishSelectors";
import {
  extractCondition,
  extractLdJsonProduct,
  extractMaterial,
  extractPhotoUrls,
  extractSize,
  extractVintedItemId,
} from "./itemSelectors";
import type { CheckItemLinkedResponse, ImportItemResponse, SingleItemPayload } from "../lib/messages";
import { errorMessage } from "../lib/errorMessage";

const BUTTON_ID = "resellos-import-button";
const STATUS_ID = "resellos-import-status";

function log(message: string, detail?: unknown): void {
  console.log(`[ResellOS][ImportButton]`, message, detail ?? "");
}

console.log("[ResellOS][ImportButton] content script loaded", { url: location.href, at: new Date().toISOString() });

const LABEL_IMPORT = "Importer dans ResellOS";
const LABEL_UPDATE = "Mettre à jour dans ResellOS";

function injectUI(initialLabel: string): { button: HTMLButtonElement; status: HTMLDivElement } {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:sans-serif;";

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.textContent = initialLabel;
  button.style.cssText =
    "background:#FFC400;color:#000;font-weight:700;font-size:13px;padding:10px 16px;border-radius:12px;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.25);";

  const status = document.createElement("div");
  status.id = STATUS_ID;
  status.style.cssText =
    "background:#1a1a1a;color:#fff;font-size:12px;padding:8px 12px;border-radius:10px;max-width:280px;display:none;box-shadow:0 4px 16px rgba(0,0,0,0.25);";

  container.appendChild(status);
  container.appendChild(button);
  document.body.appendChild(container);

  return { button, status };
}

function showStatus(status: HTMLDivElement, message: string, isError: boolean): void {
  status.textContent = message;
  status.style.display = "block";
  status.style.background = isError ? "#3f1414" : "#14231a";
  status.style.border = isError ? "1px solid #7f1d1d" : "1px solid #14532d";
  status.style.color = isError ? "#fca5a5" : "#86efac";
}

function buildPayload(vintedItemId: string): SingleItemPayload {
  const product = extractLdJsonProduct();
  return {
    vintedItemId,
    vintedUrl: location.href,
    title: product.title ?? document.title,
    description: product.description,
    price: product.price,
    brand: product.brand,
    category: product.category,
    color: product.color,
    size: extractSize(),
    condition: extractCondition(),
    material: extractMaterial(),
    imageUrls: extractPhotoUrls(),
  };
}

async function handleImportClick(
  button: HTMLButtonElement,
  status: HTMLDivElement,
  vintedUsername: string,
  vintedItemId: string
): Promise<void> {
  button.disabled = true;
  button.textContent = "Import en cours...";
  showStatus(status, "Extraction des informations de l'annonce...", false);

  const item = buildPayload(vintedItemId);
  log("envoi IMPORT_ITEM_REQUESTED", { vintedUsername, vintedItemId: item.vintedItemId });

  chrome.runtime.sendMessage(
    { type: "IMPORT_ITEM_REQUESTED", vintedUsername, item },
    (response: ImportItemResponse | undefined) => {
      button.disabled = false;

      if (chrome.runtime.lastError) {
        console.error("[ResellOS][ImportButton] chrome.runtime.lastError", chrome.runtime.lastError.message);
      }
      log("reponse IMPORT_ITEM_REQUESTED", response);

      if (!response) {
        button.textContent = LABEL_IMPORT;
        showStatus(status, "Aucune réponse de l'extension. Vérifie qu'elle est bien appairée.", true);
        return;
      }
      if (!response.ok) {
        console.error("[ResellOS][Import]", response.error);
        button.textContent = LABEL_IMPORT;
        showStatus(status, `Échec de l'import : ${response.error}`, true);
        return;
      }
      // Desormais lie (creation ou mise a jour reussie) : le bouton reflete
      // l'etat reel sans attendre un rechargement de page.
      button.textContent = LABEL_UPDATE;
      showStatus(status, response.created ? "Annonce importée dans ResellOS." : "Annonce mise à jour dans ResellOS.", false);
    }
  );
}

function checkItemAlreadyLinked(vintedUsername: string, vintedItemId: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "CHECK_ITEM_LINKED_REQUESTED", vintedUsername, vintedItemId },
      (response: CheckItemLinkedResponse | undefined) => {
        if (chrome.runtime.lastError) {
          log("CHECK_ITEM_LINKED_REQUESTED : chrome.runtime.lastError, on suppose non-lie", chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        if (!response || !response.ok) {
          log("CHECK_ITEM_LINKED_REQUESTED a echoue, on suppose non-lie (le clic re-verifiera reellement)", response);
          resolve(false);
          return;
        }
        resolve(response.linked);
      }
    );
  });
}

async function init(): Promise<void> {
  try {
    await waitForElement('script[type="application/ld+json"]', { timeoutMs: 8000 });
    log("item page detected");
  } catch (err) {
    if (err instanceof WaitTimeoutError) {
      log("button skipped : page non reconnue comme une fiche article (pas de script ld+json trouve sous 8s)");
      return;
    }
    console.error("[ResellOS][ImportButton] exception inattendue en attendant le ld+json", err);
    log("button skipped : exception inattendue", errorMessage(err));
    return;
  }

  const vintedItemId = extractVintedItemId(location.href);
  log("vinted item id", vintedItemId);
  if (!vintedItemId) {
    log("button skipped : impossible d'extraire l'id de l'annonce depuis l'URL", location.href);
    return;
  }

  // L'import doit toujours etre rattache au compte reellement connecte dans
  // cet onglet -- jamais devine. Si aucun compte n'est detecte (utilisateur
  // deconnecte), aucun bouton n'est injecte : rien a importer sans savoir
  // pour quel compte.
  let usernameEl: HTMLImageElement;
  try {
    usernameEl = await waitForElement<HTMLImageElement>(LOGGED_IN_USERNAME_SELECTOR, { timeoutMs: 5000 });
  } catch (err) {
    log("button skipped : selecteur de compte connecte introuvable sous 5s (utilisateur deconnecte ?)", errorMessage(err));
    return;
  }
  const vintedUsername = usernameEl.getAttribute("alt");
  log("account detected", vintedUsername);
  if (!vintedUsername) {
    log("button skipped : attribut alt absent sur l'element de compte connecte");
    return;
  }

  let alreadyLinked = false;
  try {
    alreadyLinked = await checkItemAlreadyLinked(vintedUsername, vintedItemId);
  } catch (err) {
    // Ne bloque jamais l'injection du bouton pour cette seule verification
    // annexe (libelle initial) -- le clic re-verifiera reellement l'etat
    // cote serveur de toute facon.
    console.error("[ResellOS][ImportButton] verification 'deja lie' a echoue", err);
  }
  log("already linked", alreadyLinked);

  const { button, status } = injectUI(alreadyLinked ? LABEL_UPDATE : LABEL_IMPORT);
  button.addEventListener("click", () => void handleImportClick(button, status, vintedUsername, vintedItemId));
  log("button injected", { label: alreadyLinked ? LABEL_UPDATE : LABEL_IMPORT });
}

void init();
