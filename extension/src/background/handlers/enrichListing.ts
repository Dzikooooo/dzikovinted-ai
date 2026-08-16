// Enrichissement lazy d'une annonce avant republication (audit "prefill
// partiel", 2026-08-10-11). CAUSE CONFIRMEE en test live (log
// PREFILL_DESCRIPTION_EMPTY_PAYLOAD) : une annonce synchronisee passivement
// (extension/src/background/sync.ts::recordListings) n'a jamais de
// description en base -- ListingPayload (le message de la synchro passive)
// ne porte meme pas ce champ. Seul l'import individuel explicite
// (recordSingleItemImport, buildPayload() dans vinted-item.ts) capture les
// details complets, via le JSON-LD de la page /items/{id}.
//
// Strategie retenue (option C+D de l'audit) : PAS d'enrichissement en masse
// (jamais ouvrir 96 onglets), PAS de nouvelle table de "completude" -- au
// moment ou une republication est reellement demandee sur UNE annonce dont
// la description manque, ouvrir brievement (arriere-plan, jamais visible)
// la page Vinted de CETTE annonce, reutiliser TEL QUEL le mecanisme
// d'extraction/import deja existant et deja teste (vinted-item.ts,
// recordSingleItemImport), puis continuer la republication avec les
// donnees fraiches. Best-effort inconditionnel : tout echec ici (reseau,
// timeout, page introuvable) retourne simplement le payload D'ORIGINE
// inchange -- jamais un blocage de la republication pour cette seule
// raison, jamais une exception qui remonte.
//
// N'enrichit QUE republish_listing (previousVintedItemId requis pour savoir
// QUELLE page Vinted ouvrir) -- publish_listing n'a par definition aucune
// annonce Vinted d'origine a consulter.

import { withRetry } from "../retry";
import { recordSingleItemImport } from "../sync";
import { logger } from "../logger";
import { errorDetails } from "../../lib/errorMessage";
import type { AutoEnrichResponse, ContentCommand, PublishListingPayload } from "../../lib/messages";

const ENRICH_TAB_LOAD_TIMEOUT_MS = 20000;
// Etiquette constante de cet onglet dans tous les logs TAB_*/SEND_MESSAGE_* --
// permet de distinguer sans ambiguite cet onglet TEMPORAIRE (/items/{ancien
// id}, jamais visible) de l'onglet PRINCIPAL de republication (/items/new,
// voir publishListing.ts::TAB_PURPOSE="publish") dans le viewer de logs.
const TAB_PURPOSE = "enrich" as const;

// Mission "REPUBLICATION FIDELE" (2026-08-11) : CAUSE CONFIRMEE -- ce gate
// ne declenchait l'enrichissement (donc la seule source connue de
// categorie/etat/couleur/matiere pour une annonce synchronisee passivement,
// voir wardrobeApi.ts qui ne capture jamais ces 4 champs) QUE si la
// description etait vide. Une annonce dont la description avait deja ete
// remplie (par un enrichissement precedent, ou parce qu'elle a ete importee
// via "Importer" a l'origine) ne redeclenchait donc plus JAMAIS
// l'enrichissement, meme si categorie/etat/couleur/matiere/taille/marque
// restaient reellement absents en base -- explique directement "Sélectionne
// une catégorie" reste vide alors que titre/description/prix/photos sont
// deja corrects. Etend le gate a TOUS les champs que SEUL l'enrichissement
// peut remplir (jamais la synchro passive) : des qu'UN SEUL manque, retente
// -- toujours best-effort, jamais bloquant (voir enrichListingIfNeeded).
function needsEnrichment(payload: PublishListingPayload): boolean {
  return (
    !payload.description.trim() ||
    !payload.category.trim() ||
    !payload.condition.trim() ||
    !payload.brand ||
    !payload.size ||
    !payload.color ||
    !payload.material
  );
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    function cleanup(): void {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
    }

    // Mission "PORT MESSAGE FERMÉ" (2026-08-11), item 1 : journalise CHAQUE
    // evenement onUpdated de cet onglet precis (pas seulement "complete") --
    // permet de voir dans le viewer de logs si l'onglet a navigue plusieurs
    // fois, vers quelle URL, avant d'atteindre l'etat qui declenche l'envoi
    // du message suivant.
    function onUpdated(updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab): void {
      if (updatedTabId !== tabId) return;
      logger.info("TAB_UPDATED", { tabId, url: tab.url ?? changeInfo.url, status: changeInfo.status, purpose: TAB_PURPOSE, at: Date.now() });
      if (changeInfo.status !== "complete" || settled) return;
      settled = true;
      cleanup();
      resolve();
    }

    function onRemoved(removedTabId: number): void {
      if (removedTabId !== tabId) return;
      logger.info("TAB_REMOVED", { tabId, purpose: TAB_PURPOSE, at: Date.now() });
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Onglet fermé avant chargement complet"));
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Chargement de l'onglet non confirmé sous ${timeoutMs}ms`));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

// Meme discipline de retry que sendCommandWhenReady (publishListing.ts) :
// le content script peut ne pas avoir fini de s'enregistrer juste apres
// "complete" (evenement de chargement de PAGE, pas de script d'extension).
//
// Mission "PORT MESSAGE FERMÉ" (2026-08-11), item 2 : trace explicitement
// chaque tentative d'envoi (START/RESPONSE/ERROR) -- ce message fonctionnait
// deja en test live (AUTO_ENRICH_EXTRACT_SUCCESS observe), sert ici surtout
// de reference "canal sain" pour comparer avec PUBLISH_LISTING (voir
// publishListing.ts::sendCommandWhenReady, meme instrumentation).
async function sendAutoEnrichCommand(tabId: number, currentUrl: string): Promise<AutoEnrichResponse> {
  return withRetry(
    () =>
      new Promise<AutoEnrichResponse>((resolve, reject) => {
        const command: ContentCommand = { type: "AUTO_ENRICH_REQUESTED" };
        const callStack = new Error().stack ?? null;
        logger.info("SEND_MESSAGE_START", { tabId, purpose: TAB_PURPOSE, messageType: command.type, currentUrl });
        chrome.tabs.sendMessage(tabId, command, (response: AutoEnrichResponse | undefined) => {
          if (chrome.runtime.lastError) {
            logger.error("SEND_MESSAGE_ERROR", {
              tabId,
              purpose: TAB_PURPOSE,
              messageType: command.type,
              lastError: chrome.runtime.lastError.message,
              stack: callStack,
            });
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            logger.error("SEND_MESSAGE_ERROR", {
              tabId,
              purpose: TAB_PURPOSE,
              messageType: command.type,
              lastError: "Réponse vide du content script",
              stack: callStack,
            });
            reject(new Error("Réponse vide du content script"));
            return;
          }
          logger.info("SEND_MESSAGE_RESPONSE", { tabId, purpose: TAB_PURPOSE, messageType: command.type, response });
          resolve(response);
        });
      }),
    { attempts: 6, baseDelayMs: 250 }
  );
}

export async function enrichListingIfNeeded(
  payload: PublishListingPayload,
  previousVintedItemId: string | undefined
): Promise<PublishListingPayload> {
  if (!previousVintedItemId || !needsEnrichment(payload)) return payload;

  const url = `https://www.vinted.fr/items/${previousVintedItemId}`;
  logger.info("AUTO_ENRICH_START", { previousVintedItemId });

  let tab: chrome.tabs.Tab;
  try {
    // active:false -- purement en lecture, l'utilisateur n'a jamais besoin
    // de voir cet onglet (contrairement a l'onglet /items/new principal,
    // ou active:true est requis pour qu'il puisse terminer lui-meme).
    tab = await chrome.tabs.create({ url, active: false });
  } catch (err) {
    logger.warn("AUTO_ENRICH_TAB_CREATE_FAILED", errorDetails(err));
    return payload;
  }
  if (tab.id === undefined) {
    logger.warn("AUTO_ENRICH_TAB_INVALID", {});
    return payload;
  }
  const tabId = tab.id;
  logger.info("TAB_CREATED", { tabId, url, purpose: TAB_PURPOSE, at: Date.now() });

  try {
    await waitForTabComplete(tabId, ENRICH_TAB_LOAD_TIMEOUT_MS);
    const response = await sendAutoEnrichCommand(tabId, url);

    if (!response.ok) {
      logger.warn("AUTO_ENRICH_EXTRACT_FAILED", { error: response.error });
      return payload;
    }

    logger.info("AUTO_ENRICH_EXTRACT_SUCCESS", {
      descriptionLength: response.item.description?.length ?? 0,
      imageCount: response.item.imageUrls.length,
      category: response.item.category,
    });

    try {
      const { created, draftProtected } = await recordSingleItemImport(response.vintedUsername, response.item);
      logger.info("AUTO_ENRICH_IMPORT_WRITE_RESULT", { created, draftProtected });
    } catch (err) {
      // Best-effort : la persistance en base peut echouer (reseau, session)
      // sans jamais empecher la republication en cours -- seule la
      // persistance long-terme (futures republications) est perdue, pas
      // l'action utilisateur presente.
      logger.error("AUTO_ENRICH_IMPORT_WRITE_FAILED", errorDetails(err));
    }

    // Ne remplace QUE les champs reellement vides du payload d'origine --
    // ne jamais ecraser une valeur deja fournie (ex. un titre deja
    // reformule par ResellOS, voir formatTitleWithSku).
    // Mission "REPUBLICATION FIDELE" (2026-08-11) : `brand` etait absent de
    // cette liste -- un oubli reel, jamais remarque tant que needsEnrichment()
    // ne se declenchait que sur description vide (une annonce avec
    // description mais sans marque ne redeclenchait jamais l'enrichissement,
    // donc ce trou etait invisible). Desormais visible et corrige : meme
    // regle que les autres champs (ne remplace que si reellement absent).
    const merged: PublishListingPayload = {
      ...payload,
      description: payload.description.trim() ? payload.description : response.item.description ?? payload.description,
      category: payload.category || response.item.category || payload.category,
      brand: payload.brand ?? response.item.brand,
      color: payload.color ?? response.item.color,
      material: payload.material ?? response.item.material,
      condition: payload.condition || response.item.condition || payload.condition,
      size: payload.size ?? response.item.size,
      imageUrls: payload.imageUrls.length > 0 ? payload.imageUrls : response.item.imageUrls,
    };
    // Instrumentation live-driven (2026-08-11, retest "payload non propage ?") :
    // preuve directe, au point de RETOUR de cette fonction, de ce qui sera
    // effectivement reexpedie a handlePublishListing.ts -- pour trancher sans
    // ambiguite si l'objet merge ci-dessus atteint bien l'appelant tel quel.
    logger.info("AUTO_ENRICH_RETURNING_MERGED_PAYLOAD", {
      descriptionLength: merged.description.length,
      imageCount: merged.imageUrls.length,
      category: merged.category,
    });
    return merged;
  } catch (err) {
    logger.warn("AUTO_ENRICH_FAILED", errorDetails(err));
    return payload;
  } finally {
    logger.info("TAB_REMOVE_REQUEST", { tabId, purpose: TAB_PURPOSE, reason: "enrichment_attempt_finished", at: Date.now() });
    chrome.tabs.remove(tabId).catch(() => {});
  }
}
