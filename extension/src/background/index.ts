// Point d'entree du service worker. Seul composant qui parle a Supabase
// (voir EXTENSION.md §4) : les content scripts et le popup passent toujours
// par des messages traites ici, jamais d'appel Supabase direct ailleurs.

import {
  isExternalMessage,
  isInternalMessage,
  ACTION_PROGRESS_PORT_NAME,
  SYNC_PROGRESS_PORT_NAME,
  type ActionProgressPortMessage,
  type CheckItemLinkedResponse,
  type ExternalResponse,
  type ImportItemResponse,
  type PublishStep,
  type RunActionResponse,
  type SyncStep,
  type SyncProgressPortMessage,
  type SyncVintedAccountResult,
} from "../lib/messages";
import { pair, unpair, getStatus } from "./pairing";
import { recordAccountDetected, recordListings, recordSingleItemImport, checkItemAlreadyLinked } from "./sync";
import { runAction } from "./runAction";
import {
  startAccountSync,
  notifyAccountDetected,
  notifyListingsProcessing,
  resolveAccountSyncWithListingsResult,
  resolveAccountSyncWithError,
  type OpenSyncTabResult,
} from "./syncCoordinator";
import { logger, persistRelayedEntry } from "./logger";
import { errorMessage } from "../lib/errorMessage";
import { installDeleteRequestInstrumentation } from "./deleteRequestInstrumentation";
import { installPublishMutationInstrumentation } from "./publishMutationInstrumentation";
import { initRepublishScheduler } from "./republishScheduler";

// Port de progression (Phase 3.1, publication) : l'app web l'ouvre juste
// avant d'envoyer RUN_ACTION pour recevoir les etapes intermediaires d'une
// action longue (voir messages.ts). Une seule action en cours a la fois
// cote UI - un seul port actif suffit.
let activeProgressPort: chrome.runtime.Port | null = null;

// Port de progression synchro (mission "SYNC_VINTED_ACCOUNT", lot 2 -
// 2026-08-16) : DELIBEREMENT separe d'activeProgressPort ci-dessus -- une
// synchro et une republication/edition sont deux flux independants, jamais
// partages (voir commentaire d'en-tete de SYNC_PROGRESS_PORT_NAME dans
// messages.ts).
let activeSyncProgressPort: chrome.runtime.Port | null = null;

chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name === ACTION_PROGRESS_PORT_NAME) {
    activeProgressPort = port;
    port.onDisconnect.addListener(() => {
      if (activeProgressPort === port) activeProgressPort = null;
    });
    return;
  }
  if (port.name === SYNC_PROGRESS_PORT_NAME) {
    activeSyncProgressPort = port;
    port.onDisconnect.addListener(() => {
      if (activeSyncProgressPort === port) activeSyncProgressPort = null;
    });
  }
});

function reportActionProgress(step: PublishStep): void {
  activeProgressPort?.postMessage({ type: "progress", step } satisfies ActionProgressPortMessage);
}

// Republication assistee (2026-08-11) : relaie PUBLISH_PREFILL_SUMMARY vers
// l'app via le meme port que reportActionProgress ci-dessus -- voir
// handlePublishListing.ts pour la production de ce message.
function reportPrefillSummary(confirmed: string[], pending: string[]): void {
  activeProgressPort?.postMessage({ type: "prefill_summary", confirmed, pending } satisfies ActionProgressPortMessage);
}

// Mission "CLIC FINAL + CONFIRMATION POST-PUBLICATION" (2026-08-16) : relaie
// PUBLISH_READY_TO_SUBMIT vers l'app via le meme port -- voir
// handlePublishListing.ts pour la production de ce signal.
function reportReadyToSubmit(): void {
  activeProgressPort?.postMessage({ type: "ready_to_submit" } satisfies ActionProgressPortMessage);
}

// Mission "CORRIGER LE FAUX TERMINE" (2026-08-17) : relaie vers l'app que
// l'extension attend desormais un clic humain reel sur "Confirmer et
// supprimer" -- voir handlePublishListing.ts/deleteOldListing.ts.
function reportAwaitingOldListingDeletion(): void {
  activeProgressPort?.postMessage({ type: "awaiting_old_listing_deletion" } satisfies ActionProgressPortMessage);
}

// Maintien du service worker MV3 actif pendant une action longue (voir
// commentaire detaille dans runAction.ts) -- reutilise le MEME port deja
// ouvert par l'app, distinct de reportActionProgress() pour ne jamais
// declencher de journalisation cote app (voir ActionProgressPortMessage).
function sendKeepaliveHeartbeat(): void {
  activeProgressPort?.postMessage({ type: "heartbeat" } satisfies ActionProgressPortMessage);
}

// Relaie la progression d'une synchro (syncCoordinator.ts) vers l'app via
// activeSyncProgressPort -- symetrique de reportActionProgress ci-dessus,
// mais sur son propre port (jamais de progression synchro sur
// activeProgressPort, ni l'inverse).
function reportSyncProgress(step: SyncStep): void {
  activeSyncProgressPort?.postMessage({ type: "progress", step } satisfies SyncProgressPortMessage);
}

// Maintien du service worker MV3 actif pendant une synchro explicite --
// MEME cause racine et MEME correctif deja prouves pour runAction.ts (voir
// son commentaire d'en-tete, KEEPALIVE_INTERVAL_MS) : une synchro peut
// attendre jusqu'a SYNC_TIMEOUT_MS (90s, syncCoordinator.ts) l'ouverture de
// l'onglet + les evenements ACCOUNT_DETECTED/LISTINGS_DETECTED, sans aucun
// appel chrome.* entre-temps -- risque de suspension identique, meme filet
// de securite.
function sendSyncKeepaliveHeartbeat(): void {
  activeSyncProgressPort?.postMessage({ type: "heartbeat" } satisfies SyncProgressPortMessage);
}
const SYNC_KEEPALIVE_INTERVAL_MS = 20000;

// Ouvre l'onglet Vinted necessaire pour qu'une synchro explicite (mission
// "SYNC_VINTED_ACCOUNT", lot 2) puisse s'executer : le fetch de l'API
// wardrobe exige les cookies de session Vinted, disponibles uniquement dans
// un vrai document vinted.fr (voir vinted-profile.ts) -- le service worker
// ne peut pas les obtenir lui-meme. active:false (comme
// enrichListing.ts::enrichListingIfNeeded) : synchro en lecture seule,
// aucune interaction utilisateur requise, l'onglet n'a jamais besoin d'etre
// visible. onTabCreated rapporte l'id cree pour permettre au demandeur de
// fermer l'onglet une fois la synchro resolue (voir SYNC_VINTED_ACCOUNT
// ci-dessous).
async function openVintedProfileTabForSync(vintedUserId: string, onTabCreated: (tabId: number) => void): Promise<OpenSyncTabResult> {
  try {
    const tab = await chrome.tabs.create({ url: `https://www.vinted.fr/member/${vintedUserId}`, active: false });
    if (tab.id === undefined) return { tabId: null, error: "Onglet Vinted invalide" };
    onTabCreated(tab.id);
    return { tabId: tab.id };
  } catch (err) {
    return { tabId: null, error: errorMessage(err) };
  }
}

// Messages venant de l'app web (externally_connectable, voir manifest.config.ts).
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // Instrumentation TEMPORAIRE (diagnostic Bug Live n2, republication assistee,
  // 2026-08-10) -- a retirer une fois la cause confirmee. Objectif : si
  // sender.origin n'est pas dans externally_connectable.matches du manifest
  // REELLEMENT charge par Chrome, ce listener n'est jamais invoque du tout --
  // cette ligne n'apparaitra alors JAMAIS dans la console du service worker
  // ni dans le journal persiste (logger.getRecent() depuis le popup), ce qui
  // est en soi le signal recherche. Deja arrive deux fois avec ce meme
  // symptome (voir manifest.config.ts, commentaire buildExternallyConnectableMatches).
  logger.debug("onMessageExternal recu", {
    type: (message as { type?: unknown } | null)?.type,
    senderOrigin: sender.origin,
    senderUrl: sender.url,
  });

  if (!isExternalMessage(message)) {
    sendResponse({ ok: false, error: "Message externe inconnu" } satisfies ExternalResponse);
    return false;
  }

  if (message.type === "PING") {
    logger.debug("PING recu (onMessageExternal), reponse {ok:true} envoyee");
    sendResponse({ ok: true } satisfies ExternalResponse);
    return false;
  }

  if (message.type === "PAIR") {
    logger.debug("PAIR recu (onMessageExternal), delegue a pair()");
    pair(message.access_token, message.refresh_token)
      .then(() => sendResponse({ ok: true } satisfies ExternalResponse))
      .catch((err: unknown) => {
        logger.error("PAIR: pair() a leve une exception", errorMessage(err));
        sendResponse({ ok: false, error: errorMessage(err) } satisfies ExternalResponse);
      });
    return true; // reponse asynchrone : garder le canal ouvert
  }

  if (message.type === "GET_STATUS") {
    getStatus()
      .then((status) => {
        logger.debug("GET_STATUS (externe) reponse envoyee", status);
        sendResponse(status);
      })
      .catch((err: unknown) => {
        logger.error("GET_STATUS (externe) a echoue", errorMessage(err));
        sendResponse({ paired: false, pairedUserId: null, vintedConnected: false, lastSyncedAt: null, lastError: "Erreur interne" });
      });
    return true;
  }

  if (message.type === "UNPAIR") {
    unpair()
      .then(() => sendResponse({ ok: true } satisfies ExternalResponse))
      .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) } satisfies ExternalResponse));
    return true;
  }

  if (message.type === "RUN_ACTION") {
    // Etape 3 (reception par le background de l'extension) -- demande
    // explicite du 2026-07-15, diagnostic push ResellOS -> Vinted qui ne
    // s'executait pas visiblement.
    logger.info(`[${message.request.historyId}] RUN_ACTION recu par le background`, {
      kind: message.request.kind,
      vintedAccountId: message.request.vintedAccountId,
      listingId: message.request.listingId,
    });
    runAction(
      message.request,
      reportActionProgress,
      sendKeepaliveHeartbeat,
      reportPrefillSummary,
      reportReadyToSubmit,
      reportAwaitingOldListingDeletion
    )
      .then((outcome) => sendResponse({ ok: true, outcome } satisfies RunActionResponse))
      .catch((err: unknown) => {
        console.error("[ResellOS][action]", err);
        sendResponse({ ok: false, error: errorMessage(err) } satisfies RunActionResponse);
      });
    return true; // reponse asynchrone : garder le canal ouvert
  }

  if (message.type === "SYNC_VINTED_ACCOUNT") {
    // Mission "SYNC_VINTED_ACCOUNT" (2026-08-16, lot 2 fiabilisation
    // synchro) : remplace le pattern window.open()+poll Supabase par une
    // commande explicite et traçable -- voir syncCoordinator.ts pour la
    // correlation avec les evenements naturels ACCOUNT_DETECTED/
    // LISTINGS_DETECTED emis par vinted-profile.ts (inchange).
    logger.info("SYNC_VINTED_ACCOUNT recu par le background", {
      vintedUserId: message.vintedUserId,
      vintedUsername: message.vintedUsername,
    });
    let syncTabId: number | null = null;
    const keepaliveTimer = setInterval(sendSyncKeepaliveHeartbeat, SYNC_KEEPALIVE_INTERVAL_MS);
    startAccountSync(message.vintedUserId, reportSyncProgress, () =>
      openVintedProfileTabForSync(message.vintedUserId, (tabId) => {
        syncTabId = tabId;
      })
    )
      .then((result) => {
        // Onglet ouvert en arriere-plan uniquement pour cette synchro (voir
        // openVintedProfileTabForSync) -- ferme desormais que le resultat
        // soit un succes, un scan partiel ou un echec, jamais laisse trainer.
        if (syncTabId !== null) chrome.tabs.remove(syncTabId).catch(() => {});
        logger.info("SYNC_VINTED_ACCOUNT termine", result);
        sendResponse(result satisfies SyncVintedAccountResult);
      })
      .catch((err: unknown) => {
        if (syncTabId !== null) chrome.tabs.remove(syncTabId).catch(() => {});
        logger.error("SYNC_VINTED_ACCOUNT a echoue de facon inattendue", errorMessage(err));
        sendResponse({
          ok: false,
          complete: false,
          created: 0,
          updated: 0,
          deletedMarked: 0,
          pagesRead: 0,
          pagesExpected: 0,
          reason: "error",
          error: errorMessage(err),
        } satisfies SyncVintedAccountResult);
      })
      .finally(() => clearInterval(keepaliveTimer));
    return true; // reponse asynchrone : garder le canal ouvert
  }

  return false;
});

// Messages venant du popup (meme extension, pas besoin d'externally_connectable).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isInternalMessage(message)) return false;

  if (message.type === "GET_STATUS") {
    getStatus()
      .then(sendResponse)
      .catch((err: unknown) => {
        logger.error("GET_STATUS a echoue", errorMessage(err));
        sendResponse({ paired: false, pairedUserId: null, vintedConnected: false, lastSyncedAt: null, lastError: "Erreur interne" });
      });
    return true;
  }

  if (message.type === "UNPAIR") {
    unpair()
      .then(() => sendResponse({ ok: true } satisfies ExternalResponse))
      .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) } satisfies ExternalResponse));
    return true;
  }

  if (message.type === "ACCOUNT_DETECTED") {
    recordAccountDetected(message.vintedUserId, message.vintedUsername)
      .then((result) => {
        // Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16) :
        // recordAccountDetected() ne fait plus jamais un simple `return`
        // silencieux sur une extension non appairee -- journalise ici
        // explicitement plutot que de laisser ce cas se fondre dans un
        // succes generique.
        //
        // Mission "SYNC_VINTED_ACCOUNT" (lot 2) : correle a une synchro
        // explicite EN ATTENTE pour ce vintedUserId, s'il y en a une --
        // no-op silencieux sinon (visite organique du profil, comportement
        // du lot 1 totalement inchange).
        notifyAccountDetected(message.vintedUserId, result.ok);
        if (!result.ok) {
          logger.warn("ACCOUNT_DETECTED traite mais ignore (non appairee)", result);
          sendResponse({ ok: false, error: result.reason } satisfies ExternalResponse);
          return;
        }
        sendResponse({ ok: true } satisfies ExternalResponse);
      })
      .catch((err: unknown) => {
        resolveAccountSyncWithError(message.vintedUserId, errorMessage(err));
        logger.error("ACCOUNT_DETECTED a echoue", errorMessage(err));
        sendResponse({ ok: false, error: errorMessage(err) } satisfies ExternalResponse);
      });
    return true;
  }

  if (message.type === "LISTINGS_DETECTED") {
    notifyListingsProcessing(message.vintedUserId);
    recordListings(message.vintedUserId, message.vintedUsername, message.listings, message.complete)
      .then((result) => {
        // Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16) :
        // resultat desormais structure -- un scan partiel n'est plus un
        // succes silencieux indiscernable d'un scan complet, un compte non
        // appaire non plus.
        //
        // Mission "SYNC_VINTED_ACCOUNT" (lot 2) : resout la synchro en
        // attente EXCLUSIVEMENT a partir de ce meme resultat structure --
        // aucune deuxieme logique de decision complete/partiel/echec.
        resolveAccountSyncWithListingsResult(message.vintedUserId, result, message.pagesRead, message.pagesExpected);
        if (!result.ok) {
          logger.warn("LISTINGS_DETECTED traite mais ignore (non appairee)", result);
          sendResponse({ ok: false, error: result.reason } satisfies ExternalResponse);
          return;
        }
        if (!result.complete) {
          logger.warn("LISTINGS_DETECTED : scan partiel traite, listings_synced_at non avance", result);
        } else {
          logger.info("LISTINGS_DETECTED traite avec succes (scan complet)", result);
        }
        sendResponse({ ok: true } satisfies ExternalResponse);
      })
      .catch((err: unknown) => {
        resolveAccountSyncWithError(message.vintedUserId, errorMessage(err));
        logger.error("LISTINGS_DETECTED a echoue", errorMessage(err));
        sendResponse({ ok: false, error: errorMessage(err) } satisfies ExternalResponse);
      });
    return true;
  }

  if (message.type === "IMPORT_ITEM_REQUESTED") {
    logger.info("IMPORT_ITEM_REQUESTED recu (onMessage, content script -> background)", {
      vintedUsername: message.vintedUsername,
      vintedItemId: message.item.vintedItemId,
    });
    recordSingleItemImport(message.vintedUsername, message.item)
      .then(({ created, draftProtected }) => {
        logger.info("IMPORT_ITEM_REQUESTED traite avec succes", { created, draftProtected });
        sendResponse({ ok: true, created, draftProtected } satisfies ImportItemResponse);
      })
      .catch((err: unknown) => {
        // Objet complet dans la console (demande utilisateur, 2026-07-14) --
        // en plus du message extrait ci-dessous, pour inspection directe
        // (err.details/hint Supabase, stack si Error) meme si errorMessage()
        // ne capture pas un champ imprevu.
        console.error("[ResellOS][Import]", err);
        logger.error("IMPORT_ITEM_REQUESTED a echoue", errorMessage(err));
        sendResponse({ ok: false, error: errorMessage(err) } satisfies ImportItemResponse);
      });
    return true;
  }

  if (message.type === "RELAY_LOG_ENTRY") {
    // Fire-and-forget (le content script n'attend pas de reponse, voir
    // logger.ts::write()) -- seul point d'ecriture reelle dans
    // chrome.storage.local pour une entree issue d'un content script.
    void persistRelayedEntry(message.entry);
    return false;
  }

  if (message.type === "CHECK_ITEM_LINKED_REQUESTED") {
    checkItemAlreadyLinked(message.vintedUsername, message.vintedItemId)
      .then((linked) => {
        sendResponse({ ok: true, linked } satisfies CheckItemLinkedResponse);
      })
      .catch((err: unknown) => {
        console.error("[ResellOS][ImportButton]", err);
        logger.error("CHECK_ITEM_LINKED_REQUESTED a echoue", errorMessage(err));
        sendResponse({ ok: false, error: errorMessage(err) } satisfies CheckItemLinkedResponse);
      });
    return true;
  }

  return false;
});

// Mission "AUTOMATISER ENTIEREMENT LA SUPPRESSION DE A" (2026-08-17) :
// capture passive (lecture seule) des headers/corps de la prochaine
// suppression reelle, voir deleteRequestInstrumentation.ts. Enregistree une
// seule fois au demarrage du service worker -- ne modifie ni ne retarde
// aucune requete existante.
installDeleteRequestInstrumentation();

// Mission "ELARGISSEMENT AUTOMATISATION -- SUPPRIMER LE CLIC HUMAIN SUR
// AJOUTER" (2026-08-17) : meme principe, meme jour, pour la mutation de
// creation/edition d'annonce -- voir publishMutationInstrumentation.ts.
installPublishMutationInstrumentation();

// Mission "ROUND 3 -- CHROME.ALARMS UNIQUEMENT" (2026-08-20) : enregistre
// chrome.alarms.onAlarm/chrome.runtime.onStartup et lance une premiere
// resynchronisation best-effort des programmations actives
// (republish_schedules) -- voir republishScheduler.ts. Round 3 : detection/
// log uniquement, aucune execution Vinted.
initRepublishScheduler();

logger.info("Background demarre");
