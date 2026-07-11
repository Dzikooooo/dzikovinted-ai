import type { EngineContext } from '../types';
import type { PriceObservationRow, ScrapedItemLike, WatchlistLike } from '../context';

export function makeContext(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    comparablePrices: [50, 55, 60, 45, 52],
    categoryMedianFavourites: null,
    historicalPriceStats: null,
    delistingSamples: [],
    firstSeenAt: null,
    ...overrides,
  };
}

export function makeWatchlist(overrides: Partial<WatchlistLike> = {}): WatchlistLike {
  return { brand: 'Nike', category: 'Sneakers', ...overrides };
}

export function makeScrapedItem(overrides: Partial<ScrapedItemLike> = {}): ScrapedItemLike {
  return { url: 'https://www.vinted.fr/items/1-test', favourites: 5, ...overrides };
}

export function makeObservation(overrides: Partial<PriceObservationRow> = {}): PriceObservationRow {
  return {
    vinted_url: 'https://www.vinted.fr/items/1-test',
    brand: 'Nike',
    category: 'Sneakers',
    price: 50,
    favourites: 5,
    scanned_at: new Date().toISOString(),
    ...overrides,
  };
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
