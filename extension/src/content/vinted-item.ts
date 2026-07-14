// Injecte sur https://www.vinted.fr/items/{id} (annonce existante -- voir
// manifest.config.ts, exclude_matches ecarte /items/new et /items/*/edit).
// Import intelligent (sprint V1) : contrairement a vinted-profile.ts
// (lecture automatique autorisee), ceci n'envoie JAMAIS rien tant que
// l'utilisateur n'a pas cliqué explicitement sur le bouton injecté --
// l'utilisateur garde toujours la validation finale.
//
// BUG REEL trouve le 2026-07-14 (bouton absent sur une annonce reelle,
// sans aucune explication) : deux causes distinctes trouvees et corrigees.
// 1) init() avait des `return` totalement silencieux (aucun log avant).
// 2) plus important, ARCHITECTURAL, pas juste un manque de logs : la
//    visibilite du bouton etait bloquee derriere waitForElement du bloc
//    <script type="application/ld+json"> (jusqu'a 8s) -- alors que
//    extractVintedItemId() (voir itemSelectors.ts) est un pur regex sur
//    l'URL, sans AUCUNE dependance au DOM. Si le ld+json rend lentement
//    (ou pas du tout) sur une annonce donnee, le bouton ne pouvait jamais
//    apparaitre alors que rien n'empechait de l'afficher. Le ld+json n'est
//    desormais lu qu'AU CLIC (buildPayload), jamais pour decider si la
//    page est une fiche article -- cette decision se fait uniquement sur
//    hostname/pathname (synchrone, zero dependance DOM).
//
// Journalisation deterministe demandee explicitement le 2026-07-14 :
// aucune etape ne peut plus se terminer sans logger SUCCESS ou FAILED
// juste avant, et toute exception inattendue est capturee et loguee
// (jamais de disparition silencieuse du script ni du bouton).

import { waitForElement } from "./domWait";
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

console.log("[ResellOS][ImportButton] script injected", {
  URL: location.href,
  readyState: document.readyState,
  pathname: location.pathname,
  hostname: location.hostname,
});

const BUTTON_ID = "resellos-import-button";
const STATUS_ID = "resellos-import-status";
const LABEL_IMPORT = "Importer dans ResellOS";
const LABEL_IMPORT_OFFLINE = "Importer dans ResellOS (hors ligne)";
const LABEL_UPDATE = "Mettre à jour dans ResellOS";

function log(step: string, outcome: "SUCCESS" | "FAILED", detail?: unknown): void {
  console.log(`[ResellOS][ImportButton] ${step} : ${outcome}`, detail ?? "");
}

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
  console.log("[ResellOS][ImportButton] envoi IMPORT_ITEM_REQUESTED", { vintedUsername, vintedItemId: item.vintedItemId });

  chrome.runtime.sendMessage(
    { type: "IMPORT_ITEM_REQUESTED", vintedUsername, item },
    (response: ImportItemResponse | undefined) => {
      button.disabled = false;

      if (chrome.runtime.lastError) {
        console.error("[ResellOS][ImportButton] chrome.runtime.lastError", chrome.runtime.lastError.message);
      }
      console.log("[ResellOS][ImportButton] reponse IMPORT_ITEM_REQUESTED", response);

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
      button.textContent = LABEL_UPDATE;
      showStatus(status, response.created ? "Annonce importée dans ResellOS." : "Annonce mise à jour dans ResellOS.", false);
    }
  );
}

function checkItemAlreadyLinked(vintedUsername: string, vintedItemId: string): Promise<{ ok: true; linked: boolean } | { ok: false }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "CHECK_ITEM_LINKED_REQUESTED", vintedUsername, vintedItemId },
      (response: CheckItemLinkedResponse | undefined) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          resolve({ ok: false });
          return;
        }
        resolve({ ok: true, linked: response.linked });
      }
    );
  });
}

async function init(): Promise<void> {
  // Etape 1 : DOM ready. run_at:"document_idle" (manifest.config.ts) le
  // garantit deja, mais on le verifie/logue quand meme (demande explicite :
  // aucune etape implicite non-loguee).
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
  }
  log("1. DOM ready", "SUCCESS", { readyState: document.readyState });

  // Etape 2 : hostname. Le manifest garantit deja vinted.fr, mais on le
  // verifie explicitement plutot que de le supposer silencieusement.
  if (location.hostname !== "www.vinted.fr") {
    log("2. Verification hostname", "FAILED", { hostname: location.hostname, attendu: "www.vinted.fr" });
    return;
  }
  log("2. Verification hostname", "SUCCESS", { hostname: location.hostname });

  // Etape 3 : pathname. Decision "page article valide" purement
  // synchrone (regex sur l'URL), plus AUCUNE dependance a un element du
  // DOM (voir commentaire d'en-tete -- c'etait le vrai bug).
  const isItemPage = /^\/items\/\d+/.test(location.pathname);
  if (!isItemPage) {
    log("3. Verification pathname", "FAILED", { pathname: location.pathname, attendu: "/items/{id}" });
    return;
  }
  log("3. Verification pathname", "SUCCESS", { pathname: location.pathname });

  // Etape 4 : extraction itemId (pur regex sur l'URL, zero dependance DOM).
  const vintedItemId = extractVintedItemId(location.href);
  if (!vintedItemId) {
    log("4. Extraction itemId", "FAILED", { href: location.href });
    return;
  }
  log("4. Extraction itemId", "SUCCESS", { vintedItemId });

  // Etape 5 : extraction username (compte Vinted connecte dans cet
  // onglet). Necessite une attente DOM reelle (l'en-tete peut rendre apres
  // le reste de la page) -- seule etape qui garde un waitForElement.
  let vintedUsername: string | null = null;
  try {
    const usernameEl = await waitForElement<HTMLImageElement>(LOGGED_IN_USERNAME_SELECTOR, { timeoutMs: 5000 });
    vintedUsername = usernameEl.getAttribute("alt");
  } catch (err) {
    log("5. Extraction username", "FAILED", { raison: "selecteur introuvable sous 5s (deconnecte ?)", err: errorMessage(err) });
    return;
  }
  if (!vintedUsername) {
    log("5. Extraction username", "FAILED", { raison: "element trouve mais attribut alt absent" });
    return;
  }
  log("5. Extraction username", "SUCCESS", { vintedUsername });

  // Etape 6 : container d'injection (document.body doit exister -- garanti
  // en pratique a document_idle, verifie quand meme explicitement).
  if (!document.body) {
    log("6. Verification container d'injection", "FAILED", { raison: "document.body absent" });
    return;
  }
  log("6. Verification container d'injection", "SUCCESS");

  // Etape 7 : annonce deja liee ? Verification annexe, JAMAIS bloquante --
  // en cas d'echec (offline, session expiree, erreur reseau...), le bouton
  // doit quand meme apparaitre (demande explicite : "jamais rien" plutot
  // qu'un echec silencieux), avec un libelle honnete indiquant que l'etat
  // "deja importe ou non" n'a pas pu etre verifie.
  const linkCheck = await checkItemAlreadyLinked(vintedUsername, vintedItemId);
  let initialLabel: string;
  if (!linkCheck.ok) {
    log("7. Verification annonce deja liee", "FAILED", { raison: "verification impossible (reseau/session), le bouton s'affiche quand meme" });
    initialLabel = LABEL_IMPORT_OFFLINE;
  } else {
    log("7. Verification annonce deja liee", "SUCCESS", { dejaLiee: linkCheck.linked });
    initialLabel = linkCheck.linked ? LABEL_UPDATE : LABEL_IMPORT;
  }

  // Etape 8 : injection du bouton.
  const { button, status } = injectUI(initialLabel);
  button.addEventListener("click", () => void handleImportClick(button, status, vintedUsername!, vintedItemId));
  log("8. Injection du bouton", "SUCCESS", { label: initialLabel });
}

void (async () => {
  try {
    await init();
  } catch (e) {
    console.error("[ResellOS][ImportButton][FATAL]", e);
    // Meme sur une exception totalement inattendue, ne jamais laisser
    // l'utilisateur sans aucun moyen d'agir : bouton de secours minimal,
    // honnete sur le fait qu'une erreur a ete rencontree au chargement.
    try {
      if (document.body && !document.getElementById(BUTTON_ID)) {
        const { button, status } = injectUI("Importer dans ResellOS (erreur au chargement)");
        showStatus(status, `Erreur au chargement : ${errorMessage(e)}. Recharge la page avant de reessayer.`, true);
        button.addEventListener("click", () => {
          showStatus(status, `Le chargement a echoue (${errorMessage(e)}) -- recharge la page.`, true);
        });
      }
    } catch (fallbackErr) {
      console.error("[ResellOS][ImportButton][FATAL] meme le bouton de secours a echoue", fallbackErr);
    }
  }
})();
