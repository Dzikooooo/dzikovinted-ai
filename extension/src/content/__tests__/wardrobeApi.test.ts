import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllWardrobeItems } from "../wardrobeApi";

// Mission "FIABILISATION SYNCHRO VINTED, lot 1" (2026-08-16) : CAUSE REELLE
// prouvee par audit -- l'ancienne version retournait un simple tableau pour
// TOUS les cas, y compris une pagination interrompue en page >= 2 (`break`,
// items deja collectes renvoyes tels quels, traites ensuite comme un scan
// COMPLET par sync.ts::recordListings(), causant de fausses suppressions).
// Ces tests prouvent le contrat structure {items, complete, pagesRead,
// pagesExpected} pour les 4 scenarios requis (A/B/C/D) + les retries bornes.

function apiItem(id: number): Record<string, unknown> {
  return {
    id,
    title: `Item ${id}`,
    price: { amount: "10.00" },
    url: `https://www.vinted.fr/items/${id}`,
    photos: [{ url: `https://images.vinted.net/${id}.jpg` }],
    favourite_count: 0,
    view_count: 0,
  };
}

function apiPage(items: unknown[], currentPage: number, totalPages: number) {
  return { items, pagination: { current_page: currentPage, total_pages: totalPages, total_entries: items.length } };
}

function mockFetchByPage(handler: (page: number) => { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const match = /page=(\d+)/.exec(url);
      const page = match ? Number(match[1]) : 1;
      const r = handler(page);
      return Promise.resolve({
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 500),
        json: r.json ?? (async () => ({})),
      } as Response);
    })
  );
}

describe("fetchAllWardrobeItems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Cas A -- une seule page complete.
  it("returns complete:true for a single-page wardrobe", async () => {
    mockFetchByPage((page) => {
      if (page !== 1) throw new Error("page inattendue");
      return { ok: true, json: async () => apiPage([apiItem(1), apiItem(2)], 1, 1) };
    });

    const result = await fetchAllWardrobeItems("123");
    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.vintedItemId)).toEqual(["1", "2"]);
    expect(result.pagesRead).toBe(1);
    expect(result.pagesExpected).toBe(1);
  });

  // Cas B -- plusieurs pages, toutes reussies.
  it("returns complete:true with every item across multiple successful pages", async () => {
    mockFetchByPage((page) => {
      if (page === 1) return { ok: true, json: async () => apiPage([apiItem(1), apiItem(2)], 1, 3) };
      if (page === 2) return { ok: true, json: async () => apiPage([apiItem(3), apiItem(4)], 2, 3) };
      if (page === 3) return { ok: true, json: async () => apiPage([apiItem(5)], 3, 3) };
      throw new Error("page inattendue");
    });

    const result = await fetchAllWardrobeItems("123");
    expect(result.complete).toBe(true);
    expect(result.items.map((i) => i.vintedItemId)).toEqual(["1", "2", "3", "4", "5"]);
    expect(result.pagesRead).toBe(3);
    expect(result.pagesExpected).toBe(3);
  });

  // Cas C -- page 1 en echec (meme apres les tentatives bornees) : echec
  // total explicite, jamais un scan partiel silencieux -- on ne sait RIEN
  // de fiable sans la premiere page.
  it("throws an explicit error when page 1 fails, even after bounded retries", async () => {
    mockFetchByPage(() => ({ ok: false, status: 500 }));

    await expect(fetchAllWardrobeItems("123")).rejects.toThrow(/page 1/);
  }, 10000);

  // Cas D -- page 2 en echec (apres les tentatives bornees) : scan
  // INCOMPLET, items de la page 1 conserves pour diagnostic, mais
  // complete:false -- JAMAIS traite comme une preuve de suppression par
  // l'appelant.
  it("returns complete:false when page 2 fails after retries, keeping page 1's items without ever claiming a full scan", async () => {
    mockFetchByPage((page) => {
      if (page === 1) return { ok: true, json: async () => apiPage([apiItem(1), apiItem(2)], 1, 2) };
      return { ok: false, status: 503 };
    });

    const result = await fetchAllWardrobeItems("123");
    expect(result.complete).toBe(false);
    expect(result.items.map((i) => i.vintedItemId)).toEqual(["1", "2"]);
    expect(result.pagesRead).toBe(1);
    expect(result.pagesExpected).toBe(2);
  }, 10000);

  // Retries bornes : une panne TRANSITOIRE (echoue une fois, reussit au
  // second essai) ne doit pas degrader le scan en partiel -- preuve directe
  // que le retry ajoute par cette mission fonctionne reellement, pas
  // seulement qu'il est borne.
  it("retries a transiently-failing page and still returns a complete scan once it recovers", async () => {
    let page2Attempts = 0;
    mockFetchByPage((page) => {
      if (page === 1) return { ok: true, json: async () => apiPage([apiItem(1)], 1, 2) };
      page2Attempts += 1;
      if (page2Attempts < 2) return { ok: false, status: 503 };
      return { ok: true, json: async () => apiPage([apiItem(2)], 2, 2) };
    });

    const result = await fetchAllWardrobeItems("123");
    expect(result.complete).toBe(true);
    expect(result.items.map((i) => i.vintedItemId)).toEqual(["1", "2"]);
    expect(page2Attempts).toBe(2);
  }, 10000);

  // Jamais une boucle non bornee : au-dela des tentatives configurees
  // (3), l'appel s'arrete et retourne un resultat -- prouve indirectement
  // par le fait que les tests C/D ci-dessus se terminent du tout dans le
  // delai du test (10s), plutot que de bloquer indefiniment.
  it("never retries beyond the bounded attempt count (page 1 gives up and rejects, not infinite)", async () => {
    let attempts = 0;
    mockFetchByPage(() => {
      attempts += 1;
      return { ok: false, status: 500 };
    });

    await expect(fetchAllWardrobeItems("123")).rejects.toThrow();
    expect(attempts).toBe(3);
  }, 10000);
});
