import { describe, expect, it } from 'vitest';
import { buildScanContext, buildSearchContext, contextForItem } from '../context';
import { MIN_OBSERVATIONS_FOR_HISTORY } from '../constants';
import { makeObservation, makeScrapedItem, makeWatchlist } from './fixtures';

describe('buildScanContext', () => {
  it('computes a category median across all searches in the same scan, not per search', () => {
    const watchA = makeWatchlist({ brand: 'Nike', category: 'Sneakers' });
    const watchB = makeWatchlist({ brand: 'Adidas', category: 'Sneakers' });
    const scanCtx = buildScanContext(
      [
        { watch: watchA, items: [makeScrapedItem({ favourites: 10 }), makeScrapedItem({ favourites: 20 })] },
        { watch: watchB, items: [makeScrapedItem({ favourites: 30 })] },
      ],
      []
    );
    expect(scanCtx.categoryMedianFavouritesByCategory.get('sneakers')).toBe(20);
  });

  it('leaves historical stats absent below the minimum observation count', () => {
    const watch = makeWatchlist();
    const observations = [makeObservation()]; // 1, below MIN_OBSERVATIONS_FOR_HISTORY
    const scanCtx = buildScanContext([{ watch, items: [] }], observations);
    const searchCtx = buildSearchContext(watch, [], scanCtx);
    expect(searchCtx.historicalPriceStats).toBeNull();
  });

  it('computes historical stats once enough observations accumulate', () => {
    const watch = makeWatchlist();
    const observations = Array.from({ length: MIN_OBSERVATIONS_FOR_HISTORY + 2 }, (_, i) =>
      makeObservation({ price: 50 + i })
    );
    const scanCtx = buildScanContext([{ watch, items: [] }], observations);
    const searchCtx = buildSearchContext(watch, [], scanCtx);
    expect(searchCtx.historicalPriceStats).not.toBeNull();
    expect(searchCtx.historicalPriceStats?.sampleSize).toBe(MIN_OBSERVATIONS_FOR_HISTORY + 2);
  });

  it('treats a URL still present in the current scan as not delisted', () => {
    const watch = makeWatchlist();
    const url = 'https://www.vinted.fr/items/1-still-here';
    const observations = [
      makeObservation({ vinted_url: url, scanned_at: new Date(Date.now() - 5 * 86400000).toISOString() }),
      makeObservation({ vinted_url: url, scanned_at: new Date().toISOString() }),
    ];
    const scanCtx = buildScanContext([{ watch, items: [makeScrapedItem({ url })] }], observations);
    const searchCtx = buildSearchContext(watch, [], scanCtx);
    expect(searchCtx.delistingSamples).toHaveLength(0);
  });

  it('resolves firstSeenAt for an item seen before, and null for a genuinely new one', () => {
    const watch = makeWatchlist();
    const knownUrl = 'https://www.vinted.fr/items/1-known';
    const earliest = new Date(Date.now() - 10 * 86400000).toISOString();
    const observations = [makeObservation({ vinted_url: knownUrl, scanned_at: earliest })];
    const scanCtx = buildScanContext([{ watch, items: [] }], observations);
    const searchCtx = buildSearchContext(watch, [], scanCtx);

    const known = contextForItem(searchCtx, knownUrl, scanCtx);
    expect(known.firstSeenAt).toBe(earliest);

    const unknown = contextForItem(searchCtx, 'https://www.vinted.fr/items/2-new', scanCtx);
    expect(unknown.firstSeenAt).toBeNull();
  });
});
