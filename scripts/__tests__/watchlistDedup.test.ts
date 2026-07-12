import { describe, expect, it } from 'vitest';
import { dedupeWatchlist, type WatchlistRow } from '../watchlistDedup';

function makeRow(overrides: Partial<WatchlistRow> = {}): WatchlistRow {
  return {
    id: 'row-1',
    brand: 'Nike',
    model: 'Shox TL',
    category: 'Sneakers',
    priority: 1,
    min_profit: 20,
    min_roi: 50,
    ...overrides,
  };
}

describe('dedupeWatchlist', () => {
  it('collapses two users tracking the same brand+model into a single search', () => {
    const rows = [
      makeRow({ id: 'user-a', priority: 1, min_profit: 30, min_roi: 60 }),
      makeRow({ id: 'user-b', priority: 2, min_profit: 20, min_roi: 50 }),
    ];

    const result = dedupeWatchlist(rows);

    expect(result).toHaveLength(1);
    expect(result[0].brand).toBe('Nike');
    expect(result[0].model).toBe('Shox TL');
  });

  it('takes the minimum min_profit/min_roi across the group (most permissive threshold wins)', () => {
    const rows = [
      makeRow({ id: 'user-a', min_profit: 30, min_roi: 60 }),
      makeRow({ id: 'user-b', min_profit: 20, min_roi: 50 }),
      makeRow({ id: 'user-c', min_profit: 45, min_roi: 90 }),
    ];

    const result = dedupeWatchlist(rows);

    expect(result[0].min_profit).toBe(20);
    expect(result[0].min_roi).toBe(50);
  });

  it('takes the maximum priority across the group (strongest signal wins)', () => {
    const rows = [
      makeRow({ id: 'user-a', priority: 1 }),
      makeRow({ id: 'user-b', priority: 3 }),
      makeRow({ id: 'user-c', priority: 2 }),
    ];

    const result = dedupeWatchlist(rows);

    expect(result[0].priority).toBe(3);
  });

  it('keeps distinct brand+model pairs as separate entries', () => {
    const rows = [
      makeRow({ id: 'a', brand: 'Nike', model: 'Shox TL' }),
      makeRow({ id: 'b', brand: 'Salomon', model: 'XT-6' }),
      makeRow({ id: 'c', brand: 'Nike', model: 'Air Max' }),
    ];

    const result = dedupeWatchlist(rows);

    expect(result).toHaveLength(3);
  });

  it('is a no-op on an already-unique list', () => {
    const rows = [makeRow({ id: 'solo' })];

    const result = dedupeWatchlist(rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(rows[0]);
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeWatchlist([])).toEqual([]);
  });
});
