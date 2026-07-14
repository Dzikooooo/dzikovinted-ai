// Point d'entree du service worker. Seul composant qui parle a Supabase
// (voir EXTENSION.md §4) : les content scripts et le popup passent toujours
// par des messages traites ici, jamais d'appel Supabase direct ailleurs.

import {
  isExternalMessage,
  isInternalMessage,
  ACTION_PROGRESS_PORT_NAME,
  type ActionProgressPortMessage,
  type CheckItemLinkedResponse,
  type ExternalResponse,
  type ImportItemResponse,
  type PublishStep,
  type RunActionResponse,
} from "../lib/messages";
import { pair, unpair, getStatus } from "./pairing";
import { recordAccountDetected, recordListings, recordSingleItemImport, checkItemAlreadyLinked } from "./sync";
import { runAction } from "./runAction";
import { logger } from "./logger";
import { errorMessage } from "../lib/errorMessage";

// Port de progression (Phase 3.1, publication) : l'app web l'ouvre juste
// avant d'envoyer RUN_ACTION pour recevoir les etapes intermediaires d'une
// action longue (voir messages.ts). Une seule action en cours a la fois
// cote UI - un seul port actif suffit.
let activeProgressPort: chrome.runtime.Port | null = null;

chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== ACTION_PROGRESS_PORT_NAME) return;
  activeProgressPort = port;
  port.onDisconnect.addListener(() => {
    if (activeProgressPort === port) activeProgressPort = null;
  });
});

function reportActionProgress(step: PublishStep): void {
  activeProgressPort?.postMessage({ type: "progress", step } satisfies ActionProgressPortMessage);
}

// Messages venant de l'app web (externally_connectable, voir manifest.config.ts).
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!isExternalMessage(message)) {
    sendResponse({ ok: false, error: "Message externe inconnu" } satisfies ExternalResponse);
    return false;
  }

  if (message.type === "PING") {
    logger.debug("PING recu (onMessageExternal)");
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

  if (message.type === "RUN_ACTION") {
    // Etape 3 (reception par le background de l'extension) -- demande
    // explicite du 2026-07-15, diagnostic push ResellOS -> Vinted qui ne
    // s'executait pas visiblement.
    logger.info(`[${message.request.historyId}] RUN_ACTION recu par le background`, {
      kind: message.request.kind,
      vintedAccountId: message.request.vintedAccountId,
      listingId: message.request.listingId,
    });
    runAction(message.request, reportActionProgress)
      .then((outcome) => sendResponse({ ok: true, outcome } satisfies RunActionResponse))
      .catch((err: unknown) => {
        console.error("[ResellOS][action]", err);
        sendResponse({ ok: false, error: errorMessage(err) } satisfies RunActionResponse);
      });
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
        sendResponse({ paired: false, vintedConnected: false, lastSyncedAt: null, lastError: "Erreur interne" });
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
      .then(() => sendResponse({ ok: true } satisfies ExternalResponse))
      .catch((err: unknown) => {
        logger.error("ACCOUNT_DETECTED a echoue", errorMessage(err));
        sendResponse({ ok: false, error: errorMessage(err) } satisfies ExternalResponse);
      });
    return true;
  }

  if (message.type === "LISTINGS_DETECTED") {
    recordListings(message.vintedUserId, message.vintedUsername, message.listings)
      .then(() => sendResponse({ ok: true } satisfies ExternalResponse))
      .catch((err: unknown) => {
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

logger.info("Background demarre");
