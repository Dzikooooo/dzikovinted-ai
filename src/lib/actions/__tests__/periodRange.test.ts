import { describe, expect, it } from 'vitest';
import { computePeriodRange } from '../periodRange';

// Mercredi 2026-07-15 10:30 - milieu de semaine/mois, evite les cas
// limites (dimanche, 1er du mois) qui masqueraient un bug d'arrondi.
const NOW = new Date('2026-07-15T10:30:00.000Z');

describe('computePeriodRange', () => {
  it('returns no bounds for "all"', () => {
    expect(computePeriodRange('all', NOW)).toEqual({ from: null, to: null });
  });

  it('returns the start of today for "today"', () => {
    const { from } = computePeriodRange('today', NOW);
    expect(from).not.toBeNull();
    const fromDate = new Date(from as string);
    expect(fromDate.getHours()).toBe(0);
    expect(fromDate.getMinutes()).toBe(0);
    expect(fromDate.getDate()).toBe(NOW.getDate());
  });

  it('returns the most recent Monday for "week"', () => {
    const { from } = computePeriodRange('week', NOW);
    const fromDate = new Date(from as string);
    expect(fromDate.getDay()).toBe(1); // lundi
    expect(fromDate.getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(NOW.getTime() - fromDate.getTime()).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it('handles a Sunday "now" correctly for "week" (previous Monday, not the same day)', () => {
    const sunday = new Date('2026-07-19T10:00:00.000Z'); // dimanche
    const { from } = computePeriodRange('week', sunday);
    const fromDate = new Date(from as string);
    expect(fromDate.getDay()).toBe(1);
    expect(fromDate.getDate()).toBe(13); // lundi precedent
  });

  it('returns the 1st of the month for "month"', () => {
    const { from } = computePeriodRange('month', NOW);
    const fromDate = new Date(from as string);
    expect(fromDate.getDate()).toBe(1);
    expect(fromDate.getMonth()).toBe(NOW.getMonth());
  });

  it('never returns an upper bound (open-ended toward now/future)', () => {
    for (const period of ['today', 'week', 'month', 'all'] as const) {
      expect(computePeriodRange(period, NOW).to).toBeNull();
    }
  });
});
