import { describe, expect, it } from 'vitest';
import { hasRecentPriceChange, hasRecentRepublishAttempt } from '../actionCooldown';
import type { RecentActionSummary } from '../types';
import { daysAgo } from './fixtures';

function ctxWithActions(listingId: string, actions: RecentActionSummary[], now = new Date()) {
  return { actionsByListingId: new Map([[listingId, actions]]), now };
}

describe('hasRecentRepublishAttempt', () => {
  it('aucune action connue -> false', () => {
    expect(hasRecentRepublishAttempt('l1', { actionsByListingId: new Map(), now: new Date() })).toBe(false);
  });

  it('publish_listing recent (< 7j) -> true', () => {
    const ctx = ctxWithActions('l1', [{ listingId: 'l1', kind: 'publish_listing', completedAt: daysAgo(2) }]);
    expect(hasRecentRepublishAttempt('l1', ctx)).toBe(true);
  });

  it('republish_listing recent (< 7j) -> true', () => {
    const ctx = ctxWithActions('l1', [{ listingId: 'l1', kind: 'republish_listing', completedAt: daysAgo(1) }]);
    expect(hasRecentRepublishAttempt('l1', ctx)).toBe(true);
  });

  it('republish_listing trop ancien (> 7j) -> false', () => {
    const ctx = ctxWithActions('l1', [{ listingId: 'l1', kind: 'republish_listing', completedAt: daysAgo(10) }]);
    expect(hasRecentRepublishAttempt('l1', ctx)).toBe(false);
  });

  it('edit_listing recent ne compte pas comme une tentative de republication', () => {
    const ctx = ctxWithActions('l1', [{ listingId: 'l1', kind: 'edit_listing', completedAt: daysAgo(1) }]);
    expect(hasRecentRepublishAttempt('l1', ctx)).toBe(false);
  });

  it('action recente sur une autre annonce ne declenche pas le cooldown', () => {
    const ctx = ctxWithActions('l2', [{ listingId: 'l2', kind: 'publish_listing', completedAt: daysAgo(1) }]);
    expect(hasRecentRepublishAttempt('l1', ctx)).toBe(false);
  });
});

describe('hasRecentPriceChange', () => {
  it('aucune action connue -> false', () => {
    expect(hasRecentPriceChange('l1', { actionsByListingId: new Map(), now: new Date() })).toBe(false);
  });

  it('edit_listing recent avec price dans changedFields -> true', () => {
    const ctx = ctxWithActions('l1', [
      { listingId: 'l1', kind: 'edit_listing', completedAt: daysAgo(2), changedFields: ['price'] },
    ]);
    expect(hasRecentPriceChange('l1', ctx)).toBe(true);
  });

  it('edit_listing recent sans price dans changedFields -> false', () => {
    const ctx = ctxWithActions('l1', [
      { listingId: 'l1', kind: 'edit_listing', completedAt: daysAgo(2), changedFields: ['title', 'description'] },
    ]);
    expect(hasRecentPriceChange('l1', ctx)).toBe(false);
  });

  it('edit_listing avec changement de prix mais trop ancien (> 7j) -> false', () => {
    const ctx = ctxWithActions('l1', [
      { listingId: 'l1', kind: 'edit_listing', completedAt: daysAgo(10), changedFields: ['price'] },
    ]);
    expect(hasRecentPriceChange('l1', ctx)).toBe(false);
  });

  it('changedFields absent (undefined) -> false, jamais un crash', () => {
    const ctx = ctxWithActions('l1', [{ listingId: 'l1', kind: 'edit_listing', completedAt: daysAgo(1) }]);
    expect(hasRecentPriceChange('l1', ctx)).toBe(false);
  });
});
