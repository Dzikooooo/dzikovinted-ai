import { afterEach, describe, expect, it, vi } from "vitest";

// Meme piege deja documente pour deleteRequestInstrumentation.test.ts :
// logger.ts relaie via chrome.runtime.sendMessage, absent sous Vitest sans stub.
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from "../logger";

// Mission "ELARGISSEMENT AUTOMATISATION -- SUPPRIMER LE CLIC HUMAIN SUR
// AJOUTER" (2026-08-17) : couvre la capture PASSIVE (lecture seule,
// chrome.webRequest) des mutations sur /api/v2/item_upload/items* --
// creation ("Ajouter", POST) et edition ("Enregistrer", PUT, deja confirmee
// protegee par DataDome) confondues, distinguees par `method` dans le log.
// Voir l'en-tete de publishMutationInstrumentation.ts pour le pourquoi :
// l'URL exacte de creation n'est pas prouvee, seulement inferee par analogie
// de composant/namespace -- ce module confirme ou infirme cette hypothese au
// prochain clic reel sur "Ajouter", sans qu'aucune requete ne soit rejouee.

// Sous-ensemble minimal de chrome.webRequest.WebRequestDetails (+ champs
// specifiques a chaque evenement) reellement lu par
// publishMutationInstrumentation.ts.
interface MockRequestDetails {
  requestId: string;
  url: string;
  method?: string;
  requestBody?: { raw?: { bytes: ArrayBuffer }[] };
  requestHeaders?: { name: string; value?: string }[];
  statusCode?: number;
  responseHeaders?: { name: string; value?: string }[];
  error?: string;
}

type Listener = (details: MockRequestDetails) => void;

function makeWebRequestMock() {
  const onBeforeRequest: Listener[] = [];
  const onBeforeSendHeaders: Listener[] = [];
  const onCompleted: Listener[] = [];
  const onErrorOccurred: Listener[] = [];

  const webRequest = {
    onBeforeRequest: { addListener: vi.fn((fn: Listener) => onBeforeRequest.push(fn)) },
    onBeforeSendHeaders: { addListener: vi.fn((fn: Listener) => onBeforeSendHeaders.push(fn)) },
    onCompleted: { addListener: vi.fn((fn: Listener) => onCompleted.push(fn)) },
    onErrorOccurred: { addListener: vi.fn((fn: Listener) => onErrorOccurred.push(fn)) },
  };

  return {
    webRequest,
    fireBeforeRequest: (details: MockRequestDetails) => onBeforeRequest.forEach((fn) => fn(details)),
    fireBeforeSendHeaders: (details: MockRequestDetails) => onBeforeSendHeaders.forEach((fn) => fn(details)),
    fireCompleted: (details: MockRequestDetails) => onCompleted.forEach((fn) => fn(details)),
    fireErrorOccurred: (details: MockRequestDetails) => onErrorOccurred.forEach((fn) => fn(details)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("installPublishMutationInstrumentation", () => {
  it("capture une creation (POST, sans id) et l'identifie comme 'Ajouter'", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installPublishMutationInstrumentation: install } = await import("../publishMutationInstrumentation");
    install();

    const url = "https://www.vinted.fr/api/v2/item_upload/items";
    const bodyText = "title=Polo&price=15";
    const rawBytes = new TextEncoder().encode(bodyText).buffer;

    mock.fireBeforeRequest({ requestId: "req-1", url, method: "POST", requestBody: { raw: [{ bytes: rawBytes }] } });
    mock.fireBeforeSendHeaders({
      requestId: "req-1",
      url,
      requestHeaders: [
        { name: "Cookie", value: "_vinted_fr_session=super-secret" },
        { name: "x-csrf-token", value: "csrf-xyz" },
      ],
    });
    mock.fireCompleted({
      requestId: "req-1",
      url,
      method: "POST",
      statusCode: 200,
      responseHeaders: [{ name: "x-datadome", value: "protected" }],
    });

    expect(logger.info).toHaveBeenCalledWith(
      "PUBLISH_MUTATION_REQUEST_CAPTURED",
      expect.objectContaining({
        requestId: "req-1",
        url,
        itemId: null,
        method: "POST",
        likelyKind: "creation (Ajouter)",
        statusCode: 200,
        requestBody: bodyText,
      })
    );
    const call = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
      ([message]) => message === "PUBLISH_MUTATION_REQUEST_CAPTURED"
    );
    const detail = call?.[1] as Record<string, unknown>;
    const requestHeaders = detail.requestHeaders as Record<string, string>;
    const responseHeaders = detail.responseHeaders as Record<string, string>;
    expect(requestHeaders.Cookie).not.toContain("super-secret");
    expect(requestHeaders["x-csrf-token"]).toBe("csrf-xyz");
    expect(responseHeaders["x-datadome"]).toBe("protected");
  });

  it("capture une edition (PUT, avec id) et l'identifie comme 'Enregistrer'", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installPublishMutationInstrumentation: install } = await import("../publishMutationInstrumentation");
    install();

    const url = "https://www.vinted.fr/api/v2/item_upload/items/9684144856";
    mock.fireBeforeRequest({ requestId: "req-2", url, method: "PUT" });
    mock.fireCompleted({ requestId: "req-2", url, method: "PUT", statusCode: 200 });

    expect(logger.info).toHaveBeenCalledWith(
      "PUBLISH_MUTATION_REQUEST_CAPTURED",
      expect.objectContaining({ itemId: "9684144856", method: "PUT", likelyKind: "edition (Enregistrer, deja confirmee protegee)" })
    );
  });

  it("journalise une erreur reseau sans jamais lever", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installPublishMutationInstrumentation: install } = await import("../publishMutationInstrumentation");
    install();

    const url = "https://www.vinted.fr/api/v2/item_upload/items";
    mock.fireBeforeRequest({ requestId: "req-3", url, method: "POST" });
    mock.fireErrorOccurred({ requestId: "req-3", url, error: "net::ERR_BLOCKED_BY_CLIENT" });

    expect(logger.warn).toHaveBeenCalledWith(
      "PUBLISH_MUTATION_REQUEST_CAPTURE_ERROR",
      expect.objectContaining({ requestId: "req-3", method: "POST", error: "net::ERR_BLOCKED_BY_CLIENT" })
    );
  });

  it("reste silencieux (avertissement unique) si chrome.webRequest est indisponible, sans lever", async () => {
    vi.stubGlobal("chrome", {});
    vi.resetModules();
    const { installPublishMutationInstrumentation: install } = await import("../publishMutationInstrumentation");
    expect(() => install()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith("PUBLISH_MUTATION_INSTRUMENTATION_UNAVAILABLE", expect.any(Object));
  });

  it("ignore les lectures GET/HEAD (bruit) -- ne journalise jamais pour une methode non-mutante", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installPublishMutationInstrumentation: install } = await import("../publishMutationInstrumentation");
    install();

    const url = "https://www.vinted.fr/api/v2/wardrobe/12345/items";
    mock.fireBeforeRequest({ requestId: "req-get", url, method: "GET" });
    mock.fireCompleted({ requestId: "req-get", url, method: "GET", statusCode: 200 });

    expect(logger.info).not.toHaveBeenCalledWith("PUBLISH_MUTATION_REQUEST_CAPTURED", expect.anything());
  });

  it("capture desormais toute mutation sous /api/v2/* (filtre elargi), pas seulement item_upload/items -- audit 'endpoint reel inconnu'", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installPublishMutationInstrumentation: install } = await import("../publishMutationInstrumentation");
    install();

    // Hypothese "item_upload/items" volontairement PAS utilisee ici -- prouve
    // que la capture ne depend plus de cette hypothese precise.
    const url = "https://www.vinted.fr/api/v2/items";
    mock.fireBeforeRequest({ requestId: "req-other-endpoint", url, method: "POST" });
    mock.fireCompleted({ requestId: "req-other-endpoint", url, method: "POST", statusCode: 201 });

    expect(logger.info).toHaveBeenCalledWith(
      "PUBLISH_MUTATION_REQUEST_CAPTURED",
      expect.objectContaining({ url, method: "POST" })
    );
  });

  it("idempotent : un second appel n'enregistre pas de deuxieme jeu de listeners", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installPublishMutationInstrumentation: install } = await import("../publishMutationInstrumentation");
    install();
    install();
    expect(mock.webRequest.onCompleted.addListener).toHaveBeenCalledTimes(1);
  });
});
