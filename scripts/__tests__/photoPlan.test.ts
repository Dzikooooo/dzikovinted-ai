import { describe, expect, it, vi } from 'vitest';
import {
  MAX_GALLERY_FETCHES,
  PHOTO_FETCH_CONCURRENCY,
  mapWithConcurrency,
  planGalleryFetches,
  type GalleryCandidate,
} from '../photoPlan';

function candidate(url: string, score: number, profit = 0): GalleryCandidate {
  return { url, score, profit };
}

function many(n: number): GalleryCandidate[] {
  // Scores decroissants : l'element i est le (i+1)e meilleur.
  return Array.from({ length: n }, (_, i) => candidate(`u${i}`, 100 - i));
}

const nothingKnown = () => false;

describe('planGalleryFetches -- plafond', () => {
  it('ne visite jamais plus que le plafond', () => {
    const plan = planGalleryFetches(many(100), nothingKnown);
    expect(plan.toFetch).toHaveLength(MAX_GALLERY_FETCHES);
    expect(plan.skipped).toHaveLength(70);
  });

  it('ne perd aucune opportunite : tout est classe quelque part', () => {
    const items = many(100);
    const plan = planGalleryFetches(items, (url) => url === 'u5' || url === 'u60');
    expect(plan.reused.length + plan.toFetch.length + plan.skipped.length).toBe(items.length);
    expect(new Set([...plan.reused, ...plan.toFetch, ...plan.skipped]).size).toBe(items.length);
  });

  it('visite tout quand il y a moins d\'opportunites que le plafond', () => {
    const plan = planGalleryFetches(many(4), nothingKnown);
    expect(plan.toFetch).toHaveLength(4);
    expect(plan.skipped).toHaveLength(0);
  });

  it('ne visite rien sur une liste vide', () => {
    expect(planGalleryFetches([], nothingKnown)).toEqual({ reused: [], toFetch: [], skipped: [] });
  });
});

describe('planGalleryFetches -- priorite', () => {
  it('visite les meilleurs scores en premier', () => {
    const plan = planGalleryFetches(
      [candidate('faible', 10), candidate('fort', 90), candidate('moyen', 50)],
      nothingKnown,
      2
    );
    expect(plan.toFetch).toEqual(['fort', 'moyen']);
    expect(plan.skipped).toEqual(['faible']);
  });

  it('departage deux scores egaux par le profit', () => {
    const plan = planGalleryFetches(
      [candidate('petit', 80, 10), candidate('gros', 80, 90)],
      nothingKnown,
      1
    );
    expect(plan.toFetch).toEqual(['gros']);
  });

  it('ne mute pas la liste que l\'appelant reutilise ensuite pour l\'upsert', () => {
    const items = [candidate('a', 10), candidate('b', 90)];
    planGalleryFetches(items, nothingKnown);
    expect(items.map((i) => i.url)).toEqual(['a', 'b']);
  });
});

describe('planGalleryFetches -- cache', () => {
  it('reutilise une galerie connue quel que soit son rang', () => {
    // 'dernier' est le pire score, mais sa galerie est gratuite : la
    // reutiliser ne coute aucune requete.
    const plan = planGalleryFetches(
      [candidate('fort', 90), candidate('dernier', 1)],
      (url) => url === 'dernier',
      1
    );
    expect(plan.reused).toEqual(['dernier']);
    expect(plan.toFetch).toEqual(['fort']);
  });

  it('une galerie en cache ne consomme PAS le plafond', () => {
    const items = many(100);
    // Les 50 premieres sont deja connues : les 30 visites doivent aller aux
    // meilleures NON connues, pas etre amputees de 50.
    const plan = planGalleryFetches(items, (url) => Number(url.slice(1)) < 50);
    expect(plan.reused).toHaveLength(50);
    expect(plan.toFetch).toHaveLength(MAX_GALLERY_FETCHES);
    expect(plan.toFetch[0]).toBe('u50');
  });

  it('ne visite rien quand tout est deja connu', () => {
    const plan = planGalleryFetches(many(80), () => true);
    expect(plan.toFetch).toHaveLength(0);
    expect(plan.reused).toHaveLength(80);
  });
});

describe('mapWithConcurrency', () => {
  it('rend les resultats dans l\'ordre des entrees, pas de fin d\'execution', async () => {
    const out = await mapWithConcurrency([30, 10, 20], 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('traite CHAQUE element exactement une fois', async () => {
    const seen: number[] = [];
    await mapWithConcurrency(Array.from({ length: 37 }, (_, i) => i), 2, async (n) => {
      seen.push(n);
      return n;
    });
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
  });

  it('ne depasse jamais la limite de taches simultanees', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 2, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return null;
    });
    expect(peak).toBe(2);
  });

  it("n'utilise jamais le meme onglet sur deux taches simultanees", async () => {
    // LE test de ce module. Chaque executant a SON onglet Playwright ; si
    // deux taches en vol partagent un onglet, leurs page.goto s'annulent et
    // des galeries disparaissent sans erreur. Indexer les onglets par la
    // position de l'element (index % N) laissait passer ce cas.
    const busy = new Set<number>();
    let collision = false;

    await mapWithConcurrency(Array.from({ length: 30 }, (_, i) => i), 2, async (_item, _index, workerIndex) => {
      if (busy.has(workerIndex)) collision = true;
      busy.add(workerIndex);
      // Duree variable : force les executants a se desynchroniser, ce qui est
      // precisement la situation ou index % N se trompait d'onglet.
      await new Promise((r) => setTimeout(r, _item % 3));
      busy.delete(workerIndex);
      return null;
    });

    expect(collision).toBe(false);
  });

  it('donne a chaque executant un numero distinct et borne', async () => {
    const workerIds = new Set<number>();
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 2, async (_i, _idx, w) => {
      workerIds.add(w);
      await new Promise((r) => setTimeout(r, 1));
      return null;
    });
    expect([...workerIds].sort()).toEqual([0, 1]);
  });

  it('ne bloque pas sur une limite de 0', async () => {
    const out = await mapWithConcurrency([1, 2], 0, async (n) => n * 2);
    expect(out).toEqual([2, 4]);
  });

  it('gere une liste vide', async () => {
    expect(await mapWithConcurrency([], 2, vi.fn())).toEqual([]);
  });

  it('garde la concurrence photo volontairement basse (une seule IP CI)', () => {
    expect(PHOTO_FETCH_CONCURRENCY).toBe(2);
  });
});
