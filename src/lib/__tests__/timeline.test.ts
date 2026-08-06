import { describe, expect, it } from 'vitest';
import { buildListingTimeline } from '../timeline';
import type { TimelineActionInput, TimelineRecommendationInput } from '../timeline';
import type { ListingMetricSnapshot } from '../types';

function snap(overrides: Partial<ListingMetricSnapshot> = {}): ListingMetricSnapshot {
  return {
    id: `s-${Math.random()}`,
    listing_id: 'l1',
    views: 0,
    favourites: 0,
    price: 20,
    vinted_status: 'online',
    captured_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildListingTimeline', () => {
  it('aucun snapshot -> earliestDataAt null, timeline vide', () => {
    const timeline = buildListingTimeline([], [], [], null);
    expect(timeline.earliestDataAt).toBeNull();
    expect(timeline.events).toHaveLength(0);
  });

  it('earliestDataAt = date du plus ancien snapshot', () => {
    const timeline = buildListingTimeline(
      [snap({ captured_at: '2026-07-12T08:00:00.000Z' }), snap({ captured_at: '2026-08-01T00:00:00.000Z' })],
      [],
      [],
      null
    );
    expect(timeline.earliestDataAt).toBe('2026-07-12T08:00:00.000Z');
  });

  it('des synchros consecutives sans autre evenement sont agregees en UNE seule periode', () => {
    const timeline = buildListingTimeline(
      [
        snap({ captured_at: '2026-07-12T08:00:00.000Z', views: 1, favourites: 0, price: 25 }),
        snap({ captured_at: '2026-07-20T10:00:00.000Z', views: 5, favourites: 1, price: 25 }),
        snap({ captured_at: '2026-08-03T09:00:00.000Z', views: 12, favourites: 2, price: 20 }),
      ],
      [],
      [],
      null
    );
    expect(timeline.events).toHaveLength(1);
    const ev = timeline.events[0];
    expect(ev.type).toBe('engagement_period');
    if (ev.type === 'engagement_period') {
      expect(ev.snapshotCount).toBe(3);
      expect(ev.views).toEqual({ from: 1, to: 12 });
      expect(ev.favourites).toEqual({ from: 0, to: 2 });
      expect(ev.price).toEqual({ from: 25, to: 20, changed: true });
      expect(ev.from).toBe('2026-07-12T08:00:00.000Z');
      expect(ev.to).toBe('2026-08-03T09:00:00.000Z');
    }
  });

  it('un evenement action coupe la periode de synchros en deux groupes distincts', () => {
    const action: TimelineActionInput = {
      id: 'a1',
      kind: 'edit_listing',
      status: 'success',
      startedAt: '2026-07-25T12:00:00.000Z',
      completedAt: '2026-07-25T12:00:05.000Z',
      entries: [{ step: 'preparing', message: 'Préparation en cours', at: '2026-07-25T12:00:01.000Z' }],
    };
    const timeline = buildListingTimeline(
      [snap({ captured_at: '2026-07-12T08:00:00.000Z' }), snap({ captured_at: '2026-08-03T09:00:00.000Z' })],
      [action],
      [],
      null
    );
    expect(timeline.events.map((e) => e.type)).toEqual(['engagement_period', 'action', 'engagement_period']);
    const actionEvent = timeline.events[1];
    if (actionEvent.type === 'action') {
      expect(actionEvent.technicalDetail).toHaveLength(1);
      expect(actionEvent.kind).toBe('edit_listing');
    }
  });

  it("une recommandation ouverte puis resolue produit DEUX evenements distincts", () => {
    const rec: TimelineRecommendationInput = {
      id: 'r1',
      kind: 'baisser_prix',
      confidence: 'haute',
      reason: 'peu de vues',
      shownAt: '2026-07-15T00:00:00.000Z',
      resolvedAt: '2026-07-18T00:00:00.000Z',
      resolution: 'suivie',
    };
    const timeline = buildListingTimeline([], [], [rec], null);
    expect(timeline.events.map((e) => e.type)).toEqual(['recommendation_resolved', 'recommendation_opened']);
  });

  it("une recommandation toujours ouverte ne produit qu'un seul evenement (ouverture)", () => {
    const rec: TimelineRecommendationInput = {
      id: 'r1',
      kind: 'baisser_prix',
      confidence: 'haute',
      reason: 'peu de vues',
      shownAt: '2026-07-15T00:00:00.000Z',
      resolvedAt: null,
      resolution: null,
    };
    const timeline = buildListingTimeline([], [], [rec], null);
    expect(timeline.events).toEqual([
      { type: 'recommendation_opened', at: '2026-07-15T00:00:00.000Z', logId: 'r1', kind: 'baisser_prix', confidence: 'haute', reason: 'peu de vues' },
    ]);
  });

  it('une vente produit un evenement sale, trie a sa place chronologique', () => {
    const timeline = buildListingTimeline(
      [snap({ captured_at: '2026-07-01T00:00:00.000Z' }), snap({ captured_at: '2026-08-01T00:00:00.000Z' })],
      [],
      [],
      { soldAt: '2026-07-15T00:00:00.000Z', soldPrice: 18 }
    );
    expect(timeline.events.map((e) => e.type)).toEqual(['engagement_period', 'sale', 'engagement_period']);
  });

  it('ordre final descendant (le plus recent en premier)', () => {
    const timeline = buildListingTimeline(
      [snap({ captured_at: '2026-07-01T00:00:00.000Z' })],
      [],
      [
        {
          id: 'r1',
          kind: 'baisser_prix',
          confidence: 'haute',
          reason: 'x',
          shownAt: '2026-08-01T00:00:00.000Z',
          resolvedAt: null,
          resolution: null,
        },
      ],
      null
    );
    expect(timeline.events[0].at >= timeline.events[timeline.events.length - 1].at).toBe(true);
  });

  it('un seul snapshot isole produit tout de meme une periode (from === to)', () => {
    const timeline = buildListingTimeline([snap({ captured_at: '2026-07-12T08:00:00.000Z' })], [], [], null);
    expect(timeline.events).toHaveLength(1);
    const ev = timeline.events[0];
    if (ev.type === 'engagement_period') {
      expect(ev.from).toBe(ev.to);
      expect(ev.snapshotCount).toBe(1);
    }
  });
});
