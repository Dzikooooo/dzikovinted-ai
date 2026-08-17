// Mission "ELARGISSEMENT AUTOMATISATION -- SUPPRIMER LE CLIC HUMAIN SUR
// AJOUTER" (2026-08-17, meme jour que deleteRequestInstrumentation.ts,
// meme discipline). L'utilisateur demande d'auditer le mecanisme reel
// declenche par un clic humain sur "Ajouter" (creation d'annonce),
// exactement comme pour la suppression : endpoint/methode, body,
// headers/token, DataDome eventuel, reponse -- SANS falsifier isTrusted et
// SANS deviner ce qui n'est pas prouve.
//
// Preuve DEJA etablie dans ce repo (voir vinted-publish.ts, commentaire
// juste avant checkAndLogReadinessState, mission "CLIC FINAL + CONFIRMATION
// POST-PUBLICATION", 2026-08-16) : le bouton "Ajouter" partage EXACTEMENT le
// meme composant Vinted que le bouton de sauvegarde d'edition --
// `SAVE_BUTTON_SELECTOR = '[data-testid="upload-form-save-button"]'`
// (publishSelectors.ts), reutilise TEL QUEL par vinted-edit.ts::submitEdit.
// Ce dernier a deja ete capture en direct le 2026-07-25 :
// PUT https://www.vinted.fr/api/v2/item_upload/items/{id} -> reponse
// portant "x-datadome: protected", exigeant un evenement isTrusted:true (un
// clic synthetique n'a JAMAIS declenche cette requete, voir vinted-edit.ts).
//
// Mission "AUDITER POURQUOI PUBLISH_MUTATION_REQUEST_CAPTURED N'A RIEN
// CAPTURE" (2026-08-17) : premiere version de ce module filtrait
// `urls: ["https://www.vinted.fr/api/v2/item_upload/items*"]` +
// `types: ["xmlhttprequest"]` -- test live reel (clic humain reel sur
// "Ajouter") n'a produit AUCUNE entree PUBLISH_MUTATION_REQUEST_CAPTURED.
// Causes candidates auditees :
//   1. Mauvaise chaine de recherche cote utilisateur ("PUBLISH_MUTATION_
//      CAPTURED" cherche, alors que ce module journalise TOUJOURS
//      "PUBLISH_MUTATION_REQUEST_CAPTURED" -- "REQUEST_" au milieu --
//      confirme par grep direct de ce fichier. Une recherche EXACTE de
//      "PUBLISH_MUTATION_CAPTURED" ne peut structurellement jamais trouver
//      "PUBLISH_MUTATION_REQUEST_CAPTURED", qui n'est pas un sur-ensemble
//      textuel de la premiere. C'est la cause la plus probable et la plus
//      simple -- mais elle ne PROUVE pas a elle seule que la requete a bien
//      ete capturee en arriere-plan, seulement que la recherche ne pouvait
//      pas la trouver meme si c'etait le cas.
//   2. Endpoint reel different de l'hypothese -- non prouve non plus (voir
//      ci-dessous, plus jamais suppose desormais).
//   3. Type de ressource different de "xmlhttprequest" (ex. une soumission
//      via un formulaire natif + navigation complete, peu probable sur une
//      SPA React mais jamais verifie pour CE clic precis) -- l'ancien filtre
//      `types` l'aurait silencieusement exclu.
//   4. Service worker MV3 suspendu au moment exact du clic (le clic humain
//      peut survenir plusieurs MINUTES apres le chargement du formulaire, le
//      temps de choisir categorie/attributs) -- chrome.webRequest ne fait
//      PAS partie des evenements qui reveillent un service worker deja
//      arrete (contrairement a chrome.runtime.onMessage/onConnect/alarms) ;
//      seul un service worker DEJA actif peut recevoir cet evenement. Ce
//      projet maintient deja un keepalive (runAction.ts::KEEPALIVE_INTERVAL_MS,
//      port.postMessage() toutes les 20s, deja prouve en direct pour un bug
//      similaire -- edit_listing bloque 7 minutes) pendant TOUTE la duree de
//      handlePublishListing(), y compris la phase manuelle -- devrait couvrir
//      ce cas, mais aucune preuve directe n'existe encore que webRequest
//      reste fiable jusqu'au bout de cette fenetre pour CE mecanisme precis.
//   5. host_permissions ne couvrant pas l'origine reelle de la requete --
//      chrome.webRequest ne peut JAMAIS observer une requete vers une
//      origine hors des host_permissions declarees (manifest.config.ts),
//      quel que soit le filtre `urls` ici. Seul "https://www.vinted.fr/*"
//      et "https://*.vinted.net/*" sont actuellement accordes -- si la
//      creation d'annonce passe par un AUTRE sous-domaine/domaine (jamais
//      observe a ce jour), cette instrumentation ne peut structurellement
//      pas la voir, quelle que soit sa largeur.
//
// Reponse a "rends l'instrumentation suffisamment large temporairement" :
// urls elargi a TOUT `/api/v2/*` sur www.vinted.fr (au lieu du seul
// `item_upload/items*`, hypothese non confirmee), et le filtre `types` est
// entierement retire (observe toutes les natures de ressource, pas
// seulement xmlhttprequest) -- couvre les causes 2 et 3 ci-dessus. Le bruit
// (lectures GET frequentes de l'app Vinted) est filtre par METHODE dans les
// callbacks eux-memes (seules les mutations, method !== "GET", sont
// journalisees) plutot que par le filtre `urls`/`types` de chrome.webRequest
// (qui ne sait pas filtrer par methode) -- reste large en couverture, reste
// silencieux sur le trafic non pertinent. Les causes 4 et 5 restent
// documentees ci-dessus mais non corrigees ici (rien a corriger sans
// preuve : ajouter des host_permissions pour un domaine jamais observe
// serait deviner).

import { logger } from "./logger";
import { redactHeaders, decodeRequestBody } from "./webRequestRedaction";

// Elargi (voir en-tete) : tout endpoint /api/v2/ plutot que le seul
// `item_upload/items*` suppose -- si l'hypothese initiale etait fausse,
// cette largeur reste capable de capturer l'endpoint reel de "Ajouter".
const PUBLISH_MUTATION_URL_PATTERN = "https://www.vinted.fr/api/v2/*";

function itemIdFromUrl(url: string): string | null {
  const match = /\/api\/v2\/item_upload\/items\/(\d+)/.exec(url);
  return match?.[1] ?? null;
}

interface PendingCapture {
  itemId: string | null;
  method: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
}
const pending = new Map<string, PendingCapture>();

let installed = false;

export function installPublishMutationInstrumentation(): void {
  if (installed) return;
  if (typeof chrome === "undefined" || !chrome.webRequest) {
    logger.warn("PUBLISH_MUTATION_INSTRUMENTATION_UNAVAILABLE", { reason: "chrome.webRequest indisponible (permission manifest manquante ?)" });
    return;
  }
  installed = true;

  chrome.webRequest.onBeforeRequest.addListener(
    (details): undefined => {
      // Filtre par METHODE ici (chrome.webRequest ne sait filtrer que par
      // urls/types) -- ne suit que les mutations, jamais les lectures GET
      // (tres frequentes sur une SPA, bruit pur pour cet objectif).
      if (details.method === "GET" || details.method === "HEAD") return undefined;
      pending.set(details.requestId, {
        itemId: itemIdFromUrl(details.url),
        method: details.method,
        requestBody: decodeRequestBody(details.requestBody),
      });
      return undefined;
    },
    { urls: [PUBLISH_MUTATION_URL_PATTERN] },
    ["requestBody"]
  );

  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details): undefined => {
      const entry = pending.get(details.requestId);
      if (entry) entry.requestHeaders = redactHeaders(details.requestHeaders);
      return undefined;
    },
    { urls: [PUBLISH_MUTATION_URL_PATTERN] },
    ["requestHeaders", "extraHeaders"]
  );

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      const entry = pending.get(details.requestId);
      pending.delete(details.requestId);
      // Rien suivi pour cette requete (GET/HEAD ecarte des onBeforeRequest,
      // voir plus haut) -- jamais journalise, silence volontaire sur le bruit.
      if (!entry) return;
      const method = entry.method;
      logger.info("PUBLISH_MUTATION_REQUEST_CAPTURED", {
        requestId: details.requestId,
        url: details.url,
        // Sans id dans l'URL + methode POST : tres probablement la creation
        // ("Ajouter"). Avec id + PUT : edition ("Enregistrer"), deja connue.
        itemId: entry.itemId ?? itemIdFromUrl(details.url),
        method,
        likelyKind: method === "POST" ? "creation (Ajouter)" : method === "PUT" ? "edition (Enregistrer, deja confirmee protegee)" : "inconnu",
        statusCode: details.statusCode,
        requestHeaders: entry.requestHeaders ?? "<non capture>",
        requestBody: entry.requestBody ?? "<vide ou non capture>",
        responseHeaders: redactHeaders(details.responseHeaders),
      });
    },
    { urls: [PUBLISH_MUTATION_URL_PATTERN] },
    ["responseHeaders", "extraHeaders"]
  );

  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      const entry = pending.get(details.requestId);
      pending.delete(details.requestId);
      if (!entry) return;
      logger.warn("PUBLISH_MUTATION_REQUEST_CAPTURE_ERROR", {
        requestId: details.requestId,
        url: details.url,
        itemId: entry.itemId ?? itemIdFromUrl(details.url),
        method: entry.method,
        error: details.error,
      });
    },
    { urls: [PUBLISH_MUTATION_URL_PATTERN] }
  );

  logger.debug("PUBLISH_MUTATION_INSTRUMENTATION_INSTALLED", { pattern: PUBLISH_MUTATION_URL_PATTERN });
}
