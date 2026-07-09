import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { computeRecommendations } from '../recommendations';
import { REPUBLISH_AFTER_DAYS } from '../constants';
import { daysAgo, makeListing } from './fixtures';

describe('computeRecommendations', () => {
  it('recommends republishing an active listing older than the threshold', () => {
    const listing = makeListing({
      vinted_status: 'online',
      created_at: daysAgo(REPUBLISH_AFTER_DAYS + 5),
      views: null,
      favourites: null,
    });
    const ctx = buildContext([listing], [], []);
    const recs = computeRecommendations(ctx);
    expect(recs).toHaveLength(1);
    expect(recs[0].kind).toBe('republish');
  });

  it('does not recommend anything for a recently listed article', () => {
    const listing = makeListing({ vinted_status: 'online', created_at: daysAgo(2) });
    const ctx = buildContext([listing], [], []);
    expect(computeRecommendations(ctx)).toHaveLength(0);
  });

  it('never produces a recommendation for a draft never linked to Vinted', () => {
    const listing = makeListing({ vinted_status: null, created_at: daysAgo(REPUBLISH_AFTER_DAYS + 100) });
    const ctx = buildContext([listing], [], []);
    expect(computeRecommendations(ctx)).toHaveLength(0);
  });

  it('recommends raising the price when engagement is far above the active median', () => {
    const popular = makeListing({ vinted_status: 'online', views: 100, favourites: 20, created_at: daysAgo(1) });
    const others = Array.from({ length: 5 }, () =>
      makeListing({ vinted_status: 'online', views: 10, favourites: 2, created_at: daysAgo(1) })
    );
    const ctx = buildContext([popular, ...others], [], []);
    const recs = computeRecommendations(ctx).filter((r) => r.listingId === popular.id);
    expect(recs[0]?.kind).toBe('raise_price');
  });

  it('gives at most one recommendation per listing even if several rules would match', () => {
    const listing = makeListing({
      vinted_status: 'online',
      created_at: daysAgo(REPUBLISH_AFTER_DAYS + 40),
      views: 1,
      favourites: 0,
    });
    const others = Array.from({ length: 5 }, () => makeListing({ vinted_status: 'online', views: 20, favourites: 5 }));
    const ctx = buildContext([listing, ...others], [], []);
    const recs = computeRecommendations(ctx).filter((r) => r.listingId === listing.id);
    expect(recs).toHaveLength(1);
  });
});
