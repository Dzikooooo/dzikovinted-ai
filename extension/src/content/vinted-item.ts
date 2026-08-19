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

import { waitForElement, waitForCondition, waitForElementMatching } from "./domWait";
import { LOGGED_IN_USERNAME_SELECTOR } from "./publishSelectors";
import {
  extractCondition,
  extractLdJsonProduct,
  extractMaterial,
  extractPhotoUrls,
  extractSize,
  extractVintedItemId,
} from "./itemSelectors";
import { dispatchFullClick } from "./formFill";
import {
  DELETE_CONFIRM_TEXT,
  DELETE_MODAL_HEADING_TEXT,
  DELETE_TRIGGER_TEXT,
  findDeleteConfirmButton,
  findDeleteTriggerButton,
  isDeleteConfirmationModalVisible,
} from "./deleteFlowSelectors";
import { isContentCommand } from "../lib/messages";
import type {
  AutoEnrichResponse,
  CheckItemLinkedResponse,
  DeleteCommandResponse,
  DeleteListingPayload,
  ImportItemResponse,
  SingleItemPayload,
} from "../lib/messages";
import { errorMessage } from "../lib/errorMessage";

console.log("[ResellOS][ImportButton] script injected", {
  URL: location.href,
  readyState: document.readyState,
  pathname: location.pathname,
  hostname: location.hostname,
});

// Mission "DIAGNOSTIC LIVE MINIMAL -- SUPPRESSION DE A" (2026-08-17) :
// identifiant unique PAR EXECUTION de ce module (meme pattern que
// DOCUMENT_INSTANCE_ID dans vinted-publish.ts) -- permet de distinguer, dans
// les logs du prochain test live, "plusieurs handleDeleteListing() concurrents
// dans le meme document" (hypothese A de l'audit) de "documents/onglets
// distincts". Purement diagnostique, aucune decision metier ne depend de
// cette valeur.
const DOCUMENT_INSTANCE_ID = crypto.randomUUID();

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

// Enrichissement lazy sans UI (audit "prefill partiel", 2026-08-11) : reagit
// a AUTO_ENRICH_REQUESTED envoye par handlePublishListing.ts (background) a
// un onglet ouvert en arriere-plan sur la page de l'annonce d'ORIGINE d'une
// republication -- reutilise buildPayload()/extractVintedItemId() a
// l'IDENTIQUE du chemin "clic sur Importer" ci-dessus (zero nouvelle logique
// d'extraction), mais ne touche jamais au DOM (aucun bouton injecte) et ne
// depend d'aucune interaction utilisateur : ce script tourne dans un onglet
// que l'utilisateur n'a jamais lui-meme ouvert ni ne voit necessairement.
function extractCurrentItemId(): string | null {
  if (location.hostname !== "www.vinted.fr") return null;
  if (!/^\/items\/\d+/.test(location.pathname)) return null;
  return extractVintedItemId(location.href);
}

async function handleAutoEnrichRequested(): Promise<AutoEnrichResponse> {
  const vintedItemId = extractCurrentItemId();
  if (!vintedItemId) {
    return { ok: false, error: "Page annonce Vinted non reconnue (hostname/pathname inattendus)" };
  }

  let vintedUsername: string | null = null;
  try {
    const usernameEl = await waitForElement<HTMLImageElement>(LOGGED_IN_USERNAME_SELECTOR, { timeoutMs: 5000 });
    vintedUsername = usernameEl.getAttribute("alt");
  } catch (err) {
    return { ok: false, error: `Compte Vinted non detecte : ${errorMessage(err)}` };
  }
  if (!vintedUsername) {
    return { ok: false, error: "Compte Vinted non detecte (attribut alt absent)" };
  }

  return { ok: true, item: buildPayload(vintedItemId), vintedUsername };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isContentCommand(message) || message.type !== "AUTO_ENRICH_REQUESTED") return false;
  void handleAutoEnrichRequested().then(sendResponse);
  return true; // reponse asynchrone : garder le canal ouvert
});

// Mission "REPUBLICATION : DIAGNOSTIC LIVE SUPPRESSION ANCIENNE ANNONCE
// VINTED" (2026-08-17) : contrairement a AUTO_ENRICH_REQUESTED ci-dessus
// (reponse rapide via sendResponse), cette commande peut attendre jusqu'a
// 90s un clic humain reel -- fire-and-forget + messages separes
// (DELETE_PROGRESS/DELETE_RESULT), meme discipline que EDIT_LISTING
// (vinted-edit.ts) pour la meme raison (un port sendMessage n'est pas fait
// pour rester ouvert aussi longtemps).
function reportDeleteProgress(step: import("../lib/messages").DeleteStep): void {
  chrome.runtime.sendMessage({ type: "DELETE_PROGRESS", step, documentInstanceId: DOCUMENT_INSTANCE_ID });
}

function reportDeleteResult(outcome: import("../lib/messages").DeleteListingOutcome): void {
  chrome.runtime.sendMessage({ type: "DELETE_RESULT", outcome, documentInstanceId: DOCUMENT_INSTANCE_ID });
}

// Attente courte du bloc ld+json AVANT de chercher le bouton "Supprimer" --
// distingue "annonce deja absente/retiree" (aucune donnee produit des le
// rendu complet) de "bouton pas encore rendu" (cas normal, couvert par
// waitForElementMatching juste apres). Meme delai (10s) et meme mecanisme
// (MutationObserver, jamais un sleep fixe) que readLdJsonForVerification
// (editListing.ts), deja valide en direct pour cette page.
function waitForLdJsonSettled(timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const hasProductData = () => extractLdJsonProduct().price !== null;
    if (hasProductData()) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      if (hasProductData()) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

// Attend un evenement "click" REEL (isTrusted:true) sur l'element resolu par
// `resolveElement`, jusqu'a `timeoutMs`. isTrusted est une propriete native
// du navigateur, jamais falsifiable par du JavaScript (synthetique ou non)
// -- seul signal fiable pour distinguer un vrai clic utilisateur d'un effet
// de bord quelconque (navigation, re-render, disparition DOM) qui n'a rien a
// voir avec une action de l'utilisateur.
//
// BUG REEL confirme en test live (mission "ROUND DELETE CONFIRM -- reference
// figee", 2026-08-19) : le clic humain reel a bien ete traite par Vinted
// (navigation vers /member/{userId} observee), mais jamais detecte ici --
// confirm_click_timeout apres 90s. Cause racine : le listener etait attache
// DIRECTEMENT sur la reference DOM `confirmButton` capturee une seule fois
// avant l'attente (potentiellement longue, jusqu'a 90s). Si Vinted
// re-rend/remplace ce bouton entre-temps (React), le clic humain reel
// atterrit sur un NOUVEAU noeud DOM totalement invisible pour un listener
// attache a l'ancien -- exactement la meme classe de bug deja identifiee et
// corrigee ailleurs (voir matchesHumanClick() dans
// attributeDropdownDiagnostics.ts). Corrige ici en reprenant la meme
// philosophie : ecoute deleguee au niveau `document`, en phase capture
// (intercepte l'evenement au plus tot dans sa descente, avant qu'un eventuel
// stopPropagation() du gestionnaire propre de Vinted ne puisse l'empecher
// d'atteindre ce listener), et `resolveElement()` est appele A CHAQUE clic --
// jamais une reference figee -- pour toujours cibler le bouton reellement
// present dans le DOM au moment du clic.
// Exportee pour testabilite -- jsdom ne peut jamais produire un evenement
// avec isTrusted:true (aucun script, y compris un test, ne peut le
// falsifier -- c'est precisement la garantie recherchee ici), et refuse
// meme Object.defineProperty() pour le reecrire sur une vraie instance de
// MouseEvent ("Cannot redefine property"). Les tests espionnent donc
// document.addEventListener("click", ...) pour recuperer directement le
// callback enregistre par cette fonction, puis l'invoquent avec un objet
// minimal {isTrusted, target} -- jamais un vrai dispatchEvent().
export function waitForTrustedClick(resolveElement: () => HTMLElement | null, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    function onClick(e: MouseEvent): void {
      if (!e.isTrusted || settled) return;
      const current = resolveElement();
      const target = e.target as Node | null;
      if (!current || !target || !current.contains(target)) return;
      settled = true;
      cleanup();
      resolve(true);
    }
    function cleanup(): void {
      document.removeEventListener("click", onClick, true);
      clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    }, timeoutMs);
    document.addEventListener("click", onClick, true);
  });
}

// Exportee pour testabilite (jsdom, meme discipline que domWait.test.ts) --
// aucun appelant reel en dehors du listener chrome.runtime.onMessage
// ci-dessous.
export async function handleDeleteListing(payload: DeleteListingPayload): Promise<void> {
  const { vintedItemId } = payload;

  // Garde "mauvais item interdit" (demande explicite) : ne supprime QUE
  // l'annonce dont l'id correspond exactement a la page reellement chargee
  // dans cet onglet -- jamais un rapprochement par titre/prix.
  const currentItemId = extractVintedItemId(location.href);
  if (currentItemId !== vintedItemId) {
    reportDeleteResult({
      ok: false,
      reason: "wrong_item",
      errorMessage: `Page actuelle (annonce ${currentItemId ?? "inconnue"}) ne correspond pas a l'ancienne annonce ciblee (${vintedItemId}) -- suppression annulee par sécurité.`,
    });
    return;
  }

  reportDeleteProgress("loading");

  // Cas "ancienne annonce deja absente" (demande explicite du test
  // minimum) : si aucune donnee produit n'apparait jamais, l'annonce est
  // deja retiree -- rien a supprimer, jamais une erreur "bouton introuvable".
  const stillHasProductData = await waitForLdJsonSettled();
  if (!stillHasProductData) {
    reportDeleteResult({ ok: true, alreadyGone: true });
    return;
  }

  let triggerButton: HTMLButtonElement;
  try {
    triggerButton = await waitForElementMatching(() => findDeleteTriggerButton(document), {
      timeoutMs: 15000,
      description: `bouton "${DELETE_TRIGGER_TEXT}"`,
    });
  } catch (err) {
    reportDeleteResult({ ok: false, reason: "trigger_not_found", errorMessage: `Bouton "${DELETE_TRIGGER_TEXT}" introuvable : ${errorMessage(err)}` });
    return;
  }
  reportDeleteProgress("trigger_found");

  // Clic synthetique sur "Supprimer" : ouvre uniquement la modale de
  // confirmation (changement d'etat purement client, aucune requete reseau
  // attendue) -- distinct du clic FINAL ci-dessous, qui declenche la vraie
  // mutation et doit rester un clic humain (voir DeleteStep dans messages.ts).
  dispatchFullClick(triggerButton);
  reportDeleteProgress("trigger_clicked");

  try {
    await waitForCondition(() => isDeleteConfirmationModalVisible(document), {
      timeoutMs: 8000,
      description: `modale "${DELETE_MODAL_HEADING_TEXT}"`,
    });
  } catch (err) {
    reportDeleteResult({
      ok: false,
      reason: "modal_not_found",
      errorMessage: `Modale de confirmation introuvable après le clic sur "${DELETE_TRIGGER_TEXT}" : ${errorMessage(err)}`,
    });
    return;
  }
  reportDeleteProgress("modal_confirmed");

  try {
    await waitForElementMatching(() => findDeleteConfirmButton(document), {
      timeoutMs: 8000,
      description: `bouton "${DELETE_CONFIRM_TEXT}"`,
    });
  } catch (err) {
    reportDeleteResult({
      ok: false,
      reason: "confirm_button_not_found",
      errorMessage: `Bouton "${DELETE_CONFIRM_TEXT}" introuvable : ${errorMessage(err)}`,
    });
    return;
  }

  // Clic MANUEL requis (decision d'architecture, voir commentaire d'en-tete
  // de DeleteStep dans messages.ts) : jamais de clic synthetique sur ce
  // bouton precis.
  //
  // BUG REEL confirme en test live (mission "CORRIGER LE FAUX TERMINE",
  // 2026-08-17) : l'ancienne condition (`!document.body.contains(confirmButton)
  // || !location.pathname.includes(...)`) traitait TOUTE navigation hors de
  // /items/{id} comme une preuve de clic -- y compris une navigation SANS
  // AUCUN rapport avec un clic reel (observe en direct : le navigateur est
  // revenu sur /member/{userId} sans qu'aucune confirmation n'ait ete
  // donnee). Consequence en cascade : DELETE_RESULT{ok:true} etait envoye a
  // tort, declenchant la verification independante puis la fermeture de cet
  // onglet (settle() dans deleteOldListing.ts) -- exactement "l'onglet
  // n'est plus reste disponible" rapporte par l'utilisateur, ET un
  // REPUBLISH_COMPLETED potentiellement faux si la verification suivante
  // se trompait aussi.
  //
  // Corrige en detectant un VRAI evenement "click" avec isTrusted:true
  // directement sur confirmButton -- un clic synthetique (le notre, ou
  // toute autre origine) a TOUJOURS isTrusted:false, propriete native du
  // navigateur, non falsifiable depuis JavaScript. Plus aucune inference a
  // partir d'effets de bord (navigation, disparition DOM) qui peuvent
  // survenir pour des raisons totalement etrangeres a un clic utilisateur.
  reportDeleteProgress("waiting_for_manual_confirm_click");
  const humanClicked = await waitForTrustedClick(() => findDeleteConfirmButton(document), 90000);
  if (!humanClicked) {
    reportDeleteResult({
      ok: false,
      reason: "confirm_click_timeout",
      errorMessage: `Aucun clic humain détecté sur "${DELETE_CONFIRM_TEXT}" sous 90s.`,
    });
    return;
  }
  reportDeleteProgress("confirm_clicked");
  reportDeleteResult({ ok: true, alreadyGone: false });
}

// Mission "CORRIGER LA REPETITION DELETE_LISTING" (2026-08-17) -- CAUSE
// RACINE PROUVEE en test live : ce listener ne repondait JAMAIS (ni
// sendResponse, ni return true) -- exactement le meme bug deja corrige pour
// PUBLISH_LISTING (vinted-publish.ts, mission "ACK PUBLISH_LISTING
// MANQUANT"). Chrome fermait alors le port avant reponse ("message port
// closed before a response was received."), MEME quand ce content script
// avait deja reellement recu DELETE_LISTING et demarre handleDeleteListing() --
// deleteOldListing.ts::withRetry() traitait ce faux negatif comme un echec
// d'envoi et renvoyait DELETE_LISTING, demarrant plusieurs
// handleDeleteListing() concurrents dans le MEME document (documentInstanceId
// identique confirme sur toute la sequence repetee en test live -- jamais un
// document duplique). deleteHandlingInFlight :
// garde LOCALE (defense en profondeur, meme pattern que runPublishInFlight,
// vinted-publish.ts) -- ne masque PAS le bug d'ACK (corrige separement cote
// background), protege seulement contre un envoi residuel qui contournerait
// malgre tout la correction principale.
let deleteHandlingInFlight = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isContentCommand(message) || message.type !== "DELETE_LISTING") return false;
  // ACK SYNCHRONE explicite, AVANT tout travail long -- distingue "commande
  // remise" (ce message) de "suppression terminee" (toujours DELETE_RESULT,
  // jamais confondus). duplicate:true si un handleDeleteListing() est deja
  // en cours dans ce document -- accepte proprement SANS en relancer un
  // second (voir deleteHandlingInFlight ci-dessus).
  const duplicate = deleteHandlingInFlight;
  const response: DeleteCommandResponse = {
    ok: true,
    accepted: true,
    duplicate,
    documentInstanceId: DOCUMENT_INSTANCE_ID,
  };
  sendResponse(response);
  if (duplicate) {
    // Rien d'autre a faire : le background recoit deja duplicate:true dans
    // cette meme reponse ACK et peut journaliser ce cas lui-meme -- jamais
    // relancer un second handleDeleteListing() sur ce document.
    return false;
  }
  deleteHandlingInFlight = true;
  void handleDeleteListing(message.payload).finally(() => {
    deleteHandlingInFlight = false;
  });
  return false; // reponse (ACK) deja envoyee SYNCHRONEMENT ci-dessus -- le reste (DELETE_PROGRESS/DELETE_RESULT) continue de communiquer via le canal fire-and-forget existant.
});

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
      if (response.draftProtected) {
        showStatus(
          status,
          "Annonce mise à jour dans ResellOS (métadonnées uniquement) -- une modification locale non encore synchronisée sur Vinted existe et a été préservée (titre/prix/description non écrasés).",
          false
        );
        return;
      }
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
