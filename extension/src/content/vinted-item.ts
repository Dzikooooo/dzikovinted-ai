// Injecte sur https://www.vinted.fr/items/{id} (annonce existante -- voir
// manifest.config.ts, exclude_matches ecarte /items/new). Import intelligent
// (sprint V1) : contrairement a vinted-profile.ts (lecture automatique
// autorisee), ceci n'envoie JAMAIS rien tant que l'utilisateur n'a pas
// cliqué explicitement sur le bouton injecté -- l'utilisateur garde
// toujours la validation finale (principe explicite du sprint).

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
import type { ImportItemResponse, SingleItemPayload } from "../lib/messages";

const BUTTON_ID = "resellos-import-button";
const STATUS_ID = "resellos-import-status";

function injectUI(): { button: HTMLButtonElement; status: HTMLDivElement } {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:sans-serif;";

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.textContent = "Importer dans ResellOS";
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

async function handleImportClick(button: HTMLButtonElement, status: HTMLDivElement, vintedUsername: string): Promise<void> {
  const vintedItemId = extractVintedItemId(location.href);

  if (!vintedItemId) {
    showStatus(status, "Impossible d'identifier cette annonce.", true);
    return;
  }

  button.disabled = true;
  button.textContent = "Import en cours...";
  showStatus(status, "Extraction des informations de l'annonce...", false);

  const item = buildPayload(vintedItemId);

  chrome.runtime.sendMessage(
    { type: "IMPORT_ITEM_REQUESTED", vintedUsername, item },
    (response: ImportItemResponse | undefined) => {
      button.disabled = false;
      button.textContent = "Importer dans ResellOS";

      if (!response) {
        showStatus(status, "Aucune réponse de l'extension. Vérifie qu'elle est bien appairée.", true);
        return;
      }
      if (!response.ok) {
        showStatus(status, `Échec de l'import : ${response.error}`, true);
        return;
      }
      showStatus(status, response.created ? "Annonce importée dans ResellOS." : "Annonce mise à jour dans ResellOS.", false);
    }
  );
}

async function init(): Promise<void> {
  try {
    await waitForElement('script[type="application/ld+json"]', { timeoutMs: 8000 });
  } catch (err) {
    if (err instanceof WaitTimeoutError) return; // page pas reconnue comme une fiche article, rien a faire
    throw err;
  }

  // L'import doit toujours etre rattache au compte reellement connecte dans
  // cet onglet -- jamais devine. Si aucun compte n'est detecte (utilisateur
  // deconnecte), aucun bouton n'est injecte : rien a importer sans savoir
  // pour quel compte.
  let usernameEl: HTMLImageElement;
  try {
    usernameEl = await waitForElement<HTMLImageElement>(LOGGED_IN_USERNAME_SELECTOR, { timeoutMs: 5000 });
  } catch {
    return;
  }
  const vintedUsername = usernameEl.getAttribute("alt");
  if (!vintedUsername) return;

  const { button, status } = injectUI();
  button.addEventListener("click", () => void handleImportClick(button, status, vintedUsername));
}

void init();
