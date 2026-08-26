// Mission "ECRITURE DU PRIX EN MONDE MAIN" (2026-08-26).
//
// PREUVE LIVE ayant impose ce changement d'architecture : apres avoir epuise
// toutes les variantes cote monde ISOLE (frappe caractere par caractere,
// insertion au curseur, insertion en fin de partie entiere, execCommand,
// setter + InputEvent complet + change + blur natif), le DOM affichait
// fidelement "24,00 €" et Vinted refusait quand meme le formulaire avec
// "Le champ prix doit etre superieur ou egal a 1.0". Le DOM etait donc
// correct et l'etat interne du composant vide.
//
// Cause structurelle : un content script tourne dans un monde ISOLE. Il
// partage le DOM avec la page mais PAS le contexte JS -- chaque monde a ses
// propres wrappers d'objets DOM. Deux consequences decisives ici :
//   1. `_valueTracker`, propriete expando posee par React sur l'element dans
//      le monde PRINCIPAL, est structurellement invisible depuis le monde
//      isole (d'ou le `trackerState: "absent"` observe en direct, qui ne
//      disait rien de sa presence reelle).
//   2. L'override de la propriete `value` installe par React sur l'element
//      vit lui aussi dans le monde principal : une ecriture depuis le monde
//      isole ne le traverse jamais.
//
// Ce module est donc concu pour etre charge comme content script MONDE MAIN
// (voir manifest.config.ts + priceMainWorldWriterBoot.ts). Il y execute
// exactement la sequence deja validee, mais DANS le contexte JS de React :
// setter de prototype -> reinitialisation du vrai `_valueTracker` ->
// InputEvent complet -> change.
//
// Pont ISOLE -> MAIN par CustomEvent sur `document`, meme mecanisme que
// publishCreateResponseCapture.ts. Un `requestId` correle demande et reponse
// (plusieurs ecritures peuvent se succeder dans un meme document).
//
// SURFACE VOLONTAIREMENT MINIMALE : ce module n'ecrit QUE dans un input
// portant le data-testid attendu, ne lit rien d'autre de la page, et
// n'expose aucune fonction sur `window`. La page pourrait emettre un faux
// evenement de reponse -- l'impact se limiterait a un statut de journal
// errone, jamais a une ecriture non sollicitee.
export const PRICE_WRITE_REQUEST_EVENT = "resellos:price-write-request";
export const PRICE_WRITE_RESULT_EVENT = "resellos:price-write-result";
export const PRICE_WRITER_INSTALLED_ATTR = "data-resellos-price-writer-installed";

// Audit C1 (2026-08-26) : allowlist stricte, jamais une blocklist. Le seul
// champ que ce module a vocation a ecrire est l'input prix de /items/new. Si
// Vinted change ce data-testid, la demande sera refusee et le monde isole
// prendra le relais (repli deja en place, voir formFill.ts) -- un echec
// visible plutot qu'un selecteur libre.
export const ALLOWED_PRICE_SELECTORS = new Set(['[data-testid="price-input--input"]']);

// Entier ou decimal a point/virgule, avec un maximum de 2 decimales. La chaine
// vide est acceptee : c'est l'effacement legitime du champ, et elle ne peut
// rien armer (patchPriceInRequestBody rejette toute valeur non finie ou <= 0).
export const NUMERIC_PRICE_PATTERN = /^$|^\d{1,7}([.,]\d{1,2})?$/;

export type PriceWriteRequestDetail = {
  requestId: string;
  selector: string;
  value: string;
};


export type PriceWriteResultDetail = {
  requestId: string;
  ok: boolean;
  reason?: "element_not_found" | "setter_unavailable" | "exception";
  trackerState: "reset" | "absent" | "unavailable";
  // Mission "CYCLE COMPLET EN MONDE MAIN" (2026-08-26) : dit a l'appelant
  // (monde isole) que le blur a deja eu lieu ICI, pour qu'il n'en emette pas
  // un second. Un blur redondant reprovoquerait tout le cycle onBlur de React.
  blurred: boolean;
  domValueAfter: string | null;
  errorMessage?: string;
};

function resetTracker(el: HTMLInputElement, writtenValue: string): PriceWriteResultDetail["trackerState"] {
  try {
    const tracker = (el as HTMLInputElement & { _valueTracker?: { setValue?: (v: string) => void } })._valueTracker;
    if (!tracker || typeof tracker.setValue !== "function") return "absent";
    // Le tracker doit differer de la valeur ecrite, sinon React conclut
    // "aucun changement" -- d'ou la sentinelle quand la cible est vide.
    tracker.setValue(writtenValue === "" ? "\u0001" : "");
    return "reset";
  } catch {
    return "unavailable";
  }
}

// Mission "CYCLE COMPLET EN MONDE MAIN" (2026-08-26) -- deux preuves live
// successives, toutes deux a conserver :
//
//  1. Le formulaire complet partait mais POST /api/v2/item_upload/items
//     repondait HTTP 400 ("Invalid parameter format for currency" cote Meta
//     Pixel) alors que le DOM affichait bien "24,00 €" : le prix n'etait
//     jamais serialise dans le payload. Le blur DANS ce monde a ete ajoute
//     pour cela -- c'est le handler onBlur de React qui commite la valeur.
//
//  2. Une variante intermediaire invoquait DIRECTEMENT le onChange porte par
//     les props React internes (`__reactProps…`) avec un objet target
//     partiel. Resultat live : le champ est repasse a "NaN €". A NE PAS
//     REESSAYER -- le composant derive un etat invalide des qu'il recoit
//     autre chose qu'un vrai SyntheticEvent. Aucune propriete privee de React
//     n'est plus touchee ici, hors la reinitialisation du _valueTracker
//     (necessaire a la detection de changement, et sans effet sur la valeur).
//
// Il ne reste donc que le cycle d'evenements STANDARD du navigateur, execute
// dans le contexte JS de React.
function performWrite(detail: PriceWriteRequestDetail): PriceWriteResultDetail {
  const el = document.querySelector<HTMLInputElement>(detail.selector);
  if (!el) {
    return {
      requestId: detail.requestId,
      ok: false,
      reason: "element_not_found",
      trackerState: "absent",
      blurred: false,
      domValueAfter: null,
    };
  }

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) {
    return {
      requestId: detail.requestId,
      ok: false,
      reason: "setter_unavailable",
      trackerState: "absent",
      blurred: false,
      domValueAfter: el.value,
    };
  }

  // Mission "INTERACTION UTILISATEUR COMPLETE" (2026-08-26) : enveloppe
  // pointer/souris avant l'ecriture, et keyup apres. Un formulaire qui
  // n'active sa validation qu'apres une interaction reelle (pattern courant :
  // un champ reste "pristine" tant qu'aucun evenement utilisateur ne l'a
  // touche) ne verra plus un champ jamais interagi.
  //
  // Ces evenements sont TOUS des evenements navigateur standards -- aucune
  // propriete privee de React n'est touchee, contrairement a la variante
  // __reactProps qui avait fait deriver le champ en NaN (voir l'en-tete).
  // Ils n'altèrent jamais la valeur : celle-ci reste ecrite UNE SEULE FOIS,
  // atomiquement, par le setter de prototype.
  const pointerInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
  };
  el.dispatchEvent(new PointerEvent("pointerdown", pointerInit));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, composed: true, button: 0 }));
  el.focus();
  el.dispatchEvent(new PointerEvent("pointerup", { ...pointerInit, button: 0 }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, composed: true, button: 0 }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, button: 0 }));
  el.select();

  setter.call(el, detail.value);
  const trackerState = resetTracker(el, detail.value);

  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: detail.value.length > 0 ? "insertText" : "deleteContentBackward",
      data: detail.value.length > 0 ? detail.value : null,
    })
  );

  // keyup du DERNIER caractere saisi -- pas de keydown/keypress par caractere :
  // annoncer plusieurs frappes alors que la valeur a ete ecrite en un bloc
  // recreerait exactement la contradiction evenement/valeur qui produisait le
  // NaN avant l'ecriture atomique (voir formFill.ts, historique du prix).
  const lastChar = detail.value.slice(-1);
  if (lastChar) {
    el.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: lastChar,
        code: /^[0-9]$/.test(lastChar) ? `Digit${lastChar}` : "",
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
  }

  el.dispatchEvent(new Event("change", { bubbles: true }));
  // blur() DANS le monde MAIN, apres les evenements : c'est le handler onBlur
  // de React qui commite la valeur dans l'etat du composant, et il ne peut le
  // faire que dans son propre contexte JS. Un blur emis depuis le monde isole
  // (comme au round precedent) produit bien les evenements DOM, mais React ne
  // voit pas le meme element ni le meme etat. Le monde isole ne doit donc plus
  // en emettre -- d'ou `blurred: true` dans la reponse.
  el.blur();

  return {
    requestId: detail.requestId,
    ok: true,
    trackerState,
    blurred: true,
    domValueAfter: el.value,
  };
}

export function installPriceMainWorldWriter(): void {
  // Idempotent : une seconde installation enregistrerait un listener de plus
  // sur `document`, et CHAQUE demande serait alors traitee deux fois -- donc
  // deux ecritures et deux paires input/change sur le meme champ.
  if (document.documentElement.hasAttribute(PRICE_WRITER_INSTALLED_ATTR)) return;

  document.addEventListener(PRICE_WRITE_REQUEST_EVENT, (event) => {
    const detail = (event as CustomEvent<PriceWriteRequestDetail>).detail;
    if (!detail || typeof detail.selector !== "string" || typeof detail.value !== "string") return;

    // Audit C1 (2026-08-26) : cet ecouteur vit sur `document` dans le monde
    // MAIN -- N'IMPORTE QUEL script de la page peut donc emettre cet
    // evenement. Sans ces deux controles, un tel script obtiendrait deux
    // pouvoirs qu'il n'a aucune raison d'avoir : ecrire une valeur arbitraire
    // dans n'importe quel input via un selecteur libre, et surtout armer le
    // prix que le patch reseau injectera dans le POST de creation.
    //
    // La demande legitime vient toujours du meme champ avec la meme forme de
    // valeur : on refuse tout le reste plutot que d'essayer de reconnaitre un
    // appelant (impossible sur un pont par evenement DOM).
    if (!ALLOWED_PRICE_SELECTORS.has(detail.selector)) return;
    if (!NUMERIC_PRICE_PATTERN.test(detail.value)) return;

    // Prix d'INTENTION memorise ici, jamais relu depuis le DOM : c'est la
    // seule source fiable pour le patch de payload ci-dessous.
    setIntendedPrice(detail.value);

    let result: PriceWriteResultDetail;
    try {
      result = performWrite(detail);
    } catch (err) {
      result = {
        blurred: false,
        requestId: detail.requestId,
        ok: false,
        reason: "exception",
        trackerState: "unavailable",
        domValueAfter: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
    document.dispatchEvent(new CustomEvent(PRICE_WRITE_RESULT_EVENT, { detail: result }));
  });

  // Attribut DOM plutot qu'un evenement "installe" : ce module tourne en
  // document_start et peut demarrer AVANT que le content script isole
  // (document_idle) n'ait pu enregistrer le moindre listener -- un evenement
  // serait perdu sans destinataire. Meme discipline que
  // PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR.
  document.documentElement.setAttribute(PRICE_WRITER_INSTALLED_ATTR, "1");

  installPricePayloadPatch();
}

// ---------------------------------------------------------------------------
// Mission "INJECTION DU PRIX DANS LE PAYLOAD" (2026-08-26)
//
// PREUVE DIRECTE (PUBLISH_CREATE_RESPONSE_EVENT_RECEIVED) :
//   requestBodyText   "price": null
//   responseBodyText  {"errors":[{"field":"price","value":"Le champ prix doit
//                     etre superieur ou egal a 1.0"}]}
// alors que le DOM affichait "24,00 €". React n'a jamais commite la valeur.
//
// CHANGEMENT DE NATURE, assume explicitement (autorise par l'utilisateur le
// 2026-08-26) : jusqu'ici tout ce projet etait strictement PASSIF sur le
// reseau -- publishCreateResponseCapture.ts ne bloque, ne modifie ni ne
// retarde jamais rien. Ce patch MODIFIE une requete sortante. Il est donc
// enferme dans des conditions etroites, et chaque substitution est
// journalisee -- jamais silencieuse.
//
// GARDE-FOUS (tous necessaires, aucun decoratif) :
//   1. Endpoint EXACT et methode POST uniquement.
//   2. Ne remplit QUE si le prix est absent/null/vide/0 -- ne remplace JAMAIS
//      un prix deja renseigne. Le jour ou React commite la valeur, ce patch
//      devient un no-op de lui-meme.
//   3. La valeur injectee vient de la DEMANDE D'ECRITURE (prix normalise
//      transmis par le monde isole), jamais d'une relecture du DOM : reparser
//      "24,00 €" reintroduirait exactement la classe de bug qu'on vient de
//      passer trois rounds a eliminer.
//   4. Sans prix d'intention enregistre, aucune modification n'a lieu -- une
//      publication manuelle de l'utilisateur n'est donc jamais touchee.
const CREATE_ITEM_URL_PATTERN = /\/api\/v2\/item_upload\/items$/;

export const PRICE_PAYLOAD_PATCHED_EVENT = "resellos:price-payload-patched";

// Audit C2 (2026-08-26) : le prix d'intention etait arme pour toute la duree
// de vie de la page, sans expiration ni remise a zero. Scenario de degat
// concret -- une republication arme 24 ; une publication ULTERIEURE dans le
// meme document envoie `price: null` (premiere publication, ou republication
// dont l'ecriture echoue avant d'armer la nouvelle valeur) et le patch injecte
// silencieusement l'ancien prix. Le garde-fou "ne remplit que si price est
// null" ne protege pas de ce cas : il est precisement declenche par lui.
//
// Deux verrous independants, chacun suffisant :
//   - remise a null des la PREMIERE substitution reussie (un prix arme ne sert
//     qu'a une seule creation) ;
//   - expiration par horodatage, qui couvre le cas ou aucune substitution
//     n'a lieu (ecriture reussie cote React, ou publication abandonnee).
const INTENDED_PRICE_TTL_MS = 120000;

let intendedPrice: string | null = null;
let intendedPriceSetAt = 0;

export function setIntendedPrice(value: string | null): void {
  intendedPrice = value;
  intendedPriceSetAt = value === null ? 0 : Date.now();
}

function readLiveIntendedPrice(): string | null {
  if (intendedPrice === null) return null;
  if (Date.now() - intendedPriceSetAt > INTENDED_PRICE_TTL_MS) {
    setIntendedPrice(null);
    return null;
  }
  return intendedPrice;
}

function isMissingPrice(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number") return value === 0;
  if (typeof value === "string") return Number.parseFloat(value.replace(",", ".")) === 0;
  return false;
}

// Renvoie le body modifie, ou null si rien n'a ete touche. Best-effort et sans
// exception propagee : une requete ne doit JAMAIS echouer a cause de ce patch.
export function patchPriceInRequestBody(bodyText: string): { patched: string; report: Record<string, unknown> } | null {
  const armed = readLiveIntendedPrice();
  if (armed === null) return null;
  const numeric = Number.parseFloat(armed.replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;

  // LIMITE ASSUMEE : seule une cle `price` DEJA PRESENTE est remplie. Une cle
  // totalement absente n'est jamais creee -- il faudrait deviner ou la placer
  // dans un schema qu'on n'a jamais observe, et inventer une structure serait
  // pire qu'un echec honnete. Le body reel observe en direct porte bien
  // `"price": null`, donc ce cas est couvert.
  const touched: Array<{ path: string; before: unknown; after: number }> = [];
  const visit = (node: Record<string, unknown>, path: string, depth: number): void => {
    if (depth > 6) return;
    for (const [key, value] of Object.entries(node)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (key === "price" && isMissingPrice(value)) {
        node[key] = numeric;
        touched.push({ path: nextPath, before: value, after: numeric });
        continue;
      }
      if (value !== null && typeof value === "object") visit(value as Record<string, unknown>, nextPath, depth + 1);
    }
  };
  try {
    visit(parsed as Record<string, unknown>, "", 0);
  } catch {
    return null;
  }
  if (touched.length === 0) return null;

  try {
    const patched = JSON.stringify(parsed);
    // Desarmement immediat : un prix arme ne sert qu'a UNE creation (audit C2).
    setIntendedPrice(null);
    return { patched, report: { touched, injectedValue: numeric, injectedType: "number" } };
  } catch {
    return null;
  }
}

function reportPatch(report: Record<string, unknown>): void {
  try {
    document.dispatchEvent(new CustomEvent(PRICE_PAYLOAD_PATCHED_EVENT, { detail: report }));
  } catch {
    /* journalisation best-effort -- ne doit jamais casser la requete */
  }
}

function shouldPatch(url: string, method: string): boolean {
  try {
    return method.toUpperCase() === "POST" && CREATE_ITEM_URL_PATTERN.test(new URL(url, location.href).pathname);
  } catch {
    return false;
  }
}

type TaggedPatchXhr = XMLHttpRequest & { __resellosPatchMethod?: string; __resellosPatchUrl?: string };

// Ce patch s'installe APRES publishCreateResponseCapture (ordre des entrees
// content_scripts du manifest) : il enveloppe donc le sien et s'execute AVANT
// lui. Consequence VOULUE -- la capture journalise le body DEJA corrige, ce qui
// rend la substitution verifiable directement dans
// PUBLISH_CREATE_RESPONSE_EVENT_RECEIVED plutot que sur parole.
export function installPricePayloadPatch(): void {
  const originalFetch = window.fetch;
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    let effectiveInit = init;
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (shouldPatch(url, method) && typeof init?.body === "string") {
        const result = patchPriceInRequestBody(init.body);
        if (result) {
          effectiveInit = { ...init, body: result.patched };
          reportPatch({ transport: "fetch", ...result.report });
        }
      }
    } catch {
      /* jamais bloquer la requete reelle */
    }
    return originalFetch.call(this, input as RequestInfo, effectiveInit);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function patchedOpen(this: TaggedPatchXhr, method: string, url: string | URL) {
    this.__resellosPatchMethod = method;
    this.__resellosPatchUrl = typeof url === "string" ? url : url.href;
    return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>);
  } as typeof XMLHttpRequest.prototype.open;

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function patchedSend(this: TaggedPatchXhr, body?: Document | XMLHttpRequestBodyInit | null) {
    try {
      const url = this.__resellosPatchUrl ?? "";
      const method = this.__resellosPatchMethod ?? "GET";
      if (shouldPatch(url, method) && typeof body === "string") {
        const result = patchPriceInRequestBody(body);
        if (result) {
          reportPatch({ transport: "xhr", ...result.report });
          return originalSend.call(this, result.patched);
        }
      }
    } catch {
      /* jamais bloquer la requete reelle */
    }
    return originalSend.call(this, body as XMLHttpRequestBodyInit);
  };
}
