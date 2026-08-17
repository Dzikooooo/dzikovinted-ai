import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR,
  PUBLISH_CREATE_RESPONSE_EVENT_NAME,
  installPublishCreateResponseCapture,
} from "../publishCreateResponseCapture";

// Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17) : dernier
// trou de preuve avant implementation -- chrome.webRequest ne peut pas lire
// un corps de reponse (limite structurelle de l'API), donc le corps de
// POST /api/v2/item_upload/items n'a jamais ete capture.
//
// AUDIT POST-ECHEC (meme date, test live reel) : la 1ere version ne
// capturait rien malgre une creation reussie. Deux causes identifiees et
// couvertes ici : (1) seul fetch etait patche -- Vinted peut emettre cette
// mutation via XMLHttpRequest ; (2) l'injection etait trop tardive --
// desormais deplacee en document_start/monde MAIN (voir
// publishCreateResponseCaptureBoot.ts + manifest.config.ts), non testable
// directement ici (depend du cycle de vie reel d'un content script), mais
// la fonction elle-meme reste testable comme une fonction pure sur
// `window`/`document`, exactement comme waitForTrustedClick (vinted-item.ts).
//
// Discipline testee : strictement PASSIF pour les deux transports (jamais
// de blocage/modification de la vraie requete/du vrai XHR), capture
// UNIQUEMENT la mutation de creation finale (POST exact vers
// /api/v2/item_upload/items, jamais le PUT d'edition avec id en suffixe,
// jamais une lecture GET, jamais un autre endpoint), idempotent (double
// installation sans double-patch), et pose un marqueur DOM lisible sans
// course pour la confirmation d'installation.

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// installPublishCreateResponseCapture() patche XMLHttpRequest.prototype.open/
// send DIRECTEMENT (pas une reassignation de propriete globale comme pour
// fetch) -- vi.unstubAllGlobals() seul ne suffit donc pas a nettoyer entre
// les tests : sans restauration explicite, chaque test s'empilerait sur le
// patch du precedent et polluerait durablement le XMLHttpRequest natif de
// jsdom pour le reste du fichier. Captures une seule fois, au chargement du
// module, avant tout appel a installPublishCreateResponseCapture().
const nativeXhrOpen = XMLHttpRequest.prototype.open;
const nativeXhrSend = XMLHttpRequest.prototype.send;

afterEach(() => {
  vi.unstubAllGlobals();
  XMLHttpRequest.prototype.open = nativeXhrOpen;
  XMLHttpRequest.prototype.send = nativeXhrSend;
  delete (window as typeof window & { __resellosPublishCreateCaptureInstalled?: boolean })
    .__resellosPublishCreateCaptureInstalled;
  document.documentElement.removeAttribute(PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR);
});

describe("installPublishCreateResponseCapture -- transport fetch", () => {
  it("capture la reponse d'un POST exact vers /api/v2/item_upload/items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeJsonResponse(200, { id: 123, temp_uuid: "abc" })));
    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    installPublishCreateResponseCapture();
    await window.fetch("https://www.vinted.fr/api/v2/item_upload/items", { method: "POST", body: "{}" });
    await flushMicrotasks();

    expect(received).toHaveLength(1);
    expect(received[0].detail).toMatchObject({
      url: "https://www.vinted.fr/api/v2/item_upload/items",
      statusCode: 200,
      ok: true,
      transport: "fetch",
    });
    expect(JSON.parse(received[0].detail.bodyText)).toEqual({ id: 123, temp_uuid: "abc" });
  });

  it("ne capture jamais une lecture GET, meme sur le meme endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeJsonResponse(200, { items: [] })));
    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    installPublishCreateResponseCapture();
    await window.fetch("https://www.vinted.fr/api/v2/item_upload/items", { method: "GET" });
    await flushMicrotasks();

    expect(received).toHaveLength(0);
  });

  it("ne capture jamais le PUT d'edition (id en suffixe) -- endpoint distinct, deja connu protege", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeJsonResponse(200, {})));
    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    installPublishCreateResponseCapture();
    await window.fetch("https://www.vinted.fr/api/v2/item_upload/items/9684144856", { method: "PUT" });
    await flushMicrotasks();

    expect(received).toHaveLength(0);
  });

  it("ne capture jamais une autre mutation (endpoint non cible)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeJsonResponse(200, {})));
    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    installPublishCreateResponseCapture();
    await window.fetch("https://www.vinted.fr/api/v2/photos", { method: "POST" });
    await flushMicrotasks();

    expect(received).toHaveLength(0);
  });

  it("laisse la requete originale strictement intacte -- le code appelant recoit un Response normalement consommable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeJsonResponse(201, { id: 42 })));
    installPublishCreateResponseCapture();

    const response = await window.fetch("https://www.vinted.fr/api/v2/item_upload/items", { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: 42 });
  });
});

describe("installPublishCreateResponseCapture -- transport XMLHttpRequest", () => {
  // jsdom ne fournit pas de vrai reseau (aucun serveur a contacter), donc un
  // vrai cycle open/send se resoudrait en erreur reseau plutot qu'en "load"
  // -- on substitue XMLHttpRequest par un stub minimal qui emet un
  // evenement "load" de facon deterministe, exactement comme le ferait un
  // vrai navigateur recevant une reponse 200. Le patch teste ici est
  // exactement celui applique par installPublishCreateResponseCapture sur
  // XMLHttpRequest.prototype.open/send -- seul le transport reseau
  // sous-jacent est remplace, pas le mecanisme de capture.

  it("capture le body via un stub XHR deterministe (open+send patches, load simule)", async () => {
    class StubXhr extends EventTarget {
      method = "";
      url = "";
      status = 0;
      responseType = "" as XMLHttpRequestResponseType;
      responseText = "";
      response: unknown = "";
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      send() {
        // Simule une reponse reseau reussie de facon asynchrone, comme un vrai XHR.
        setTimeout(() => {
          this.status = 200;
          this.responseText = JSON.stringify({ id: 999 });
          this.response = this.responseText;
          this.dispatchEvent(new Event("load"));
        }, 0);
      }
    }

    vi.stubGlobal("XMLHttpRequest", StubXhr as unknown as typeof XMLHttpRequest);
    installPublishCreateResponseCapture();

    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    const xhr = new (window.XMLHttpRequest as unknown as typeof StubXhr)();
    xhr.open("POST", "https://www.vinted.fr/api/v2/item_upload/items");
    xhr.send();

    await new Promise<void>((resolve) => xhr.addEventListener("load", () => resolve()));
    await flushMicrotasks();

    expect(received).toHaveLength(1);
    expect(received[0].detail).toMatchObject({
      url: "https://www.vinted.fr/api/v2/item_upload/items",
      statusCode: 200,
      ok: true,
      transport: "xhr",
    });
    expect(JSON.parse(received[0].detail.bodyText)).toEqual({ id: 999 });
  });

  it("ne capture jamais un XHR GET ni un XHR vers un autre endpoint", async () => {
    class StubXhr extends EventTarget {
      method = "";
      url = "";
      status = 0;
      responseType = "" as XMLHttpRequestResponseType;
      responseText = "{}";
      response = "{}";
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      send() {
        setTimeout(() => {
          this.status = 200;
          this.dispatchEvent(new Event("load"));
        }, 0);
      }
    }

    vi.stubGlobal("XMLHttpRequest", StubXhr as unknown as typeof XMLHttpRequest);
    installPublishCreateResponseCapture();

    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    const xhrGet = new (window.XMLHttpRequest as unknown as typeof StubXhr)();
    xhrGet.open("GET", "https://www.vinted.fr/api/v2/item_upload/items");
    xhrGet.send();
    await new Promise<void>((resolve) => xhrGet.addEventListener("load", () => resolve()));

    const xhrOther = new (window.XMLHttpRequest as unknown as typeof StubXhr)();
    xhrOther.open("POST", "https://www.vinted.fr/api/v2/photos");
    xhrOther.send();
    await new Promise<void>((resolve) => xhrOther.addEventListener("load", () => resolve()));

    await flushMicrotasks();
    expect(received).toHaveLength(0);
  });
});

describe("installPublishCreateResponseCapture -- marqueur d'installation et idempotence", () => {
  it("pose l'attribut DOM de confirmation d'installation", () => {
    expect(document.documentElement.hasAttribute(PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR)).toBe(false);
    installPublishCreateResponseCapture();
    expect(document.documentElement.getAttribute(PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR)).toBe("1");
  });

  it("idempotent : une seconde installation ne patche pas window.fetch une seconde fois", () => {
    installPublishCreateResponseCapture();
    const patchedOnce = window.fetch;
    installPublishCreateResponseCapture();

    expect(window.fetch).toBe(patchedOnce);
  });
});
