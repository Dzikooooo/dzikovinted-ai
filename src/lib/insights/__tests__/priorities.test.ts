import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { computePriorities } from '../priorities';
import { MAX_PRIORITIES } from '../constants';
import type { Alert, Recommendation } from '../types';
import { makeListing } from './fixtures';

describe('computePriorities', () => {
  it('caps the result at MAX_PRIORITIES items', () => {
    const alerts: Alert[] = Array.from({ length: MAX_PRIORITIES + 5 }, (_, i) => ({
      kind: 'insufficient_margin',
      severity: 'warning',
      scope: 'listing',
      message: `Alerte ${i}`,
    }));
    const ctx = buildContext([], [], []);
    const priorities = computePriorities(alerts, [], ctx);
    expect(priorities).toHaveLength(MAX_PRIORITIES);
  });

  it('ranks critical/warning alerts above informational ones', () => {
    const alerts: Alert[] = [
      { kind: 'high_demand', severity: 'info', scope: 'listing', message: 'Info' },
      { kind: 'insufficient_margin', severity: 'warning', scope: 'listing', message: 'Warning' },
    ];
    const ctx = buildContext([], [], []);
    const priorities = computePriorities(alerts, [], ctx);
    expect(priorities[0].message).toBe('Warning');
  });

  it('includes the listing title in a recommendation-derived priority message', () => {
    const listing = makeListing({ title: 'Sneakers rares' });
    const recommendations: Recommendation[] = [
      { listingId: listing.id, kind: 'republish', message: 'Republier conseillé', reason: 'test' },
    ];
    const ctx = buildContext([listing], [], []);
    const priorities = computePriorities([], recommendations, ctx);
    expect(priorities[0].message).toContain('Sneakers rares');
  });
});
