// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installPricePayloadPatch,
  patchPriceInRequestBody,
  setIntendedPrice,
  PRICE_PAYLOAD_PATCHED_EVENT,
} from "../priceMainWorldWriter";

// Mission "INJECTION DU PRIX DANS LE PAYLOAD" (2026-08-26) : ce patch est la
// SEULE modification de requete sortante de tout le projet. Ces tests portent
// donc autant sur ce qu'il fait que sur ce qu'il ne doit JAMAIS faire --
// toucher un autre endpoint, une autre methode, ou ecraser un prix deja
// renseigne.
const CREATE_URL = "https://www.vinted.fr/api/v2/item_upload/items";

beforeEach(() => {
  setIntendedPrice(null);
});

afterEach(() => {
  setIntendedPrice(null);
  vi.unstubAllGlobals();
});

describe("patchPriceInRequestBody", () => {
  it("ne touche a rien tant qu'aucun prix d'intention n'a ete enregistre", () => {
    expect(patchPriceInRequestBody(JSON.stringify({ price: null }))).toBeNull();
  });

  it("remplit un price null par la valeur numerique d'intention", () => {
    setIntendedPrice("24");

    const result = patchPriceInRequestBody(JSON.stringify({ item: { title: "Polo", price: null } }));

    expect(result).not.toBeNull();
    expect(JSON.parse(result!.patched)).toEqual({ item: { title: "Polo", price: 24 } });
    expect(result!.report).toMatchObject({ injectedValue: 24, injectedType: "number" });
  });

  it("remplit egalement un price a 0 ou chaine vide", () => {
    // Re-armement entre les deux appels : depuis l'audit C2, une substitution
    // reussie desarme immediatement le prix d'intention.
    setIntendedPrice("24");
    expect(JSON.parse(patchPriceInRequestBody(JSON.stringify({ price: 0 }))!.patched)).toEqual({ price: 24 });

    setIntendedPrice("24");
    expect(JSON.parse(patchPriceInRequestBody(JSON.stringify({ price: "" }))!.patched)).toEqual({ price: 24 });
  });

  // --- Audit C2 (2026-08-26) ---------------------------------------------
  it("desarme le prix des la PREMIERE substitution -- une seconde requete n'est jamais patchee", () => {
    setIntendedPrice("24");

    expect(patchPriceInRequestBody(JSON.stringify({ price: null }))).not.toBeNull();
    // Scenario de degat reel : une publication ULTERIEURE dans le meme
    // document envoie price:null et heriterait sinon du prix precedent.
    expect(patchPriceInRequestBody(JSON.stringify({ price: null }))).toBeNull();
  });

  it("expire le prix d'intention apres son TTL, meme si aucune substitution n'a eu lieu", () => {
    vi.useFakeTimers();
    try {
      setIntendedPrice("24");
      vi.advanceTimersByTime(120001);

      expect(patchPriceInRequestBody(JSON.stringify({ price: null }))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("n'ecrase JAMAIS un prix deja renseigne -- le jour ou React commite, le patch devient un no-op", () => {
    setIntendedPrice("24");

    expect(patchPriceInRequestBody(JSON.stringify({ price: 19 }))).toBeNull();
    expect(patchPriceInRequestBody(JSON.stringify({ price: "19.00" }))).toBeNull();
  });

  it("rapporte le chemin exact et la valeur d'avant, pour que la substitution soit verifiable", () => {
    setIntendedPrice("24");

    const result = patchPriceInRequestBody(JSON.stringify({ item: { price: null } }));

    expect(result!.report.touched).toEqual([{ path: "item.price", before: null, after: 24 }]);
  });

  it("ignore un body non-JSON ou un prix d'intention invalide, sans jamais lever", () => {
    setIntendedPrice("24");
    expect(patchPriceInRequestBody("pas du json")).toBeNull();

    setIntendedPrice("0");
    expect(patchPriceInRequestBody(JSON.stringify({ price: null }))).toBeNull();

    setIntendedPrice("abc");
    expect(patchPriceInRequestBody(JSON.stringify({ price: null }))).toBeNull();
  });
});

describe("installPricePayloadPatch -- portee reseau", () => {
  it("patche le POST de creation, et emet un evenement de journalisation", async () => {
    const originalFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", originalFetch);
    installPricePayloadPatch();
    setIntendedPrice("24");

    const reports: unknown[] = [];
    document.addEventListener(PRICE_PAYLOAD_PATCHED_EVENT, (e) => reports.push((e as CustomEvent).detail));

    await window.fetch(CREATE_URL, { method: "POST", body: JSON.stringify({ price: null }) });

    const sentBody = originalFetch.mock.calls[0][1]?.body as string;
    expect(JSON.parse(sentBody)).toEqual({ price: 24 });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ transport: "fetch", injectedValue: 24 });
  });

  it("ne touche JAMAIS un autre endpoint, meme en POST avec un price null", async () => {
    const originalFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", originalFetch);
    installPricePayloadPatch();
    setIntendedPrice("24");

    await window.fetch("https://www.vinted.fr/api/v2/users/me", {
      method: "POST",
      body: JSON.stringify({ price: null }),
    });

    expect(JSON.parse(originalFetch.mock.calls[0][1]?.body as string)).toEqual({ price: null });
  });

  it("ne touche JAMAIS une methode autre que POST sur l'endpoint de creation", async () => {
    const originalFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", originalFetch);
    installPricePayloadPatch();
    setIntendedPrice("24");

    await window.fetch(CREATE_URL, { method: "PUT", body: JSON.stringify({ price: null }) });

    expect(JSON.parse(originalFetch.mock.calls[0][1]?.body as string)).toEqual({ price: null });
  });
});
