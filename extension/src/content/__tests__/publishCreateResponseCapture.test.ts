import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLISH_CREATE_RESPONSE_CAPTURE_INSTALLED_ATTR,
  PUBLISH_CREATE_RESPONSE_EVENT_NAME,
  installPublishCreateResponseCapture,
  describeRequestBody,
  extractContentTypeFromHeadersInit,
  summarizeAttributePayload,
  summarizePricePayload,
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

  // Mission "DIAGNOSTIC REQUEST BODY COULEUR" (2026-08-19).
  it("capture AUSSI le corps de requete exact, le Content-Type et la methode -- jamais un autre header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeJsonResponse(400, { code: 1 })));
    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    installPublishCreateResponseCapture();
    await window.fetch("https://www.vinted.fr/api/v2/item_upload/items", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret-should-never-be-captured" },
      body: JSON.stringify({ item: { title: "Pull", color_ids: [9] } }),
    });
    await flushMicrotasks();

    expect(received[0].detail).toMatchObject({
      requestMethod: "POST",
      requestContentType: "application/json",
      requestBodyType: "string",
    });
    expect(JSON.parse(received[0].detail.requestBodyText)).toEqual({ item: { title: "Pull", color_ids: [9] } });
    // Authorization ne doit JAMAIS apparaitre nulle part dans le detail capture.
    expect(JSON.stringify(received[0].detail)).not.toContain("secret-should-never-be-captured");
  });

  it("rapporte honnêtement un body Request non lu (jamais un stream consomme/devine)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeJsonResponse(200, { id: 1 })));
    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    installPublishCreateResponseCapture();
    const request = new Request("https://www.vinted.fr/api/v2/item_upload/items", { method: "POST" });
    await window.fetch(request);
    await flushMicrotasks();

    expect(received[0].detail).toMatchObject({ requestBodyText: null, requestBodyType: "Request_object_not_read" });
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

  // Mission "DIAGNOSTIC REQUEST BODY COULEUR" (2026-08-19) : run live reel --
  // c'est CE transport (xhr) qui a recu le 400 non diagnostique jusqu'ici.
  it("capture AUSSI le corps de requete XHR exact, le Content-Type (via setRequestHeader) et la methode", async () => {
    class StubXhrWithHeaders extends EventTarget {
      method = "";
      url = "";
      status = 0;
      responseType = "" as XMLHttpRequestResponseType;
      responseText = "";
      response: unknown = "";
      headers: Record<string, string> = {};
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      send(body?: unknown) {
        void body; // le body reel est lu par le patch AVANT d'appeler ce stub -- rien a faire ici
        setTimeout(() => {
          this.status = 400;
          this.responseText = JSON.stringify({ code: 1, errors: { color: ["doit être renseigné"] } });
          this.response = this.responseText;
          this.dispatchEvent(new Event("load"));
        }, 0);
      }
    }

    vi.stubGlobal("XMLHttpRequest", StubXhrWithHeaders as unknown as typeof XMLHttpRequest);
    installPublishCreateResponseCapture();

    const received: CustomEvent[] = [];
    document.addEventListener(PUBLISH_CREATE_RESPONSE_EVENT_NAME, (e) => received.push(e as CustomEvent));

    const xhr = new (window.XMLHttpRequest as unknown as typeof StubXhrWithHeaders)();
    xhr.open("POST", "https://www.vinted.fr/api/v2/item_upload/items");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Cookie", "session=should-never-be-captured");
    xhr.send(JSON.stringify({ item: { title: "Pull", attributes: [{ attribute_id: 12, value_id: null }] } }));

    await new Promise<void>((resolve) => xhr.addEventListener("load", () => resolve()));
    await flushMicrotasks();

    expect(received).toHaveLength(1);
    expect(received[0].detail).toMatchObject({
      statusCode: 400,
      ok: false,
      transport: "xhr",
      requestMethod: "POST",
      requestContentType: "application/json",
      requestBodyType: "string",
    });
    expect(JSON.parse(received[0].detail.requestBodyText)).toEqual({
      item: { title: "Pull", attributes: [{ attribute_id: 12, value_id: null }] },
    });
    expect(JSON.stringify(received[0].detail)).not.toContain("should-never-be-captured");
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

// Mission "DIAGNOSTIC REQUEST BODY COULEUR" (2026-08-19) : fonctions PURES,
// aucun effet de bord -- testables directement sans patcher fetch/XHR.
describe("describeRequestBody", () => {
  it("retourne none pour un body absent (null/undefined)", () => {
    expect(describeRequestBody(null)).toEqual({ requestBodyText: null, requestBodyType: "none" });
    expect(describeRequestBody(undefined)).toEqual({ requestBodyText: null, requestBodyType: "none" });
  });

  it("restitue une string telle quelle", () => {
    expect(describeRequestBody('{"a":1}')).toEqual({ requestBodyText: '{"a":1}', requestBodyType: "string" });
  });

  it("restitue un URLSearchParams via .toString()", () => {
    const params = new URLSearchParams({ a: "1", b: "2" });
    expect(describeRequestBody(params)).toEqual({ requestBodyText: "a=1&b=2", requestBodyType: "URLSearchParams" });
  });

  it("restitue un FormData en paires cle=valeur, jamais un binaire lu", () => {
    const fd = new FormData();
    fd.append("title", "Pull");
    fd.append("photo", new Blob(["x"]), "photo.jpg");
    const result = describeRequestBody(fd);
    expect(result.requestBodyType).toBe("FormData");
    expect(result.requestBodyText).toContain("title=Pull");
    expect(result.requestBodyText).toContain("photo=[binary]");
  });

  it("rapporte honnêtement un type inconnu (ex. Blob) sans jamais deviner son contenu", () => {
    const blob = new Blob(["binary content"]);
    const result = describeRequestBody(blob);
    expect(result.requestBodyText).toBeNull();
    expect(result.requestBodyType).toBe("Blob");
  });
});

describe("extractContentTypeFromHeadersInit", () => {
  it("retourne null quand aucun header n'est fourni", () => {
    expect(extractContentTypeFromHeadersInit(undefined)).toBeNull();
  });

  it("lit content-type depuis un objet Headers", () => {
    const headers = new Headers({ "Content-Type": "application/json" });
    expect(extractContentTypeFromHeadersInit(headers)).toBe("application/json");
  });

  it("lit content-type depuis un tableau de paires, insensible a la casse", () => {
    expect(extractContentTypeFromHeadersInit([["Content-Type", "application/json"]])).toBe("application/json");
  });

  it("lit content-type depuis un objet plain, insensible a la casse", () => {
    expect(extractContentTypeFromHeadersInit({ "content-type": "application/json" })).toBe("application/json");
  });

  it("ne capture JAMAIS un autre header (ex. Authorization), meme present dans le meme objet", () => {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer secret" };
    expect(extractContentTypeFromHeadersInit(headers)).toBe("application/json");
  });

  it("retourne null quand content-type est absent des headers fournis", () => {
    expect(extractContentTypeFromHeadersInit({ Authorization: "Bearer secret" })).toBeNull();
  });
});

// Mission "PAYLOAD DU PRIX" (2026-08-26) puis "BUG COULEUR -- PAYLOAD REEL"
// (2026-08-27) : les deux fonctions partagent desormais la meme traversee
// JSON generique (summarizeJsonPayloadKeys, non exportee) -- ces tests
// couvrent les deux comportements observables separement pour prouver que le
// partage n'a rien change au resultat de summarizePricePayload (deja en
// production) tout en validant le nouveau summarizeAttributePayload.
describe("summarizePricePayload", () => {
  it("rapporte parsed:false, reason:'body absent' quand aucun corps n'a ete capture", () => {
    expect(summarizePricePayload(null)).toEqual({ parsed: false, reason: "body absent" });
  });

  it("rapporte parsed:false, reason:'body non-JSON' avec la longueur pour un corps illisible", () => {
    expect(summarizePricePayload("not-json")).toEqual({ parsed: false, reason: "body non-JSON", length: 8 });
  });

  it("extrait toutes les cles evoquant un prix, y compris imbriquees, valeur telle quelle (meme null)", () => {
    const body = JSON.stringify({ item: { price: null, currency_code: "EUR" }, unrelated: "x" });
    const result = summarizePricePayload(body);
    expect(result.parsed).toBe(true);
    expect(result.pricePathCount).toBe(2);
    // typeof null === "object" en JS -- null est donc rapporte "[object]" au
    // meme titre qu'un vrai objet (meme discipline que le code : jamais de
    // cas particulier invente pour null, la fonction ne fait pas de distinction).
    expect(result.pricePaths).toEqual(
      expect.arrayContaining([
        { path: "item.price", value: "[object]", type: "object" },
        { path: "item.currency_code", value: "EUR", type: "string" },
      ])
    );
  });

  it("ne rapporte aucune cle attribut (couleur/marque/etc.) -- chaque fonction reste scopee a son domaine", () => {
    const body = JSON.stringify({ price: 24, color_ids: [9] });
    const result = summarizePricePayload(body);
    expect(result.pricePathCount).toBe(1);
  });
});

describe("summarizeAttributePayload", () => {
  it("rapporte parsed:false, reason:'body absent' quand aucun corps n'a ete capture", () => {
    expect(summarizeAttributePayload(null)).toEqual({ parsed: false, reason: "body absent" });
  });

  it("rapporte parsed:false, reason:'body non-JSON' avec la longueur pour un corps illisible", () => {
    expect(summarizeAttributePayload("not-json")).toEqual({ parsed: false, reason: "body non-JSON", length: 8 });
  });

  // Scenario exact du retour beta 2026-08-27 : ResellOS affiche la couleur
  // comme confirmee (aria-checked, cote DOM), mais le VRAI corps envoye a
  // Vinted ne porte aucun color_ids -- c'est precisement ce que ce test fige :
  // la cle est bien detectee et sa valeur reelle (ici vide) rapportee telle
  // quelle, jamais deduite/masquee.
  it("revele un color_ids vide malgre une confirmation DOM -- le scenario beta exact", () => {
    const body = JSON.stringify({ item: { color_ids: [], brand_id: 4273, size_id: null }, price: { amount: "24.00" } });
    const result = summarizeAttributePayload(body);
    expect(result.parsed).toBe(true);
    expect(result.attributePathCount).toBe(3);
    expect(result.attributePaths).toEqual(
      expect.arrayContaining([
        { path: "item.color_ids", value: "[object]", type: "object" },
        { path: "item.brand_id", value: 4273, type: "number" },
        { path: "item.size_id", value: "[object]", type: "object" }, // typeof null === "object"
      ])
    );
  });

  it("ignore les cles prix -- chaque fonction reste scopee a son domaine", () => {
    const body = JSON.stringify({ price: 24, currency: "EUR", color_ids: [9] });
    const result = summarizeAttributePayload(body);
    expect(result.attributePathCount).toBe(1);
  });

  it("detecte categorie/etat/matiere en plus de couleur/marque/taille", () => {
    const body = JSON.stringify({ category_id: 12, status_id: 2, material_ids: [3] });
    const result = summarizeAttributePayload(body);
    expect(result.attributePathCount).toBe(3);
  });
});
