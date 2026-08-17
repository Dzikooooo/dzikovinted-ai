// Mission "AUTOMATISER ENTIEREMENT LA SUPPRESSION DE A APRES REPUBLICATION"
// (2026-08-17). Preuve live deja etablie (voir deleteOldListing.ts) : un
// clic humain reel sur "Confirmer et supprimer" declenche
// POST https://www.vinted.fr/api/v2/items/{id}/delete -> 200. Ce qui reste
// INCONNU -- et indispensable pour classer cette route en categorie A
// (requete authentifiee normale rejouable), B (jeton/etat genere par la
// page) ou C (protegee par le service anti-bot, comme les deux AUTRES
// mutations deja confirmees protegees, voir vinted-edit.ts::submitEdit et
// vinted-publish.ts -- header de reponse x-datadome:protected) -- c'est le
// contenu exact des headers de requete/reponse et du corps envoye par cette
// route precise. read_network_requests (outil d'inspection reseau utilise
// pour la capture live du 2026-08-17) ne sait pas retrouver le detail
// headers/corps pour ce type d'entree XHR -- limite d'outillage confirmee,
// pas de contournement invente.
//
// L'utilisateur a explicitement refuse de sacrifier une nouvelle annonce
// reelle juste pour lire ces headers a la main dans les devtools, et a
// demande a la place une instrumentation qui les capture PASSIVEMENT la
// PROCHAINE fois qu'une suppression reelle a lieu -- sans provoquer cette
// suppression, sans modifier le flow manuel existant
// (deleteOldListing.ts/vinted-item.ts, inchanges par cette mission). C'est
// exactement ce que fait ce module via chrome.webRequest, en lecture seule
// (aucun "blocking" dans extraInfoSpec ci-dessous -- la requete part et
// revient exactement comme sans ce module, zero interference, zero
// nouvelle automatisation de la suppression elle-meme).
//
// Filtre etroit (DELETE_URL_PATTERN) : ne capture jamais un autre endpoint
// Vinted. Permission "webRequest" ajoutee au manifest pour ce seul besoin
// (voir manifest.config.ts) -- observation uniquement, jamais de
// modification de requete (pas de "blocking", donc pas besoin de
// "webRequestBlocking").
//
// Redaction : Cookie/Authorization (session reelle de l'utilisateur)
// jamais journalises en clair -- seule leur presence/longueur l'est. Tout
// le reste (dont un eventuel header anti-bot ou jeton CSRF, precisement ce
// qu'on cherche a observer) est journalise integralement -- reste local a
// chrome.storage.local, lisible uniquement depuis le popup de l'utilisateur
// lui-meme (voir logger.ts), jamais transmis a distance par ce module.

import { logger } from "./logger";
import { redactHeaders, decodeRequestBody } from "./webRequestRedaction";

const DELETE_URL_PATTERN = "https://www.vinted.fr/api/v2/items/*/delete";

function itemIdFromUrl(url: string): string | null {
  const match = /\/api\/v2\/items\/(\d+)\/delete/.exec(url);
  return match?.[1] ?? null;
}

// Correlation par requestId (identifiant stable, commun a tous les
// evenements webRequest d'une meme requete) -- onBeforeRequest/
// onBeforeSendHeaders/onCompleted arrivent separement, il faut les
// fusionner avant de journaliser une seule entree exploitable.
interface PendingCapture {
  itemId: string | null;
  method: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
}
const pending = new Map<string, PendingCapture>();

// Idempotent : un second appel (ex. si jamais rappelee par erreur) ne
// re-enregistre pas une seconde fois les memes listeners.
let installed = false;

export function installDeleteRequestInstrumentation(): void {
  if (installed) return;
  if (typeof chrome === "undefined" || !chrome.webRequest) {
    logger.warn("DELETE_INSTRUMENTATION_UNAVAILABLE", { reason: "chrome.webRequest indisponible (permission manifest manquante ?)" });
    return;
  }
  installed = true;

  chrome.webRequest.onBeforeRequest.addListener(
    (details): undefined => {
      pending.set(details.requestId, {
        itemId: itemIdFromUrl(details.url),
        method: details.method,
        requestBody: decodeRequestBody(details.requestBody),
      });
      return undefined;
    },
    { urls: [DELETE_URL_PATTERN], types: ["xmlhttprequest"] },
    ["requestBody"]
  );

  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details): undefined => {
      const entry = pending.get(details.requestId);
      if (entry) entry.requestHeaders = redactHeaders(details.requestHeaders);
      return undefined;
    },
    { urls: [DELETE_URL_PATTERN], types: ["xmlhttprequest"] },
    ["requestHeaders", "extraHeaders"]
  );

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      const entry = pending.get(details.requestId);
      pending.delete(details.requestId);
      logger.info("DELETE_REQUEST_CAPTURED", {
        requestId: details.requestId,
        url: details.url,
        itemId: entry?.itemId ?? itemIdFromUrl(details.url),
        method: entry?.method ?? details.method,
        statusCode: details.statusCode,
        requestHeaders: entry?.requestHeaders ?? "<non capture>",
        requestBody: entry?.requestBody ?? "<vide ou non capture>",
        responseHeaders: redactHeaders(details.responseHeaders),
      });
    },
    { urls: [DELETE_URL_PATTERN], types: ["xmlhttprequest"] },
    ["responseHeaders", "extraHeaders"]
  );

  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      const entry = pending.get(details.requestId);
      pending.delete(details.requestId);
      logger.warn("DELETE_REQUEST_CAPTURE_ERROR", {
        requestId: details.requestId,
        url: details.url,
        itemId: entry?.itemId ?? itemIdFromUrl(details.url),
        error: details.error,
      });
    },
    { urls: [DELETE_URL_PATTERN], types: ["xmlhttprequest"] }
  );

  logger.debug("DELETE_INSTRUMENTATION_INSTALLED", { pattern: DELETE_URL_PATTERN });
}
