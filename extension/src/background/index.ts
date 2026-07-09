// Point d'entree du service worker. Seul composant qui parle a Supabase
// (voir EXTENSION.md §4) : les content scripts et le popup passent toujours
// par des messages traites ici, jamais d'appel Supabase direct ailleurs.

import { isExternalMessage, isInternalMessage, type ExternalResponse } from "../lib/messages";
import { pair, unpair, getStatus } from "./pairing";
import { recordAccountDetected } from "./sync";
import { logger } from "./logger";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Messages venant de l'app web (externally_connectable, voir manifest.config.ts).
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!isExternalMessage(message)) {
    sendResponse({ ok: false, error: "Message externe inconnu" } satisfies ExternalResponse);
    return false;
  }

  if (message.type === "PING") {
    sendResponse({ ok: true } satisfies ExternalResponse);
    return false;
  }

  if (message.type === "PAIR") {
    pair(message.access_token, message.refresh_token)
      .then(() => sendResponse({ ok: true } satisfies ExternalResponse))
      .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) } satisfies ExternalResponse));
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

  return false;
});

logger.info("Background demarre");
