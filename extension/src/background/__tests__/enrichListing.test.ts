import { afterEach, describe, expect, it, vi } from "vitest";

// enrichListing.ts importe recordSingleItemImport depuis sync.ts, qui importe
// a son tour supabaseClient.ts -- son module top-level appelle createClient(),
// qui tente aussitot chrome.storage.local.get (GoTrueClient._emitInitialSession)
// AVANT tout code de test (les imports ES s'evaluent avant tout). Ces tests ne
// couvrent que les portes d'entree de enrichListingIfNeeded (voir plus bas),
// jamais recordSingleItemImport lui-meme -- mocker tout le module evite
// d'evaluer sync.ts (et donc supabaseClient.ts) du tout, meme discipline que
// runAction.test.ts.
vi.mock("../sync", () => ({
  recordSingleItemImport: vi.fn(),
}));

import { enrichListingIfNeeded } from "../handlers/enrichListing";
import { recordSingleItemImport } from "../sync";
import type { AutoEnrichResponse, PublishListingPayload } from "../../lib/messages";

// Audit "prefill partiel" (2026-08-10-11) : CAUSE CONFIRMEE en test live
// (log PREFILL_DESCRIPTION_EMPTY_PAYLOAD) -- une annonce synchronisee
// passivement (recordListings, sync.ts) n'a jamais de description en base.
// enrichListingIfNeeded() est le correctif retenu (option C+D de l'audit) :
// lazy, scope a UNE annonce, jamais un enrichissement en masse.
//
// Ces deux tests couvrent uniquement les portes d'entree (needsEnrichment +
// previousVintedItemId requis) SANS jamais toucher chrome.tabs -- la
// fonction retourne le payload D'ORIGINE, inchange, avant tout appel a une
// API d'extension. C'est deliberement le seul comportement testable sans
// mock chrome complet (ouverture d'onglet, chargement, extraction DOM) --
// le reste (onglet ouvert avec succes, extraction reelle, ecriture Supabase)
// ne peut etre prouve qu'en test live (voir rapport, section "ce qui reste
// non valide live").
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

// Mock chrome.tabs minimal mais REEL dans son enchainement d'evenements
// (contrairement aux 3 tests de portes d'entree ci-dessus) : reproduit le
// vrai cycle attendu par enrichListingIfNeeded -- tabs.create() resout,
// PUIS (async, capture par le test) l'onglet emet "complete" via
// onUpdated, PUIS sendMessage() repond a AUTO_ENRICH_REQUESTED. C'est ce
// chemin complet, jamais exerce par les 3 tests de portes d'entree
// ci-dessus, qui prouve reellement le mission item 3 de l'audit "prefill
// partiel" (2026-08-11) : "ecrire en Supabase ne modifie pas magiquement
// l'objet payload deja en memoire" -- seul le retour EXPLICITE de
// enrichListingIfNeeded() peut porter les donnees extraites, jamais un
// effet de bord implicite de recordSingleItemImport.
function makeMockChrome(tabId: number) {
  type UpdatedListener = (tabId: number, changeInfo: { status?: string }, tab: { id: number }) => void;
  const updatedListeners: UpdatedListener[] = [];
  const sendMessage = vi.fn();
  return {
    chrome: {
      tabs: {
        create: vi.fn().mockResolvedValue({ id: tabId }),
        remove: vi.fn().mockResolvedValue(undefined),
        sendMessage,
        onUpdated: {
          addListener: (fn: UpdatedListener) => updatedListeners.push(fn),
          removeListener: (fn: UpdatedListener) => {
            const i = updatedListeners.indexOf(fn);
            if (i >= 0) updatedListeners.splice(i, 1);
          },
        },
        onRemoved: {
          addListener: () => {},
          removeListener: () => {},
        },
      },
      // logger.ts decide du canal d'ecriture via `typeof window === "undefined"`
      // -- toujours FAUX sous Vitest (environnement jsdom, window existe
      // toujours), donc chaque logger.info/warn/error de enrichListingIfNeeded
      // emprunte ici la branche "content script" (chrome.runtime.sendMessage),
      // jamais la branche background reelle -- sans stub, `sendMessage n'est
      // pas une fonction` fait planter la fonction testee AVANT tout appel a
      // chrome.tabs.
      runtime: { lastError: undefined, sendMessage: vi.fn().mockResolvedValue(undefined) },
    },
    updatedListeners,
    sendMessage,
  };
}

describe("enrichListingIfNeeded -- succes complet (onglet ouvert, extraction, retour)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // Sans ceci, l'historique d'appels de recordSingleItemImport (mock
    // partage au niveau module, voir vi.mock("../sync", ...) en tete de
    // fichier) survit d'un test a l'autre dans ce describe -- le test
    // "extraction failed" doit voir un mock vierge pour prouver qu'IL n'a
    // jamais appele recordSingleItemImport, pas que le test precedent ne
    // l'a pas fait non plus.
    vi.clearAllMocks();
  });

  it("returns a merged payload carrying the description AND the 5 photo URLs extracted from the old Vinted listing", async () => {
    vi.mocked(recordSingleItemImport).mockResolvedValue({ created: false, draftProtected: false });

    const mock = makeMockChrome(555);
    vi.stubGlobal("chrome", mock.chrome);

    const extractedImageUrls = [
      "https://images1.vinted.net/a.jpg",
      "https://images1.vinted.net/b.jpg",
      "https://images1.vinted.net/c.jpg",
      "https://images1.vinted.net/d.jpg",
      "https://images1.vinted.net/e.jpg",
    ];
    const autoEnrichResponse: AutoEnrichResponse = {
      ok: true,
      vintedUsername: "testuser",
      item: {
        vintedItemId: "9604958273",
        vintedUrl: "https://www.vinted.fr/items/9604958273",
        title: "Polo Hommes",
        description: "Polo en tres bon etat, porte quelques fois seulement.",
        price: 24,
        brand: "Lacoste",
        category: "Hommes Polos",
        color: null,
        size: null,
        condition: "Très bon état",
        material: null,
        imageUrls: extractedImageUrls,
      },
    };
    mock.sendMessage.mockImplementation(
      (_tabId: number, _command: unknown, callback: (response: AutoEnrichResponse) => void) => {
        callback(autoEnrichResponse);
      }
    );

    const payload = makePayload({ description: "", imageUrls: [] });
    const resultPromise = enrichListingIfNeeded(payload, "9604958273");

    // Le premier "complete" ne peut etre emis qu'une fois que
    // chrome.tabs.create() a resolu et que waitForTabComplete() a
    // enregistre son listener -- attendre ce point precis avant de le
    // declencher, plutot qu'un delai arbitraire.
    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));
    mock.updatedListeners[0](555, { status: "complete" }, { id: 555 });

    const result = await resultPromise;

    expect(result).not.toBe(payload);
    expect(result.description).toBe("Polo en tres bon etat, porte quelques fois seulement.");
    expect(result.imageUrls).toEqual(extractedImageUrls);
    expect(result.imageUrls).toHaveLength(5);
  });

  // Mission "REPUBLICATION FIDELE" (2026-08-11) : CAUSE CONFIRMEE -- ce
  // scenario precis (description deja presente, mais categorie/etat/
  // couleur/matiere absents) etait AVANT ce correctif silencieusement
  // ignore : needsEnrichment() ne regardait QUE description, donc
  // enrichListingIfNeeded() rendait le payload inchange sans jamais tenter
  // d'aller chercher la categorie -- explique directement "Sélectionne une
  // catégorie" reste vide en test live malgre titre/description/prix/photos
  // deja corrects. Prouve ici que l'enrichissement se declenche desormais
  // reellement dans ce cas.
  it("still triggers enrichment when description is present but category/condition/color/material are missing -- the exact gap this fix addresses", async () => {
    vi.mocked(recordSingleItemImport).mockResolvedValue({ created: false, draftProtected: false });

    const mock = makeMockChrome(557);
    vi.stubGlobal("chrome", mock.chrome);

    const autoEnrichResponse: AutoEnrichResponse = {
      ok: true,
      vintedUsername: "testuser",
      item: {
        vintedItemId: "9604958273",
        vintedUrl: "https://www.vinted.fr/items/9604958273",
        title: "Polo Hommes",
        description: "Polo en tres bon etat.",
        price: 24,
        brand: "Ralph Lauren",
        category: "Hommes Polos",
        color: "Bleu",
        size: "L",
        condition: "Très bon état",
        material: "Coton",
        imageUrls: [],
      },
    };
    mock.sendMessage.mockImplementation(
      (_tabId: number, _command: unknown, callback: (response: AutoEnrichResponse) => void) => {
        callback(autoEnrichResponse);
      }
    );

    // Description DEJA presente (l'ancien seul critere) -- categorie/etat/
    // marque/taille/couleur/matiere tous absents (comportement typique d'une
    // annonce uniquement synchronisee passivement, voir wardrobeApi.ts).
    const payload = makePayload({ description: "Déjà une description.", category: "", condition: "" });
    const resultPromise = enrichListingIfNeeded(payload, "9604958273");

    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));
    mock.updatedListeners[0](557, { status: "complete" }, { id: 557 });

    const result = await resultPromise;

    expect(result).not.toBe(payload);
    expect(result.category).toBe("Hommes Polos");
    expect(result.condition).toBe("Très bon état");
    expect(result.brand).toBe("Ralph Lauren");
    expect(result.color).toBe("Bleu");
    expect(result.material).toBe("Coton");
    expect(result.size).toBe("L");
    // La description D'ORIGINE, deja presente, n'est jamais ecrasee (regle
    // "ne remplace que les champs reellement vides", voir enrichListing.ts).
    expect(result.description).toBe("Déjà une description.");
  });

  it("falls back to the ORIGINAL unchanged payload when the content script reports an extraction failure", async () => {
    const mock = makeMockChrome(556);
    vi.stubGlobal("chrome", mock.chrome);
    mock.sendMessage.mockImplementation(
      (_tabId: number, _command: unknown, callback: (response: AutoEnrichResponse) => void) => {
        callback({ ok: false, error: "Page introuvable (annonce supprimée)" });
      }
    );

    const payload = makePayload({ description: "", imageUrls: [] });
    const resultPromise = enrichListingIfNeeded(payload, "9604958273");

    await vi.waitFor(() => expect(mock.updatedListeners.length).toBeGreaterThan(0));
    mock.updatedListeners[0](556, { status: "complete" }, { id: 556 });

    const result = await resultPromise;

    // Meme reference, pas seulement meme contenu -- best-effort inconditionnel
    // (voir commentaire d'en-tete enrichListing.ts) : aucune reconstruction
    // d'objet sur un echec d'extraction, jamais de blocage de la republication.
    expect(result).toBe(payload);
    // recordSingleItemImport n'a jamais du etre appelee -- il n'y a rien a
    // ecrire quand l'extraction elle-meme a echoue.
    expect(recordSingleItemImport).not.toHaveBeenCalled();
  });
});

describe("enrichListingIfNeeded", () => {
  it("returns the payload unchanged when there is no previousVintedItemId (publish_listing, never republish)", async () => {
    const payload = makePayload({ description: "" });

    const result = await enrichListingIfNeeded(payload, undefined);

    expect(result).toBe(payload);
  });

  // Mission "REPUBLICATION FIDELE" (2026-08-11) : needsEnrichment() couvre
  // desormais TOUS les champs que seul l'enrichissement peut remplir (voir
  // son commentaire), pas seulement description -- ce test ne peut donc plus
  // se limiter a fournir une description pour prouver "rien a faire", il
  // doit fournir un payload REELLEMENT complet.
  it("returns the payload unchanged when every enrichable field is already present -- never re-enriches unnecessarily", async () => {
    const payload = makePayload({
      description: "Déjà une vraie description.",
      category: "Hommes Polos",
      condition: "Très bon état",
      brand: "Ralph Lauren",
      size: "L",
      color: "Bleu",
      material: "Coton",
    });

    const result = await enrichListingIfNeeded(payload, "123456789");

    expect(result).toBe(payload);
  });

  it("treats a whitespace-only description the same as empty -- still eligible for enrichment", async () => {
    const payload = makePayload({ description: "   " });

    // Sans previousVintedItemId, meme un payload "vide" (espaces) doit
    // rester inchange -- la garde previousVintedItemId prime toujours.
    const result = await enrichListingIfNeeded(payload, undefined);

    expect(result).toBe(payload);
  });
});
