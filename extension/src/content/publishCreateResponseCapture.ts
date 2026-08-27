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
//
// Mission "DIAGNOSTIC REQUEST BODY COULEUR" (2026-08-19) : run live confirme
// -- Couleur "Bleu" reellement selectionne/confirme en DOM (aria-checked=true),
// tous les autres champs visibles remplis, auto-submit declenche
// (AUTO_SUBMIT_TRIGGERED), mais Vinted repond 400 (transport xhr) sur CE
// POST precis. Le corps de REPONSE etait deja capture (bodyText ci-dessous),
// mais le corps de REQUETE envoye a Vinted ne l'etait jamais -- impossible
// jusqu'ici de savoir si le payload couleur est absent/incorrect ou si un
// AUTRE champ est en cause. Capture desormais AUSSI, de facon strictement
// passive (memes garanties que ci-dessus, jamais de lecture qui romprait la
// vraie requete) : la methode HTTP, le Content-Type (uniquement -- voir
// SAFE_REQUEST_HEADER_ALLOWLIST, jamais Authorization/Cookie/tout autre
// header), et le corps de requete exact quand il est directement lisible
// (string/URLSearchParams/FormData) sans jamais consommer un stream qui
// romprait l'envoi reel.
export const PUBLISH_CREATE_RESPONSE_EVENT_NAME = "resellos:publish-create-response-captured";
export const PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR = "data-resellos-publish-create-capture-installed";

export interface PublishCreateResponseCapture {
  url: string;
  statusCode: number;
  ok: boolean;
  bodyText: string;
  transport: "fetch" | "xhr";
  requestMethod: string;
  requestContentType: string | null;
  requestBodyText: string | null;
  requestBodyType: string;
}

const CREATE_URL_PATTERN = /\/api\/v2\/item_upload\/items$/;

// Allowlist STRICTE, jamais un blocklist -- ne capture jamais un header non
// explicitement liste ici, quel qu'il soit. "content-type" est le seul
// demande (point 3 de la mission) ; aucun autre header (Authorization,
// Cookie, x-csrf-token, etc.) n'est jamais lu ni journalise par ce module.
const SAFE_REQUEST_HEADER_ALLOWLIST = new Set(["content-type"]);

interface RequestBodyDescription {
  requestBodyText: string | null;
  requestBodyType: string;
}

// Purement descriptif -- ne consomme jamais un stream, ne modifie jamais
// l'objet body reel passe a fetch()/xhr.send(). Types directement lisibles
// sans effet de bord (string/URLSearchParams/FormData) sont restitues en
// texte ; tout le reste (Blob/ArrayBuffer/ReadableStream/objet inconnu) est
// honnetement rapporte par son nom de constructeur, jamais devine ni
// partiellement lu.
export function describeRequestBody(body: unknown): RequestBodyDescription {
  if (body === null || body === undefined) return { requestBodyText: null, requestBodyType: "none" };
  if (typeof body === "string") return { requestBodyText: body, requestBodyType: "string" };
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return { requestBodyText: body.toString(), requestBodyType: "URLSearchParams" };
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const parts: string[] = [];
    body.forEach((value, key) => {
      parts.push(`${key}=${typeof value === "string" ? value : "[binary]"}`);
    });
    return { requestBodyText: parts.join("&"), requestBodyType: "FormData" };
  }
  const ctorName = (body as { constructor?: { name?: string } })?.constructor?.name ?? typeof body;
  return { requestBodyText: null, requestBodyType: ctorName };
}

// Lit Content-Type depuis les 3 formes possibles de RequestInit.headers
// (Headers/tableau de paires/objet plain) -- jamais aucun autre header, voir
// SAFE_REQUEST_HEADER_ALLOWLIST.
export function extractContentTypeFromHeadersInit(headers: HeadersInit | undefined): string | null {
  if (!headers) return null;
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get("content-type");
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => SAFE_REQUEST_HEADER_ALLOWLIST.has(key.toLowerCase()));
    return found ? found[1] : null;
  }
  const entry = Object.entries(headers as Record<string, string>).find(([key]) => SAFE_REQUEST_HEADER_ALLOWLIST.has(key.toLowerCase()));
  return entry ? entry[1] : null;
}

type TaggedXhr = XMLHttpRequest & {
  __resellosMethod?: string;
  __resellosUrl?: string;
  __resellosContentType?: string | null;
};

export function installPublishCreateResponseCapture(): void {
  const w = window as typeof window & { __resellosPublishCreateCaptureInstalled?: boolean };
  if (w.__resellosPublishCreateCaptureInstalled) return;
  w.__resellosPublishCreateCaptureInstalled = true;

  patchFetch();
  patchXhr();

  document.documentElement.setAttribute(PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR, "1");
}

interface RequestDiagnostic {
  requestMethod: string;
  requestContentType: string | null;
  requestBodyText: string | null;
  requestBodyType: string;
}

function emitCapture(
  url: string,
  statusCode: number,
  ok: boolean,
  bodyText: string,
  transport: "fetch" | "xhr",
  request: RequestDiagnostic
): void {
  document.dispatchEvent(
    new CustomEvent(PUBLISH_CREATE_RESPONSE_EVENT_NAME, { detail: { url, statusCode, ok, bodyText, transport, ...request } })
  );
}

function patchFetch(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = function resellosPatchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const responsePromise = originalFetch(input, init);

    if (method !== "POST" || !CREATE_URL_PATTERN.test(url)) return responsePromise;

    // `input instanceof Request` avec `init` absent : le body reel vit sur
    // l'objet Request lui-meme (un ReadableStream) -- jamais lu ici (le lire
    // le consommerait et romprait la vraie requete). Cas standard (init
    // plain object, le plus courant pour un appel fetch(url, {method, body,
    // headers})) : lu via describeRequestBody(), jamais un stream.
    const requestInfo: RequestBodyDescription =
      input instanceof Request && init === undefined
        ? { requestBodyText: null, requestBodyType: "Request_object_not_read" }
        : describeRequestBody(init?.body);
    const requestContentType = extractContentTypeFromHeadersInit(init?.headers);

    responsePromise
      .then((response) => {
        response
          .clone()
          .text()
          .then((bodyText) =>
            emitCapture(url, response.status, response.ok, bodyText, "fetch", { requestMethod: method, requestContentType, ...requestInfo })
          )
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
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function resellosPatchedOpen(this: TaggedXhr, method: string, url: string | URL, ...rest: unknown[]) {
    this.__resellosMethod = method;
    this.__resellosUrl = typeof url === "string" ? url : url.toString();
    this.__resellosContentType = null;
    return (originalOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
  } as typeof XMLHttpRequest.prototype.open;

  // Garde defensive : uniquement patche si l'original existe reellement
  // (toujours vrai pour un vrai navigateur/jsdom) -- ne cree jamais une
  // methode qui n'existait pas, jamais d'interference si absente.
  if (typeof originalSetRequestHeader === "function") {
    XMLHttpRequest.prototype.setRequestHeader = function resellosPatchedSetRequestHeader(this: TaggedXhr, name: string, value: string) {
      if (SAFE_REQUEST_HEADER_ALLOWLIST.has(name.toLowerCase())) {
        this.__resellosContentType = value;
      }
      return originalSetRequestHeader.call(this, name, value);
    };
  }

  XMLHttpRequest.prototype.send = function resellosPatchedSend(this: TaggedXhr, ...sendArgs: unknown[]) {
    const method = (this.__resellosMethod ?? "GET").toUpperCase();
    const url = this.__resellosUrl ?? "";

    if (method === "POST" && CREATE_URL_PATTERN.test(url)) {
      const requestInfo = describeRequestBody(sendArgs[0]);
      attachXhrLoadCapture(this, url, {
        requestMethod: method,
        requestContentType: this.__resellosContentType ?? null,
        ...requestInfo,
      });
    }

    return (originalSend as (...args: unknown[]) => void).apply(this, sendArgs);
  } as typeof XMLHttpRequest.prototype.send;
}

function attachXhrLoadCapture(xhr: TaggedXhr, url: string, request: RequestDiagnostic): void {
  xhr.addEventListener("load", () => {
    try {
      const bodyText =
        xhr.responseType === "" || xhr.responseType === "text"
          ? xhr.responseText
          : typeof xhr.response === "string"
            ? xhr.response
            : JSON.stringify(xhr.response);
      emitCapture(url, xhr.status, xhr.status >= 200 && xhr.status < 300, bodyText, "xhr", request);
    } catch {
      // Corps illisible -- best-effort pur, ne doit jamais faire echouer la
      // vraie requete ni perturber les autres listeners.
    }
  });
}

// Mission "PAYLOAD DU PRIX" (2026-08-26) : le champ affiche "24,00 €" mais le
// POST /api/v2/item_upload/items repond 400 "prix >= 1.0". La question est
// donc UNIQUEMENT : que contient reellement le body envoye ? Ce resume evite
// d'avoir a fouiller un JSON de plusieurs Ko a la main, et surtout de deduire
// -- il rapporte la valeur telle quelle, y compris `null`/absente.
//
// Best-effort et strictement descriptif : jamais d'exception propagee, jamais
// de valeur inventee. Extraite en fonction generique (summarizeJsonPayloadKeys)
// pour la mission "BUG COULEUR -- PAYLOAD REEL" (2026-08-27, voir plus bas) :
// meme besoin exact que pour le prix (aria-checked confirme en DOM cote
// colorOptionReader.ts, mais Vinted rejette quand meme -- retour beta direct,
// "La couleur doit être renseignée" au clic final), jamais deux logiques de
// parcours JSON divergentes a maintenir.
function summarizeJsonPayloadKeys(
  requestBodyText: string | null,
  keyPattern: RegExp,
  pathsKey: string,
  pathCountKey: string
): Record<string, unknown> {
  if (!requestBodyText) return { parsed: false, reason: "body absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(requestBodyText);
  } catch {
    return { parsed: false, reason: "body non-JSON", length: requestBodyText.length };
  }
  const paths: Array<{ path: string; value: unknown; type: string }> = [];
  const visit = (node: unknown, path: string, depth: number): void => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (keyPattern.test(key)) {
        paths.push({ path: nextPath, value: typeof value === "object" ? "[object]" : value, type: typeof value });
      }
      visit(value, nextPath, depth + 1);
    }
  };
  try {
    visit(parsed, "", 0);
  } catch {
    return { parsed: false, reason: "parcours interrompu" };
  }
  return { parsed: true, [pathsKey]: paths, [pathCountKey]: paths.length };
}

// `pricePaths` liste toutes les cles dont le nom evoque un prix, ou qu'elles
// soient dans l'arbre -- on ne suppose pas la forme du payload Vinted.
export function summarizePricePayload(requestBodyText: string | null): Record<string, unknown> {
  return summarizeJsonPayloadKeys(requestBodyText, /price|currency|amount/i, "pricePaths", "pricePathCount");
}

// Mission "BUG COULEUR -- PAYLOAD REEL" (2026-08-27) : retour beta direct --
// "l'extension indique que la couleur est pré-remplie" (colorCommitConfirmed
// devient true, aria-checked="true" confirme AVANT et APRES fermeture du
// panneau, voir colorOptionReader.ts/attemptColorPrefill), pourtant Vinted
// affiche "La couleur doit être renseignée" au clic humain final sur
// "Publier". Ce n'est PAS une nouvelle hypothese en l'air : le diagnostic du
// 2026-08-19 (mission "DIAGNOSTIC REQUEST BODY COULEUR") avait deja capture
// UNE FOIS un POST 400 avec Couleur confirmee en DOM -- mais sans jamais
// isoler les cles couleur/marque/taille dans le corps de requete (seul le
// prix a recu ce traitement le 2026-08-26). La preuve DOM (aria-checked) ne
// prouve donc PAS a elle seule que Vinted a reellement committe la valeur
// cote formulaire -- exactement la meme classe de faux positif que le bug
// prix deja resolu. Rapporte desormais, cote a cote avec pricePayload, toutes
// les cles evoquant couleur/marque/taille/categorie/etat/matiere presentes
// dans le VRAI corps envoye -- preuve directe plutot qu'une nouvelle
// deduction, exploitable des le prochain test live reel (clic humain final
// sur "Publier", pas seulement AUTO_SUBMIT_TRIGGERED).
export function summarizeAttributePayload(requestBodyText: string | null): Record<string, unknown> {
  return summarizeJsonPayloadKeys(
    requestBodyText,
    /color|colour|brand|size|categor|condition|material|status/i,
    "attributePaths",
    "attributePathCount"
  );
}
