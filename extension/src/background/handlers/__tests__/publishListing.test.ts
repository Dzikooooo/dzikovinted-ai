import { afterEach, describe, expect, it, vi } from "vitest";

// publishListing.ts importe enrichListing.ts -> sync.ts -> supabaseClient.ts
// (createClient() top-level, tente chrome.storage.local.get des l'import --
// voir enrichListing.test.ts pour le detail). fetchPhoto() n'a rien a voir
// avec ce chemin, mais l'import du MODULE entier l'evalue quand meme --
// meme mock que partout ailleurs dans ce paquet pour ce probleme precis.
//
// Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
// (2026-08-17) : listKnownVintedItemIds/findListingsByVintedItemIds AJOUTES
// -- publishListing.ts les appelle desormais directement (reconciliation
// post-submit CAS B, /member/{userId}). Mockes ici avec des defauts
// permissifs (ensemble/liste vides) ; chaque test qui exerce reellement le
// CAS B fournit son propre mockImplementation cible.
vi.mock("../../sync", () => ({
  recordSingleItemImport: vi.fn(),
  listKnownVintedItemIds: vi.fn().mockResolvedValue(new Set()),
  findListingsByVintedItemIds: vi.fn().mockResolvedValue([]),
}));

// Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
// (2026-08-17) : syncCoordinator.startAccountSync() est desormais reutilise
// TEL QUEL par la reconciliation CAS B -- mocke ici (jamais le vrai module,
// qui attend de vraies correlations ACCOUNT_DETECTED/LISTINGS_DETECTED
// organiques, hors de portee d'un test unitaire de publishListing.ts).
vi.mock("../../syncCoordinator", () => ({
  startAccountSync: vi.fn(),
}));

// Mission "NOUVEAU TEST LIVE" (2026-08-11), item 10 : preuve que
// handlePublishListing() cablait bien enrichListingIfNeeded() -> fetchAllPhotos
// SUR LE PAYLOAD RETOURNE (pas l'original) -- mocke ici au niveau module
// entier (mock manuel, comportement controle par chaque test) plutot qu'avec
// le vrai enrichListing.ts (deja teste isolement dans enrichListing.test.ts,
// round-trip chrome.tabs complet) : ce fichier ne doit prouver QUE le
// cablage handlePublishListing <-> enrichListingIfNeeded, jamais re-tester
// l'extraction elle-meme.
vi.mock("../enrichListing", () => ({
  enrichListingIfNeeded: vi.fn(),
}));

import { fetchPhoto, handlePublishListing } from "../publishListing";
import { enrichListingIfNeeded } from "../enrichListing";
import { findListingsByVintedItemIds, listKnownVintedItemIds } from "../../sync";
import { startAccountSync } from "../../syncCoordinator";
import type { PublishListingPayload, RunActionRequest } from "../../../lib/messages";

// Audit "prefill partiel" (2026-08-10) : preuve LIVE que le fetch() d'une
// photo Vinted (images1.vinted.net) echoue quand il est emis depuis le
// content script (CORS de la page hote vinted.fr) -- fetchPhoto() est
// desormais appelee UNIQUEMENT depuis handlePublishListing.ts (background,
// beneficie de host_permissions, voir manifest.config.ts). Ces tests
// couvrent uniquement la logique pure de fetchPhoto() elle-meme (succes/
// echec HTTP/exception reseau) avec un fetch global mocke -- ils ne
// prouvent PAS que host_permissions fait reellement passer le fetch en
// conditions Chrome reelles, seul un test live peut le confirmer (voir
// rapport).
// Mission "5 photos non reconnues comme images" (2026-08-11) : fetchPhoto()
// lit desormais response.headers/.url/.redirected pour le diagnostic
// (httpStatus/contentTypeHeader/...) -- tout mock de reponse doit donc
// porter un `headers` reel (Headers), meme quand le test ne verifie pas ces
// champs precis.
function makeMockResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    url: "https://images1.vinted.net/photo123.jpg",
    redirected: false,
    headers: new Headers(),
    ...overrides,
  };
}

describe("fetchPhoto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a FetchedPhoto with a real ArrayBuffer on success", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const blob = { type: "image/jpeg", arrayBuffer: async () => bytes.buffer };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeMockResponse({ blob: async () => blob }))
    );

    const result = await fetchPhoto("https://images1.vinted.net/photo123.jpg");

    expect(result.error).toBeNull();
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.fileName).toBe("photo123.jpg");
    expect(result.arrayBuffer).not.toBeNull();
    expect(new Uint8Array(result.arrayBuffer!)).toEqual(bytes);
  });

  it("returns arrayBuffer:null with the HTTP status when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeMockResponse({ ok: false, status: 403 })));

    const result = await fetchPhoto("https://images1.vinted.net/photo123.jpg");

    expect(result.arrayBuffer).toBeNull();
    expect(result.error).toBe("HTTP 403");
  });

  it("returns arrayBuffer:null with the raw error when fetch itself throws (CORS/network)", async () => {
    // Reproduit exactement l'erreur observee en test live cote content
    // script avant ce correctif : un TypeError generique, sans distinction
    // fine entre CORS/reseau/DNS -- fetchPhoto() ne doit jamais planter,
    // seulement rapporter l'echec.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await fetchPhoto("https://images1.vinted.net/photo123.jpg");

    expect(result.arrayBuffer).toBeNull();
    expect(result.mimeType).toBeNull();
    expect(result.error).toContain("Failed to fetch");
  });

  // Mission "5 photos non reconnues comme images" (2026-08-11), item 1 :
  // preuve directe que le Content-Type/Content-Length HTTP declares, l'URL
  // finale et l'indicateur de redirection sont bien captures -- seul moyen
  // de comparer ensuite le Content-Type declare aux magic bytes reels
  // (voir photoReconstruction.ts::reconstructPhotoFiles, cote content script).
  it("captures the declared Content-Type/Content-Length headers, final URL and redirected flag for later diagnosis", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeMockResponse({
          url: "https://images1.vinted.net/photo123-final.jpg",
          redirected: true,
          headers: new Headers({ "content-type": "image/jpeg", "content-length": "4" }),
          blob: async () => ({ type: "image/jpeg", arrayBuffer: async () => bytes.buffer }),
        })
      )
    );

    const result = await fetchPhoto("https://images1.vinted.net/photo123.jpg");

    expect(result.httpStatus).toBe(200);
    expect(result.contentTypeHeader).toBe("image/jpeg");
    expect(result.contentLengthHeader).toBe("4");
    expect(result.finalUrl).toBe("https://images1.vinted.net/photo123-final.jpg");
    expect(result.redirected).toBe(true);
  });

  it("derives fileName from the URL, falling back to photo.jpg when absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeMockResponse({ blob: async () => ({ type: "", arrayBuffer: async () => new ArrayBuffer(0) }) })
      )
    );

    const result = await fetchPhoto("https://images1.vinted.net/");

    expect(result.fileName).toBe("photo.jpg");
    // type manquant sur le blob -- fallback image/jpeg (voir fetchPhoto).
    expect(result.mimeType).toBe("image/jpeg");
  });
});

function makePayload(overrides: Partial<PublishListingPayload> = {}): PublishListingPayload {
  return {
    title: "Pull Zara",
    description: "",
    price: 15,
    category: "",
    brand: null,
    size: null,
    condition: "",
    color: null,
    material: null,
    imageUrls: [],
    packageSize: "medium",
    expectedVintedUsername: "testuser",
    ...overrides,
  };
}

// Mock chrome.tabs/runtime minimal pour piloter handlePublishListing() de
// bout en bout SANS jamais vraiment attendre GLOBAL_TIMEOUT_MS (10 minutes,
// voir publishListing.ts) : chaque test declenche lui-meme onTabUpdated avec
// une URL /items/{id} pour simuler une publication reelle et laisser la
// promesse se resoudre proprement (settle() nettoie alors le vrai setTimeout).
function makeMockChrome(tabId: number) {
  type UpdatedListener = (tabId: number, changeInfo: { status?: string }, tab: { id: number; url?: string }) => void;
  type RemovedListener = (tabId: number) => void;
  type RuntimeMessageListener = (message: unknown, sender: { tab?: { id: number }; url?: string }) => boolean;
  const updatedListeners: UpdatedListener[] = [];
  const removedListeners: RemovedListener[] = [];
  const runtimeMessageListeners: RuntimeMessageListener[] = [];
  const chromeMock = {
    tabs: {
      create: vi.fn().mockResolvedValue({ id: tabId }),
      remove: vi.fn().mockResolvedValue(undefined),
      // Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON
      // DETECTE" (2026-08-17) : reload() du tab de publication existant --
      // le mecanisme d'"ouverture" reutilise par reconcilePostSubmitViaMemberRedirect
      // pour forcer une nouvelle navigation deterministe (voir son en-tete).
      reload: vi.fn().mockResolvedValue(undefined),
      // Mission "ACK PUBLISH_LISTING MANQUANT" : reponse par defaut valide
      // ({ok:true, accepted:true, duplicate:false}) -- sendPublishCommand()
      // rejette desormais toute reponse absente/invalide comme une erreur de
      // TRANSPORT (voir publishListing.ts), donc un mock qui ne repond rien
      // ferait a tort echouer chaque test qui n'a pas besoin de tester ce cas
      // precis.
      sendMessage: vi.fn((_tabId: number, _command: unknown, callback: (response?: unknown) => void) =>
        callback({ ok: true, accepted: true, duplicate: false })
      ),
      onUpdated: {
        addListener: (fn: UpdatedListener) => updatedListeners.push(fn),
        removeListener: (fn: UpdatedListener) => {
          const i = updatedListeners.indexOf(fn);
          if (i >= 0) updatedListeners.splice(i, 1);
        },
      },
      onRemoved: {
        // Reellement capture (contrairement a la version precedente,
        // no-op) -- necessaire pour simuler une fermeture d'onglet EXTERNE
        // (mission "port message ferme", item 5/9 : distinguer "ferme par
        // nous" de "ferme par autre chose").
        addListener: (fn: RemovedListener) => removedListeners.push(fn),
        removeListener: (fn: RemovedListener) => {
          const i = removedListeners.indexOf(fn);
          if (i >= 0) removedListeners.splice(i, 1);
        },
      },
    },
    // Mission "PORT MESSAGE FERMÉ", handshake PUBLISH_TAB_READY : reinjection
    // explicite (onTabUpdated status:"complete", voir publishListing.ts::
    // findPublishContentScriptFiles) exige getManifest() + scripting.executeScript,
    // jamais appeles avant cette mission -- sans stub, le simple fait
    // d'atteindre status:"complete" dans un test ferait planter handlePublishListing.
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    runtime: {
      lastError: undefined as { message: string } | undefined,
      // Meme piege que enrichListing.test.ts : sous Vitest (jsdom), logger.ts
      // emprunte toujours la branche "content script" (window existe).
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getManifest: vi.fn().mockReturnValue({ content_scripts: [{ js: ["assets/vinted-publish.ts-mock.js"] }] }),
      onMessage: {
        // Reellement capture -- necessaire pour simuler PUBLISH_TAB_READY
        // pousse par le content script (voir sendReady() plus bas).
        addListener: (fn: RuntimeMessageListener) => runtimeMessageListeners.push(fn),
        removeListener: (fn: RuntimeMessageListener) => {
          const i = runtimeMessageListeners.indexOf(fn);
          if (i >= 0) runtimeMessageListeners.splice(i, 1);
        },
      },
    },
  };
  // Simule le PUBLISH_TAB_READY que vinted-publish.ts pousse une fois son
  // listener enregistre -- seul declencheur desormais d'un envoi de
  // PUBLISH_LISTING (mission "port message fermé", plus de retry aveugle).
  // documentInstanceId (mission "DIAGNOSTIC LIVE APRES REJET DES PHOTOS
  // INVALIDES") : parametre optionnel pour simuler un DEUXIEME document
  // (id different) qui pousse son propre ready -- reproduit le scenario
  // "navigation remplace le document" sans avoir a mocker toute la
  // sequence TAB_UPDATED/reinjection.
  function sendReady(documentInstanceId = "doc-a"): void {
    for (const fn of runtimeMessageListeners) fn({ type: "PUBLISH_TAB_READY", documentInstanceId }, { tab: { id: tabId } });
  }
  return { chrome: chromeMock, updatedListeners, removedListeners, runtimeMessageListeners, sendReady };
}

describe("handlePublishListing -- cablage enrichissement -> fetch photos (mission 'nouveau test live')", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fetches photos using the ENRICHED imageUrls returned by enrichListingIfNeeded, never the original stale/empty ones", async () => {
    const enrichedImageUrl = "https://images1.vinted.net/enriched-photo.jpg";
    vi.mocked(enrichListingIfNeeded).mockResolvedValue(
      makePayload({ description: "Description enrichie", imageUrls: [enrichedImageUrl] })
    );

    const mock = makeMockChrome(777);
    vi.stubGlobal("chrome", mock.chrome);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => ({ type: "image/jpeg", arrayBuffer: async () => new ArrayBuffer(4) }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const request: RunActionRequest = {
      historyId: "hist-1",
      kind: "republish_listing",
      vintedAccountId: "acc-1",
      payload: {
        ...makePayload({ description: "", imageUrls: [] }),
        previousVintedItemId: "9604958273",
      } as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});

    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    // Le fetch background n'a du etre appele qu'avec l'URL ENRICHIE -- si le
    // cablage etait casse (payload d'origine reutilise apres l'appel a
    // enrichListingIfNeeded plutot que sa valeur de retour), cette URL
    // n'apparaitrait jamais et fetch() ne serait meme pas appele.
    expect(fetchMock).toHaveBeenCalledWith(enrichedImageUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simule une publication reelle reussie pour laisser settle() nettoyer
    // le timeout global et resoudre la promesse.
    mock.updatedListeners[0](777, { status: "complete" }, { id: 777, url: "https://www.vinted.fr/items/111222333" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });

  it("never calls enrichListingIfNeeded for plain publish_listing -- no previous Vinted item to enrich from (no regression)", async () => {
    const mock = makeMockChrome(778);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => ({ type: "image/jpeg", arrayBuffer: async () => new ArrayBuffer(4) }),
      })
    );

    const request: RunActionRequest = {
      historyId: "hist-2",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});

    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    expect(enrichListingIfNeeded).not.toHaveBeenCalled();

    mock.updatedListeners[0](778, { status: "complete" }, { id: 778, url: "https://www.vinted.fr/items/444555666" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });
});

describe("handlePublishListing -- mission 'PORT MESSAGE FERMÉ' (2026-08-11) -- handshake PUBLISH_TAB_READY", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // CAUSE RACINE CONFIRMEE en test live : l'ancien retry aveugle (withRetry,
  // 6x/250ms) envoyait PUBLISH_LISTING des la creation de l'onglet, bien avant
  // que le content script ait pu enregistrer son listener -- "Receiving end
  // does not exist" puis "message port closed" repete, meme apres
  // status:"complete". Preuve directe que PUBLISH_LISTING n'est PLUS jamais
  // envoye avant reception d'un signal PUBLISH_TAB_READY explicite.
  it("never sends PUBLISH_LISTING before a PUBLISH_TAB_READY signal is received from the content script", async () => {
    const mock = makeMockChrome(2001);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-5",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    // Aucun envoi tant qu'aucun signal pret n'a ete recu -- meme apres que
    // les listeners de tabs soient tous enregistres.
    expect(mock.chrome.tabs.sendMessage).not.toHaveBeenCalled();

    mock.sendReady();
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));
    expect(mock.chrome.tabs.sendMessage.mock.calls[0][1]).toMatchObject({ type: "PUBLISH_LISTING" });

    mock.updatedListeners[0](2001, { status: "complete" }, { id: 2001, url: "https://www.vinted.fr/items/999888777" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });

  // Mission item 7 (tests obligatoires) : "PUBLISH_LISTING métier n'est pas
  // envoyé 6 fois pendant le chargement" -- si PLUSIEURS PUBLISH_TAB_READY
  // arrivent rapprochés (ex. injection déclarative + réinjection explicite
  // sur le même document), un seul envoi doit partir tant que le premier est
  // encore en vol (sendInFlight, voir attemptSend()).
  it("ignores a second PUBLISH_TAB_READY while a send is already in flight -- never sends PUBLISH_LISTING twice concurrently", async () => {
    const mock = makeMockChrome(2002);
    // sendMessage ne rappelle JAMAIS son callback -- simule un envoi encore
    // "en vol" au moment ou le second signal pret arrive.
    mock.chrome.tabs.sendMessage = vi.fn();
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-6",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    void handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady();
    mock.sendReady();
    mock.sendReady();

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
  });

  // Mission item 5/9 : "aucune erreur 'message port closed' sur fonctionnement
  // normal" + "timeout réel -> erreur propre" -- un PREMIER envoi qui echoue
  // avec EXACTEMENT le texte observe en direct n'est PAS fatal (contrairement
  // a l'ancien comportement, qui abandonnait apres 6 tentatives) : un
  // DEUXIEME signal pret (ex. reinjection explicite reussie sur le document
  // final) relance l'envoi normalement et aboutit.
  it("treats a 'message port closed' send failure as non-fatal -- a subsequent PUBLISH_TAB_READY retries and succeeds", async () => {
    const mock = makeMockChrome(2003);
    let callCount = 0;
    mock.chrome.tabs.sendMessage = vi.fn((_tabId: number, _command: unknown, callback: (response?: unknown) => void) => {
      callCount += 1;
      if (callCount === 1) {
        mock.chrome.runtime.lastError = { message: "The message port closed before a response was received." };
        callback();
        mock.chrome.runtime.lastError = undefined;
      } else {
        callback({ ok: true, accepted: true, duplicate: false });
      }
    });
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-7",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady();
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));
    // Laisse le rejet de sendPublishCommand() se propager jusqu'au .catch()
    // d'attemptSend() (microtask, pas synchrone malgre un callback synchrone)
    // AVANT le second signal -- sinon sendInFlight vaut encore `true` et le
    // second sendReady() serait a tort ignore comme "deja en vol".
    await new Promise((r) => setTimeout(r, 0));

    // Second signal pret (ex. reinjection explicite sur le document final) --
    // le handler doit reessayer, PAS abandonner sur le premier echec.
    mock.sendReady();
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(2));

    mock.updatedListeners[0](2003, { status: "complete" }, { id: 2003, url: "https://www.vinted.fr/items/321321321" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });

  // Mission "ACK PUBLISH_LISTING MANQUANT" (2026-08-11), item 9 dernier point :
  // "ready reçu mais ACK invalide -> erreur propre" -- une reponse absente
  // (content script atteint mais qui ne repond rien, ex. ancien bundle non
  // mis a jour) doit etre traitee EXACTEMENT comme un echec de transport
  // (meme chemin non-fatal que "port closed"), jamais comme un succes silencieux.
  it("treats a missing/invalid ACK the same as a transport error -- non-fatal, retried on the next ready signal", async () => {
    const mock = makeMockChrome(2005);
    let callCount = 0;
    mock.chrome.tabs.sendMessage = vi.fn((_tabId: number, _command: unknown, callback: (response?: unknown) => void) => {
      callCount += 1;
      // Premier essai : content script atteint mais reponse absente/invalide
      // (aucun chrome.runtime.lastError -- distinct du cas "port closed").
      callback(callCount === 1 ? undefined : { ok: true, accepted: true, duplicate: false });
    });
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-9",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady();
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));

    mock.sendReady();
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(2));

    mock.updatedListeners[0](2005, { status: "complete" }, { id: 2005, url: "https://www.vinted.fr/items/555444333" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });

  // Mission item 8 (tests obligatoires) : "timeout réel -> erreur propre et
  // onglet cleanup comme actuellement" -- si AUCUN PUBLISH_TAB_READY n'est
  // jamais recu (content script jamais atteint), l'echec doit etre honnete
  // et DISTINCT d'un simple "Délai dépassé" generique, sous un plafond
  // bien plus court que GLOBAL_TIMEOUT_MS (10 minutes).
  it("times out with a distinct, honest error and closes the tab when no PUBLISH_TAB_READY is ever received", async () => {
    vi.useFakeTimers();

    const mock = makeMockChrome(2004);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-8",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errorMessage).toContain("n'a pas confirmé être prête à temps");
      expect(result.errorMessage).not.toContain("Délai dépassé");
      expect(result.errorMessage).not.toContain("port closed");
    }
    // Jamais envoye -- aucun signal pret n'est jamais arrive.
    expect(mock.chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(mock.chrome.tabs.remove).toHaveBeenCalledWith(2004);
  });

  // "cleanup ne ferme pas le mauvais onglet" + "timeout distinct d'un port
  // ferme" (mission item 9) : une fermeture EXTERNE (ni settle() ni timeout)
  // doit produire un message d'erreur specifique et distinct des deux autres.
  it("resolves with a distinct 'onglet fermé' error when the tab is closed externally, never confused with a timeout or a port-closed error", async () => {
    const mock = makeMockChrome(1000);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-4",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.removedListeners.length).toBeGreaterThan(0));

    // Simule une fermeture EXTERNE (utilisateur, navigateur, crash de page) --
    // jamais initiee par settle() lui-meme (tabClosedByHandler reste false).
    mock.removedListeners[0](1000);

    const result = await resultPromise;
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errorMessage).toBe("Publication interrompue (onglet fermé)");
      expect(result.errorMessage).not.toContain("Délai dépassé");
      expect(result.errorMessage).not.toContain("port closed");
    }
    // settle() appelle chrome.tabs.remove(tabId) inconditionnellement (sauf
    // keepTabOpen) MEME quand l'onglet est deja ferme -- constat fait ici,
    // pas un bug : un remove() sur un onglet deja disparu echoue simplement
    // en silence cote Chrome reel (.catch(() => {})), jamais un onglet
    // different qui serait ferme par erreur (toujours le meme tabId=1000).
    expect(mock.chrome.tabs.remove).toHaveBeenCalledTimes(1);
    expect(mock.chrome.tabs.remove).toHaveBeenCalledWith(1000);
  });
});

// Mission "CLIC FINAL + CONFIRMATION POST-PUBLICATION" (2026-08-16) : preuve
// que le nouveau signal PUBLISH_READY_TO_SUBMIT (pousse par vinted-publish.ts
// des que le bouton "Ajouter" devient cliquable, voir son en-tete) est bien
// relaye jusqu'au 4e callback de handlePublishListing() -- jamais confondu
// avec PUBLISH_TAB_READY (handshake initial) ni PUBLISH_PREFILL_SUMMARY
// (etat des lieux de l'autofill), ces trois signaux restant independants.
describe("handlePublishListing -- mission 'CLIC FINAL + CONFIRMATION POST-PUBLICATION' (2026-08-16)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("calls onReadyToSubmit exactly once when the content script reports PUBLISH_READY_TO_SUBMIT", async () => {
    const mock = makeMockChrome(6001);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-20",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const onReadyToSubmit = vi.fn();
    const resultPromise = handlePublishListing(request, () => {}, () => {}, onReadyToSubmit);
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady("doc-a");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));

    expect(onReadyToSubmit).not.toHaveBeenCalled();

    for (const fn of mock.runtimeMessageListeners) {
      fn({ type: "PUBLISH_READY_TO_SUBMIT" }, { tab: { id: 6001 } });
    }
    expect(onReadyToSubmit).toHaveBeenCalledTimes(1);

    mock.updatedListeners[0](6001, { status: "complete" }, { id: 6001, url: "https://www.vinted.fr/items/121212121" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });

  it("ignores PUBLISH_READY_TO_SUBMIT from a different/stale tab -- never calls onReadyToSubmit for the wrong tab", async () => {
    const mock = makeMockChrome(6002);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-21",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const onReadyToSubmit = vi.fn();
    const resultPromise = handlePublishListing(request, () => {}, () => {}, onReadyToSubmit);
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    for (const fn of mock.runtimeMessageListeners) {
      fn({ type: "PUBLISH_READY_TO_SUBMIT" }, { tab: { id: 999999 } });
    }
    expect(onReadyToSubmit).not.toHaveBeenCalled();

    mock.sendReady("doc-a");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));
    mock.updatedListeners[0](6002, { status: "complete" }, { id: 6002, url: "https://www.vinted.fr/items/131313131" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });
});

// Mission "CAUSE DOCUMENT-LIFECYCLE CONFIRMEE EN LIVE" (2026-08-11) :
// CONFIRME EN TEST LIVE (pas seulement reproduit en code) -- document A
// recoit l'ACK, est remplace par une navigation Vinted reelle, document B
// (nouveau documentInstanceId) pousse son propre PUBLISH_TAB_READY mais se
// faisait perpetuellement rejeter par HANDLE_PUBLISH_SEND_SKIPPED_ALREADY_IN_FLIGHT
// -- formulaire final entierement vide. La garde `sendInFlight` (booleenne,
// jamais reinitialisee apres un envoi REUSSI) est remplacee par une garde
// CLEE SUR documentInstanceId (voir attemptSend(), publishListing.ts) : seul
// un signal pret du MEME document deja envoye/accepte est ignore, un nouveau
// documentInstanceId est TOUJOURS traite comme une cible legitime.
describe("handlePublishListing -- mission 'CAUSE DOCUMENT-LIFECYCLE CONFIRMEE EN LIVE' (2026-08-11)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Scenario 1 : meme documentInstanceId, deux READY rapproches (avant que
  // l'ACK du premier ne se resolve) -> une seule commande envoyee. Meme
  // scenario que le test historique "ignores a second PUBLISH_TAB_READY
  // while a send is already in flight" (ligne ~368) -- reecrit ici avec un
  // documentInstanceId explicite pour rester regroupe avec le reste de cette
  // mission.
  it("scenario 1 -- same documentInstanceId sends READY twice before the first ACK resolves -> only one PUBLISH_LISTING sent", async () => {
    const mock = makeMockChrome(4001);
    mock.chrome.tabs.sendMessage = vi.fn(); // ne rappelle jamais son callback -- simule un envoi encore en vol.
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-11",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    void handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady("doc-a");
    mock.sendReady("doc-a");
    mock.sendReady("doc-a");

    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
  });

  // Scenario 2 : document A recoit/ACK la commande (promesse RESOLUE, pas
  // juste en vol) puis pousse un SECOND PUBLISH_TAB_READY (ex. reinjection
  // declarative + explicite sur le MEME document) -> pas de deuxieme envoi
  // inutile vers un document qui a deja la commande.
  it("scenario 2 -- document A ACKs, then A sends READY again -> no redundant second command", async () => {
    const mock = makeMockChrome(4002);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-12",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady("doc-a");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));

    // Meme document, second ready -- ne doit PAS redeclencher un envoi.
    mock.sendReady("doc-a");
    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);

    mock.updatedListeners[0](4002, { status: "complete" }, { id: 4002, url: "https://www.vinted.fr/items/111222333" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });

  // Scenario 3 -- LE CORRECTIF LUI-MEME : document A recoit/ACK, PUIS document
  // B (nouveau documentInstanceId, simule le document REMPLACE par une vraie
  // navigation Vinted) pousse son propre ready -> PUBLISH_LISTING DOIT
  // desormais etre renvoye a B (avant ce correctif, ce test aurait echoue :
  // B ne recevait jamais rien, exactement le bug confirme en direct).
  it("scenario 3 -- document A ACKs, then a NEW document B becomes ready -> PUBLISH_LISTING IS sent to B", async () => {
    const mock = makeMockChrome(4003);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-13",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady("doc-a");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));

    // Document B, ID different -- simule le document REMPLACE par une
    // navigation Vinted reelle.
    mock.sendReady("doc-b");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(2));

    mock.updatedListeners[0](4003, { status: "complete" }, { id: 4003, url: "https://www.vinted.fr/items/444555666" });
    const result = await resultPromise;
    expect(result.status).toBe("success");

    // documentInstanceId toujours journalise distinctement pour CHAQUE
    // document (correlation cote log viewer) -- lu depuis les entrees
    // relayees via RELAY_LOG_ENTRY (logger.ts::write(), branche "content
    // script" empruntee sous jsdom).
    type RelayedMessage = { type?: string; entry?: { message?: string; detail?: string } };
    const relayedReadyEntries = (mock.chrome.runtime.sendMessage.mock.calls as unknown as RelayedMessage[][])
      .map((call) => call[0])
      .filter((msg) => msg?.type === "RELAY_LOG_ENTRY" && msg.entry?.message === "CONTENT_SCRIPT_READY");
    expect(relayedReadyEntries).toHaveLength(2);
    expect(JSON.parse(relayedReadyEntries[0].entry!.detail!).documentInstanceId).toBe("doc-a");
    expect(JSON.parse(relayedReadyEntries[1].entry!.detail!).documentInstanceId).toBe("doc-b");
  });

  // Scenario 4 : plusieurs navigations successives A -> B -> C -- chaque
  // nouveau document recoit la commande, jamais de boucle infinie sur le
  // document COURANT (un ready REPETE pour C, le document final/actuel, ne
  // redeclenche pas un 4e envoi). Le cas "A redevient pret apres B et C"
  // n'est PAS teste ici : architecturalement impossible en conditions
  // reelles (le realm JS d'un document remplace par une navigation est
  // detruit, il ne peut plus jamais emettre de message) -- la garde ne
  // retient donc volontairement que le document COURANT, pas un historique
  // complet, pour rester la correction la plus simple qui couvre les cas
  // reellement atteignables.
  it("scenario 4 -- successive navigations A -> B -> C each receive PUBLISH_LISTING, with no loop on the current document", async () => {
    const mock = makeMockChrome(4004);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-14",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady("doc-a");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));
    mock.sendReady("doc-b");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(2));
    mock.sendReady("doc-c");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(3));

    // Un ready REPETE pour C (le document courant, deja traite) ne doit rien
    // redeclencher -- jamais de boucle sur le document final.
    mock.sendReady("doc-c");
    expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(3);

    mock.updatedListeners[0](4004, { status: "complete" }, { id: 4004, url: "https://www.vinted.fr/items/777888999" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });

  // Scenario 5 : le payload de republication (titre/description/prix/photos)
  // reste identique entre le premier envoi (document A) et la reemission
  // (document B) -- jamais altere par la logique de reemission elle-meme.
  it("scenario 5 -- the payload sent to the new document B is identical to the one sent to A", async () => {
    const mock = makeMockChrome(4005);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const request: RunActionRequest = {
      historyId: "hist-15",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ title: "Robe vintage", description: "d", price: 24, imageUrls: [] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady("doc-a");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));
    mock.sendReady("doc-b");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(2));

    type SendMessageCall = [number, { type: string; payload: { title: string; price: number } }, (r?: unknown) => void];
    const calls = mock.chrome.tabs.sendMessage.mock.calls as unknown as SendMessageCall[];
    expect(calls[0][1].payload.title).toBe("Robe vintage");
    expect(calls[0][1].payload.price).toBe(24);
    expect(calls[1][1].payload.title).toBe(calls[0][1].payload.title);
    expect(calls[1][1].payload.price).toBe(calls[0][1].payload.price);

    mock.updatedListeners[0](4005, { status: "complete" }, { id: 4005, url: "https://www.vinted.fr/items/222333444" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });
});

// Mission "PREUVE LIVE PRECISE -- TRANSPORT BINAIRE PHOTOS" (2026-08-11) :
// CAUSE CONFIRMEE -- chrome.tabs.sendMessage() serialise via JSON, un
// ArrayBuffer embarque directement degenere en "{}" a la traversee (voir
// binaryTransport.ts pour la preuve complete au niveau unitaire). Ce test
// verifie l'INTEGRATION reelle : le command effectivement passe a
// chrome.tabs.sendMessage() ne porte plus jamais un ArrayBuffer brut --
// uniquement arrayBufferBase64 (string, JSON-safe), decodable en les octets
// EXACTS d'origine.
describe("handlePublishListing -- mission 'PREUVE LIVE PRECISE -- TRANSPORT BINAIRE PHOTOS' (2026-08-11)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends photos as base64 (never a raw ArrayBuffer) through chrome.tabs.sendMessage, and the base64 decodes back to the exact original bytes", async () => {
    const mock = makeMockChrome(5001);
    vi.stubGlobal("chrome", mock.chrome);

    const webpBytes = new Uint8Array(32);
    webpBytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    webpBytes.set([0, 0, 0, 0], 4);
    webpBytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
    for (let i = 12; i < webpBytes.length; i++) webpBytes[i] = 0x99;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://images1.vinted.net/photo1.webp",
        redirected: false,
        headers: new Headers({ "content-type": "image/webp" }),
        blob: async () => ({ type: "image/webp", arrayBuffer: async () => webpBytes.buffer }),
      })
    );

    const request: RunActionRequest = {
      historyId: "hist-16",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ description: "d", imageUrls: ["https://images1.vinted.net/photo1.webp"] }) as unknown as Record<string, unknown>,
    };

    const resultPromise = handlePublishListing(request, () => {}, () => {});
    await vi.waitFor(() => expect(mock.runtimeMessageListeners.length).toBeGreaterThan(0));

    mock.sendReady("doc-a");
    await vi.waitFor(() => expect(mock.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1));

    type SentPhoto = { arrayBuffer?: unknown; arrayBufferBase64: string | null };
    type SendMessageCall = [number, { type: string; photos: SentPhoto[] }, (r?: unknown) => void];
    const call = (mock.chrome.tabs.sendMessage.mock.calls as unknown as SendMessageCall[])[0];
    const sentPhoto = call[1].photos[0];

    // Jamais d'ArrayBuffer brut sur le fil -- la cause racine confirmee.
    expect(sentPhoto.arrayBuffer).toBeUndefined();
    expect(typeof sentPhoto.arrayBufferBase64).toBe("string");

    const { base64ToArrayBuffer } = await import("../../../lib/binaryTransport");
    const decoded = new Uint8Array(base64ToArrayBuffer(sentPhoto.arrayBufferBase64!));
    expect(decoded).toEqual(webpBytes);

    mock.updatedListeners[0](5001, { status: "complete" }, { id: 5001, url: "https://www.vinted.fr/items/888777666" });
    const result = await resultPromise;
    expect(result.status).toBe("success");
  });
});

// Mission "REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE"
// (2026-08-17) : preuve live directe -- apres un clic humain reussi sur
// "Ajouter", Vinted redirige parfois le tab de publication vers
// /member/{userId} (le profil du vendeur) plutot que vers /items/{nouvel_id}
// (le SEUL cas gere jusqu'ici, voir CAS A ci-dessus, inchange). Cette
// navigation seule n'est jamais un succes -- reconcilePostSubmitViaMemberRedirect()
// declenche une VRAIE relecture wardrobe (syncCoordinator.startAccountSync(),
// mocke ici -- ses propres correlations organiques sont deja testees dans
// syncCoordinator.test.ts) puis compare l'ensemble des vinted_item_id avant/
// apres (listKnownVintedItemIds, mocke ici) pour identifier LA nouvelle
// annonce, avec desambiguisation stricte titre+prix si plusieurs candidats,
// jamais un choix au hasard.
describe("handlePublishListing -- mission 'REPUBLICATION : PUBLICATION REUSSIE MAIS SUCCES NON DETECTE' (2026-08-17)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function makeSyncResult(overrides: Record<string, unknown> = {}) {
    return {
      ok: true,
      complete: true,
      created: 0,
      updated: 0,
      deletedMarked: 0,
      pagesRead: 1,
      pagesExpected: 1,
      reason: "success",
      ...overrides,
    };
  }

  // startAccountSync est entierement mocke (vi.mock) : sans implementation
  // explicite, le mock ne INVOQUE jamais le callback `openTab` qu'on lui
  // passe -- pour que les assertions sur chrome.tabs.reload() restent
  // fideles au comportement reel (voir reconcilePostSubmitViaMemberRedirect,
  // qui appelle openTab() a CHAQUE tentative), le mock l'appelle lui-meme
  // avant de resoudre, persistant sur TOUS les appels (jamais Once -- les
  // scenarios multi-tentatives appellent startAccountSync plusieurs fois).
  function stubStartAccountSync(result: ReturnType<typeof makeSyncResult>): void {
    vi.mocked(startAccountSync).mockImplementation(async (_vintedUserId, _onProgress, openTab) => {
      await openTab();
      return result as Awaited<ReturnType<typeof startAccountSync>>;
    });
  }

  function makeRequest(overrides: Partial<RunActionRequest> = {}): RunActionRequest {
    return {
      historyId: "hist-member-redirect",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ title: "Pull Zara", price: 15, description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
      ...overrides,
    };
  }

  it("navigation directe /items/{id} (CAS A) reste inchangee -- jamais de reconciliation declenchee", async () => {
    const mock = makeMockChrome(8000);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    mock.updatedListeners[0](8000, { status: "complete" }, { id: 8000, url: "https://www.vinted.fr/items/999000111" });

    const result = await resultPromise;
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.resultPayload).toEqual({ vintedItemId: "999000111", vintedUrl: "https://www.vinted.fr/items/999000111" });
    }
    expect(startAccountSync).not.toHaveBeenCalled();
  });

  it("CAS B : redirection /member/{userId} + exactement 1 nouvel item -> succes", async () => {
    const mock = makeMockChrome(8001);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    vi.mocked(listKnownVintedItemIds)
      .mockResolvedValueOnce(new Set(["100"])) // beforeIds, capture precoce
      .mockResolvedValueOnce(new Set(["100", "200"])); // afterIds, 1er essai
    stubStartAccountSync(makeSyncResult());
    vi.mocked(findListingsByVintedItemIds).mockResolvedValue([
      { vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200", title: "Pull Zara", price: 15 },
    ]);

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    mock.updatedListeners[0](8001, { status: "complete" }, { id: 8001, url: "https://www.vinted.fr/member/3152175197" });

    const result = await resultPromise;
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.resultPayload).toEqual({ vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200" });
    }
    expect(startAccountSync).toHaveBeenCalledTimes(1);
    expect(startAccountSync).toHaveBeenCalledWith("3152175197", expect.any(Function), expect.any(Function));
  });

  it("query string ?promo_shown=true est acceptee -- l'id numerique du compte est correctement extrait du path", async () => {
    const mock = makeMockChrome(8002);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    vi.mocked(listKnownVintedItemIds).mockResolvedValueOnce(new Set()).mockResolvedValueOnce(new Set(["777"]));
    stubStartAccountSync(makeSyncResult());
    vi.mocked(findListingsByVintedItemIds).mockResolvedValue([
      { vintedItemId: "777", vintedUrl: "https://www.vinted.fr/items/777", title: "Pull Zara", price: 15 },
    ]);

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    mock.updatedListeners[0](8002, { status: "complete" }, { id: 8002, url: "https://www.vinted.fr/member/3152175197?promo_shown=true" });

    const result = await resultPromise;
    expect(result.status).toBe("success");
    expect(startAccountSync).toHaveBeenCalledWith("3152175197", expect.any(Function), expect.any(Function));
  });

  it(
    "CAS B : 0 nouvel item au premier essai, puis apparition au retry -> succes",
    async () => {
      const mock = makeMockChrome(8003);
      vi.stubGlobal("chrome", mock.chrome);
      vi.stubGlobal("fetch", vi.fn());

      vi.mocked(listKnownVintedItemIds)
        .mockResolvedValueOnce(new Set(["100"])) // beforeIds
        .mockResolvedValueOnce(new Set(["100"])) // afterIds, essai 1 -- rien de nouveau
        .mockResolvedValueOnce(new Set(["100", "200"])); // afterIds, essai 2 -- trouve
      stubStartAccountSync(makeSyncResult());
      vi.mocked(findListingsByVintedItemIds).mockResolvedValue([
        { vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200", title: "Pull Zara", price: 15 },
      ]);

      const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
      await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

      mock.updatedListeners[0](8003, { status: "complete" }, { id: 8003, url: "https://www.vinted.fr/member/3152175197" });

      const result = await resultPromise;
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.resultPayload).toEqual({ vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200" });
      }
      expect(startAccountSync).toHaveBeenCalledTimes(2);
      // Un vrai rechargement a eu lieu avant le retry -- jamais une simple
      // reevaluation sans nouvelle navigation (le content script ne se
      // re-execute jamais sans elle, voir le commentaire d'en-tete).
      expect(mock.chrome.tabs.reload).toHaveBeenCalledTimes(2);
    },
    15000
  );

  it("CAS B : plusieurs nouveaux items mais un seul compatible titre+prix -> succes", async () => {
    const mock = makeMockChrome(8004);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    vi.mocked(listKnownVintedItemIds).mockResolvedValueOnce(new Set(["100"])).mockResolvedValueOnce(new Set(["100", "200", "300"]));
    stubStartAccountSync(makeSyncResult());
    vi.mocked(findListingsByVintedItemIds).mockResolvedValue([
      { vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200", title: "Pull Zara", price: 15 },
      { vintedItemId: "300", vintedUrl: "https://www.vinted.fr/items/300", title: "Autre article", price: 99 },
    ]);

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    mock.updatedListeners[0](8004, { status: "complete" }, { id: 8004, url: "https://www.vinted.fr/member/3152175197" });

    const result = await resultPromise;
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.resultPayload).toEqual({ vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200" });
    }
  });

  it("CAS B : plusieurs candidats ambigus (meme titre+prix) -> jamais de faux succes", async () => {
    const mock = makeMockChrome(8005);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    vi.mocked(listKnownVintedItemIds).mockResolvedValueOnce(new Set(["100"])).mockResolvedValueOnce(new Set(["100", "200", "300"]));
    stubStartAccountSync(makeSyncResult());
    vi.mocked(findListingsByVintedItemIds).mockResolvedValue([
      { vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200", title: "Pull Zara", price: 15 },
      { vintedItemId: "300", vintedUrl: "https://www.vinted.fr/items/300", title: "Pull Zara", price: 15 },
    ]);

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    mock.updatedListeners[0](8005, { status: "complete" }, { id: 8005, url: "https://www.vinted.fr/member/3152175197" });

    const result = await resultPromise;
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errorMessage).toContain("impossible d'identifier celle-ci avec certitude");
    }
    // Onglet garde ouvert -- l'utilisateur peut verifier lui-meme sur Vinted.
    expect(mock.chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it(
    "CAS B : aucun nouvel item apres toutes les tentatives -> erreur honnete, jamais un succes invente",
    async () => {
      const mock = makeMockChrome(8006);
      vi.stubGlobal("chrome", mock.chrome);
      vi.stubGlobal("fetch", vi.fn());

      // beforeIds + 4 tentatives, toutes sans nouvel item.
      vi.mocked(listKnownVintedItemIds).mockResolvedValue(new Set(["100"]));
      stubStartAccountSync(makeSyncResult());

      const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
      await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

      mock.updatedListeners[0](8006, { status: "complete" }, { id: 8006, url: "https://www.vinted.fr/member/3152175197" });

      const result = await resultPromise;
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.errorMessage).toContain("n'a pas pu identifier la nouvelle annonce avec certitude");
      }
      expect(startAccountSync).toHaveBeenCalledTimes(4);
      expect(findListingsByVintedItemIds).not.toHaveBeenCalled();
      expect(mock.chrome.tabs.remove).not.toHaveBeenCalled();
    },
    25000
  );

  it("listeners/timers sont nettoyes apres un settle() reussi via CAS B (jamais de fuite)", async () => {
    const mock = makeMockChrome(8007);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    vi.mocked(listKnownVintedItemIds).mockResolvedValueOnce(new Set(["100"])).mockResolvedValueOnce(new Set(["100", "200"]));
    stubStartAccountSync(makeSyncResult());
    vi.mocked(findListingsByVintedItemIds).mockResolvedValue([
      { vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200", title: "Pull Zara", price: 15 },
    ]);

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    mock.updatedListeners[0](8007, { status: "complete" }, { id: 8007, url: "https://www.vinted.fr/member/3152175197" });
    await resultPromise;

    expect(mock.updatedListeners).toHaveLength(0);
    expect(mock.removedListeners).toHaveLength(0);
    expect(mock.runtimeMessageListeners).toHaveLength(0);
  });

  it("plusieurs TAB_UPDATED /member/* successifs ne declenchent jamais deux boucles de reconciliation ni deux settle() -- une seule synchro", async () => {
    const mock = makeMockChrome(8008);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    vi.mocked(listKnownVintedItemIds).mockResolvedValueOnce(new Set(["100"])).mockResolvedValueOnce(new Set(["100", "200"]));
    stubStartAccountSync(makeSyncResult());
    vi.mocked(findListingsByVintedItemIds).mockResolvedValue([
      { vintedItemId: "200", vintedUrl: "https://www.vinted.fr/items/200", title: "Pull Zara", price: 15 },
    ]);

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    // Deux evenements /member/* successifs (ex. loading->complete puis un
    // second "complete" apres l'apparition de ?promo_shown=true) -- un SEUL
    // demarrage de reconciliation attendu (reconciliationStarted).
    mock.updatedListeners[0](8008, { status: "complete" }, { id: 8008, url: "https://www.vinted.fr/member/3152175197" });
    mock.updatedListeners[0](8008, { status: "complete" }, { id: 8008, url: "https://www.vinted.fr/member/3152175197?promo_shown=true" });

    const result = await resultPromise;
    expect(result.status).toBe("success");
    expect(startAccountSync).toHaveBeenCalledTimes(1);
  });
});

// Mission "AUTOMATISER ENTIEREMENT LA REPUBLICATION" (2026-08-17), CAS C :
// preuve live obtenue -- la reponse REELLE de POST /api/v2/item_upload/items
// ({"item":{"id":9691226139},...,"code":0}) identifie B directement, sans
// navigation ni reconciliation. CAS C est UNIQUEMENT un nouvel appelant de
// finalizeSuccess() (voir publishListing.ts) -- ces tests prouvent que (1)
// une capture valide aboutit a un succes identique a CAS A/CAS B, (2) une
// capture invalide n'a AUCUN effet metier et laisse CAS A operer normalement
// en fallback, et (3) l'idempotence deja garantie par successFinalizationStarted/
// settled tient face a CAS C, y compris en course avec CAS A.
describe("handlePublishListing -- CAS C : identification de B via la reponse reseau capturee (2026-08-17)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function makeRequest(overrides: Partial<RunActionRequest> = {}): RunActionRequest {
    return {
      historyId: "hist-cas-c",
      kind: "publish_listing",
      vintedAccountId: "acc-1",
      payload: makePayload({ title: "Pull Zara", price: 15, description: "d", imageUrls: [] }) as unknown as Record<string, unknown>,
      ...overrides,
    };
  }

  function sendCreateResponseCaptured(
    mock: ReturnType<typeof makeMockChrome>,
    tabId: number,
    overrides: Partial<{ url: string; statusCode: number; ok: boolean; bodyText: string; transport: "fetch" | "xhr" }> = {}
  ): void {
    const message = {
      type: "PUBLISH_CREATE_RESPONSE_CAPTURED",
      url: "https://www.vinted.fr/api/v2/item_upload/items",
      statusCode: 200,
      ok: true,
      bodyText: JSON.stringify({ item: { id: 9691226139 }, after_upload_actions: ["show_upload_another_item_tip"], code: 0 }),
      transport: "xhr" as const,
      ...overrides,
    };
    for (const fn of mock.runtimeMessageListeners) fn(message, { tab: { id: tabId } });
  }

  it("capture valide (ok, 2xx, code:0, item.id entier positif) -> succes identique a CAS A/CAS B, via finalizeSuccess", async () => {
    const mock = makeMockChrome(9000);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    sendCreateResponseCaptured(mock, 9000);

    const result = await resultPromise;
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.resultPayload).toEqual({
        vintedItemId: "9691226139",
        vintedUrl: "https://www.vinted.fr/items/9691226139",
      });
    }
    // Aucune navigation /items/{id} ni /member/{userId} n'a jamais eu lieu
    // dans ce test -- preuve que CAS C aboutit seul, sans dependre de CAS A/B.
    expect(startAccountSync).not.toHaveBeenCalled();
  });

  it.each([
    ["ok:false", { ok: false }],
    ["statusCode 4xx", { statusCode: 403 }],
    ["statusCode 5xx", { statusCode: 500 }],
    ["JSON invalide", { bodyText: "{not json" }],
    ["code different de 0", { bodyText: JSON.stringify({ item: { id: 123 }, code: 1 }) }],
    ["item.id absent", { bodyText: JSON.stringify({ item: {}, code: 0 }) }],
    ["item.id non numerique", { bodyText: JSON.stringify({ item: { id: "123" }, code: 0 }) }],
    ["item.id negatif", { bodyText: JSON.stringify({ item: { id: -5 }, code: 0 }) }],
    ["item.id zero", { bodyText: JSON.stringify({ item: { id: 0 }, code: 0 }) }],
    ["URL inattendue (pas le POST de creation exact)", { url: "https://www.vinted.fr/api/v2/item_upload/items/123" }],
  ])("capture invalide (%s) : aucun effet metier -- CAS A continue de fonctionner normalement en fallback", async (_label, overrides) => {
    const mock = makeMockChrome(9001);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    sendCreateResponseCaptured(mock, 9001, overrides);
    // La capture invalide ci-dessus ne doit avoir declenche ni settle() ni
    // finalizeSuccess() -- seul CAS A (navigation reelle) fait aboutir ce
    // test, preuve directe que le fallback reste pleinement fonctionnel.
    mock.updatedListeners[0](9001, { status: "complete" }, { id: 9001, url: "https://www.vinted.fr/items/555000111" });

    const result = await resultPromise;
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.resultPayload).toEqual({
        vintedItemId: "555000111",
        vintedUrl: "https://www.vinted.fr/items/555000111",
      });
    }
  });

  it("idempotence : deux captures valides successives (rejeu) ne provoquent qu'un seul rebind/settle", async () => {
    const mock = makeMockChrome(9002);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    sendCreateResponseCaptured(mock, 9002);
    sendCreateResponseCaptured(mock, 9002); // rejeu de la meme reponse -- doit etre un pur no-op

    const result = await resultPromise;
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.resultPayload).toEqual({
        vintedItemId: "9691226139",
        vintedUrl: "https://www.vinted.fr/items/9691226139",
      });
    }
    // settle() ferme l'onglet exactement une fois par publication reussie
    // (chrome.tabs.remove) -- un second passage complet par finalizeSuccess/
    // settle aurait appele remove() une seconde fois.
    expect(mock.chrome.tabs.remove).toHaveBeenCalledTimes(1);
  });

  it("course CAS C / CAS A : la capture reseau arrive en premier -- CAS A (navigation tardive) devient un no-op silencieux", async () => {
    const mock = makeMockChrome(9003);
    vi.stubGlobal("chrome", mock.chrome);
    vi.stubGlobal("fetch", vi.fn());

    const resultPromise = handlePublishListing(makeRequest(), () => {}, () => {});
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));

    sendCreateResponseCaptured(mock, 9003);
    // CAS A arrive ENSUITE, avec un id DIFFERENT -- ne doit jamais l'emporter
    // ni provoquer un second settle.
    mock.updatedListeners[0](9003, { status: "complete" }, { id: 9003, url: "https://www.vinted.fr/items/777000222" });

    const result = await resultPromise;
    expect(result.status).toBe("success");
    if (result.status === "success") {
      // L'id retenu est celui de CAS C (arrive en premier), jamais celui de
      // la navigation CAS A tardive.
      expect(result.resultPayload).toEqual({
        vintedItemId: "9691226139",
        vintedUrl: "https://www.vinted.fr/items/9691226139",
      });
    }
    expect(mock.chrome.tabs.remove).toHaveBeenCalledTimes(1);
  });
});
