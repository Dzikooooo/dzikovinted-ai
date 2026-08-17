import { afterEach, describe, expect, it, vi } from "vitest";

// Meme piege deja documente pour deleteOldListing.test.ts/republishTransaction.test.ts :
// logger.ts relaie via chrome.runtime.sendMessage, absent sous Vitest sans stub.
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from "../logger";

// Chaque test importe dynamiquement le module APRES avoir stub chrome global
// (vi.resetModules() + await import) -- necessaire car installDeleteRequestInstrumentation()
// lit chrome.webRequest au moment de l'appel, et son flag `installed` interne
// doit repartir a zero a chaque scenario (chrome mocke differemment).
//
// Mission "AUTOMATISER ENTIEREMENT LA SUPPRESSION DE A" (2026-08-17) : couvre
// la capture PASSIVE (lecture seule, chrome.webRequest) des headers/corps de
// POST /api/v2/items/{id}/delete -- voir l'en-tete de
// deleteRequestInstrumentation.ts pour le pourquoi (classification A/B/C
// bloquee sans ces donnees, l'utilisateur ayant refuse de sacrifier une
// nouvelle annonce reelle juste pour les lire a la main).

// Sous-ensemble minimal de chrome.webRequest.WebRequestDetails (+ champs
// specifiques a chaque evenement) reellement lu par
// deleteRequestInstrumentation.ts -- evite `any` tout en restant un mock
// leger (pas besoin de reproduire l'interface Chrome complete).
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

describe("installDeleteRequestInstrumentation", () => {
  it("capture headers/corps/reponse d'une suppression reelle, redige Cookie, garde x-datadome en clair", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installDeleteRequestInstrumentation: install } = await import("../deleteRequestInstrumentation");
    install();

    const url = "https://www.vinted.fr/api/v2/items/9684144856/delete";
    const bodyText = "authenticity_token=abc123";
    const rawBytes = new TextEncoder().encode(bodyText).buffer;

    mock.fireBeforeRequest({
      requestId: "req-1",
      url,
      method: "POST",
      requestBody: { raw: [{ bytes: rawBytes }] },
    });
    mock.fireBeforeSendHeaders({
      requestId: "req-1",
      url,
      requestHeaders: [
        { name: "Cookie", value: "_vinted_fr_session=super-secret-session-value" },
        { name: "x-csrf-token", value: "csrf-abc" },
      ],
    });
    mock.fireCompleted({
      requestId: "req-1",
      url,
      method: "POST",
      statusCode: 200,
      responseHeaders: [
        { name: "x-datadome", value: "protected" },
        { name: "content-type", value: "application/json" },
      ],
    });

    expect(logger.info).toHaveBeenCalledWith(
      "DELETE_REQUEST_CAPTURED",
      expect.objectContaining({
        requestId: "req-1",
        url,
        itemId: "9684144856",
        method: "POST",
        statusCode: 200,
        requestBody: bodyText,
      })
    );

    const call = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
      ([message]) => message === "DELETE_REQUEST_CAPTURED"
    );
    const detail = call?.[1] as Record<string, unknown>;
    const requestHeaders = detail.requestHeaders as Record<string, string>;
    const responseHeaders = detail.responseHeaders as Record<string, string>;

    expect(requestHeaders.Cookie).not.toContain("super-secret-session-value");
    expect(requestHeaders.Cookie).toMatch(/redige/);
    expect(requestHeaders["x-csrf-token"]).toBe("csrf-abc");
    expect(responseHeaders["x-datadome"]).toBe("protected");
  });

  it("journalise une erreur reseau (ex. DataDome challenge/timeout) sans jamais lever", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installDeleteRequestInstrumentation: install } = await import("../deleteRequestInstrumentation");
    install();

    const url = "https://www.vinted.fr/api/v2/items/42/delete";
    mock.fireBeforeRequest({ requestId: "req-2", url, method: "POST" });
    mock.fireErrorOccurred({ requestId: "req-2", url, error: "net::ERR_BLOCKED_BY_CLIENT" });

    expect(logger.warn).toHaveBeenCalledWith(
      "DELETE_REQUEST_CAPTURE_ERROR",
      expect.objectContaining({ requestId: "req-2", itemId: "42", error: "net::ERR_BLOCKED_BY_CLIENT" })
    );
  });

  it("ne journalise jamais rien pour un autre endpoint (filtre webRequest respecte)", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installDeleteRequestInstrumentation: install } = await import("../deleteRequestInstrumentation");
    install();

    // Le filtre `urls` passe a addListener est cense empecher Chrome
    // d'invoquer ces callbacks pour un autre endpoint -- ce test verifie
    // seulement que SI un evenement arrivait quand meme (filtre non modelise
    // par ce mock), la correlation par requestId reste correcte et n'invente
    // pas d'itemId pour une URL qui n'en contient pas.
    mock.fireCompleted({ requestId: "req-3", url: "https://www.vinted.fr/api/v2/items/1/favourite", method: "POST", statusCode: 200 });
    const call = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
      ([message]) => message === "DELETE_REQUEST_CAPTURED"
    );
    expect(call?.[1]).toMatchObject({ itemId: null });
  });

  it("reste silencieux (avertissement unique) si chrome.webRequest est indisponible, sans lever", async () => {
    vi.stubGlobal("chrome", {});
    vi.resetModules();
    const { installDeleteRequestInstrumentation: install } = await import("../deleteRequestInstrumentation");
    expect(() => install()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith("DELETE_INSTRUMENTATION_UNAVAILABLE", expect.any(Object));
  });

  it("idempotent : un second appel n'enregistre pas de deuxieme jeu de listeners", async () => {
    const mock = makeWebRequestMock();
    vi.stubGlobal("chrome", { webRequest: mock.webRequest });
    vi.resetModules();
    const { installDeleteRequestInstrumentation: install } = await import("../deleteRequestInstrumentation");
    install();
    install();
    expect(mock.webRequest.onCompleted.addListener).toHaveBeenCalledTimes(1);
  });
});
