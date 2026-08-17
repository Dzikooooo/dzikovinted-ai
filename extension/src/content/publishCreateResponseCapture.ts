// Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17) --
// dernier trou de preuve avant implementation : chrome.webRequest (deja
// utilise par publishMutationInstrumentation.ts) ne peut PAS lire le corps
// d'une reponse -- limite structurelle de l'API, pas quelque chose a
// contourner en devinant. Le corps de la reponse de
// POST /api/v2/item_upload/items (le seul moyen honnete d'identifier B avec
// certitude, voir la mission) n'a donc encore jamais ete capture.
//
// Seul un contexte qui voit la Response/XHR JS elle-meme peut la lire -- ce
// qui exige de tourner dans le MEME monde JS que le bundle Vinted qui emet
// cette requete. Un content script s'execute dans un monde ISOLATED : il a
// SON PROPRE window.fetch/XMLHttpRequest, distinct de celui de la page, et
// ne verrait jamais un appel emis par le JS de Vinted meme en patchant son
// propre window. installPublishCreateResponseCapture() est donc concue pour
// etre chargee comme un content script MONDE MAIN (voir manifest.config.ts
// + publishCreateResponseCaptureBoot.ts, le point d'entree qui l'invoque).
//
// CAUSE RACINE CONFIRMEE (test live 2026-08-17) : la premiere version
// n'observait rien alors que la creation avait reellement reussi
// (chrome.webRequest avait deja prouve POST .../item_upload/items -> 200).
// Deux causes cumulees, toutes deux corrigees ici :
//   1. Injection TROP TARDIVE -- l'ancien mecanisme (chrome.scripting.
//      executeScript({func, world:"MAIN"}) depuis handlePublishListing.ts,
//      declenche sur chrome.tabs.onUpdated status "complete") s'executait
//      bien apres que le bundle JS de Vinted ait deja fini de charger et
//      tres probablement deja capture sa PROPRE reference native de
//      fetch/XMLHttpRequest (pattern courant des clients HTTP bundles :
//      `const _fetch = window.fetch` une seule fois a l'initialisation).
//      Patcher window.fetch APRES cette capture ne peut plus rien
//      intercepter, meme si le clic humain sur "Ajouter" survient bien
//      plus tard. Seule une injection en document_start (avant TOUT script
//      de la page) garantit que ce module patche les methodes natives
//      avant que quoi que ce soit d'autre n'ait pu en sauvegarder une
//      reference.
//   2. Transport non couvert -- seul window.fetch etait patche. Si Vinted
//      utilise XMLHttpRequest (cas frequent des clients HTTP navigateur,
//      ex. axios sans adapter fetch explicite), aucune requete fetch()
//      n'est jamais emise pour cette mutation et le patch ne voit rien.
//      XMLHttpRequest.prototype.open/send sont desormais patches en plus.
//
// Strictement passif dans les deux cas : la requete originale part et
// revient exactement comme sans ce patch (jamais de blocage, de
// modification, de retard). Pour fetch, .clone() AVANT .text() garantit un
// Response intact et entierement consommable par le code de Vinted. Pour
// XHR, la lecture de responseText/response se fait apres l'evenement
// "load" (la requete est deja entierement terminee cote reseau) et
// n'interfere avec aucun handler existant (addEventListener, pas
// remplacement de onload).
//
// Correlation MAIN world -> ISOLATED world (content script) via un
// CustomEvent sur `document` pour la CAPTURE elle-meme (mecanisme standard
// de ce pont, voir vinted-publish.ts::bootPublishContentScript) -- mais PAS
// pour la confirmation d'installation : en document_start, ce module peut
// s'executer AVANT que le content script ISOLATED (document_idle) n'ait eu
// la moindre chance d'enregistrer son listener, donc un CustomEvent emis
// ici pour signaler "installe" serait perdu sans destinataire. Un attribut
// DOM (PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR), lui, persiste sur
// l'element et peut etre lu sans course des que le content script ISOLATED
// demarre (document_idle survient TOUJOURS apres document_start).
//
// Instrumentation TEMPORAIRE/ciblee (demande explicite) : capture UNIQUEMENT
// la mutation de creation finale (POST exact vers /api/v2/item_upload/items,
// jamais le PUT d'edition qui porte un id en suffixe, jamais un autre
// endpoint) -- rien d'autre n'est observe ni modifie.

export const PUBLISH_CREATE_RESPONSE_EVENT_NAME = "resellos:publish-create-response-captured";
export const PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR = "data-resellos-publish-create-capture-installed";

export interface PublishCreateResponseCapture {
  url: string;
  statusCode: number;
  ok: boolean;
  bodyText: string;
  transport: "fetch" | "xhr";
}

const CREATE_URL_PATTERN = /\/api\/v2\/item_upload\/items$/;

type TaggedXhr = XMLHttpRequest & { __resellosMethod?: string; __resellosUrl?: string };

export function installPublishCreateResponseCapture(): void {
  const w = window as typeof window & { __resellosPublishCreateCaptureInstalled?: boolean };
  if (w.__resellosPublishCreateCaptureInstalled) return;
  w.__resellosPublishCreateCaptureInstalled = true;

  patchFetch();
  patchXhr();

  document.documentElement.setAttribute(PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR, "1");
}

function emitCapture(url: string, statusCode: number, ok: boolean, bodyText: string, transport: "fetch" | "xhr"): void {
  document.dispatchEvent(
    new CustomEvent(PUBLISH_CREATE_RESPONSE_EVENT_NAME, { detail: { url, statusCode, ok, bodyText, transport } })
  );
}

function patchFetch(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = function resellosPatchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const responsePromise = originalFetch(input, init);

    if (method !== "POST" || !CREATE_URL_PATTERN.test(url)) return responsePromise;

    responsePromise
      .then((response) => {
        response
          .clone()
          .text()
          .then((bodyText) => emitCapture(url, response.status, response.ok, bodyText, "fetch"))
          .catch(() => {
            // Corps illisible (deja consomme autrement, stream errone...) --
            // best-effort pur, ne doit jamais faire echouer la vraie requete.
          });
      })
      .catch(() => {
        // response rejetee (erreur reseau) -- rien a capturer, la requete
        // originale echoue normalement pour le code de Vinted, inchangee.
      });

    return responsePromise;
  };
}

function patchXhr(): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function resellosPatchedOpen(this: TaggedXhr, method: string, url: string | URL, ...rest: unknown[]) {
    this.__resellosMethod = method;
    this.__resellosUrl = typeof url === "string" ? url : url.toString();
    return (originalOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function resellosPatchedSend(this: TaggedXhr, ...sendArgs: unknown[]) {
    const method = (this.__resellosMethod ?? "GET").toUpperCase();
    const url = this.__resellosUrl ?? "";

    if (method === "POST" && CREATE_URL_PATTERN.test(url)) {
      attachXhrLoadCapture(this, url);
    }

    return (originalSend as (...args: unknown[]) => void).apply(this, sendArgs);
  } as typeof XMLHttpRequest.prototype.send;
}

function attachXhrLoadCapture(xhr: TaggedXhr, url: string): void {
  xhr.addEventListener("load", () => {
    try {
      const bodyText =
        xhr.responseType === "" || xhr.responseType === "text"
          ? xhr.responseText
          : typeof xhr.response === "string"
            ? xhr.response
            : JSON.stringify(xhr.response);
      emitCapture(url, xhr.status, xhr.status >= 200 && xhr.status < 300, bodyText, "xhr");
    } catch {
      // Corps illisible -- best-effort pur, ne doit jamais faire echouer la
      // vraie requete ni perturber les autres listeners.
    }
  });
}
