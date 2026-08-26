// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeFavouritesGains,
  readFavouritesBaseline,
  writeFavouritesBaseline,
} from '../favouritesBaseline';

beforeEach(() => {
  localStorage.clear();
});

describe('computeFavouritesGains', () => {
  it("rend gained:null pour une annonce jamais vue -- on ne SAIT pas si ses favoris sont recents", () => {
    const gains = computeFavouritesGains([{ id: 'a', favourites: 7 }], {});

    expect(gains).toEqual([{ listingId: 'a', current: 7, gained: null }]);
  });

  it('calcule le gain reel depuis la reference', () => {
    const gains = computeFavouritesGains([{ id: 'a', favourites: 9 }], { a: 6 });

    expect(gains).toEqual([{ listingId: 'a', current: 9, gained: 3 }]);
  });

  it("ne rend jamais un gain negatif quand un favori a ete retire", () => {
    const gains = computeFavouritesGains([{ id: 'a', favourites: 2 }], { a: 5 });

    expect(gains[0].gained).toBe(0);
  });

  it('traite un compteur null comme 0', () => {
    const gains = computeFavouritesGains([{ id: 'a', favourites: null }], { a: 0 });

    expect(gains[0]).toEqual({ listingId: 'a', current: 0, gained: 0 });
  });
});

describe('persistance', () => {
  it('relit ce qui a ete ecrit', () => {
    writeFavouritesBaseline({ a: 3, b: 5 });

    expect(readFavouritesBaseline()).toEqual({ a: 3, b: 5 });
  });

  it('ignore un contenu corrompu plutot que de lever', () => {
    localStorage.setItem('resellos:favouritesBaseline', 'pas du json');
    expect(readFavouritesBaseline()).toEqual({});

    localStorage.setItem('resellos:favouritesBaseline', '["tableau"]');
    expect(readFavouritesBaseline()).toEqual({});

    localStorage.setItem('resellos:favouritesBaseline', '{"a":"trois"}');
    expect(readFavouritesBaseline()).toEqual({});
  });

  it("ne casse JAMAIS quand localStorage leve (navigation privee, quota)", () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeFavouritesBaseline({ a: 1 })).not.toThrow();
    spy.mockRestore();

    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readFavouritesBaseline()).toEqual({});
    getSpy.mockRestore();
  });
});
