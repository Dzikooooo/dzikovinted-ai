import { describe, expect, it } from 'vitest';
import { computeScore } from '../scoring';
import { BASE_SCORE } from '../constants';
import { makeContext } from './fixtures';

describe('computeScore', () => {
  it('stays at the neutral baseline when there is no signal at all', () => {
    const ctx = makeContext({ categoryMedianFavourites: null });
    const result = computeScore({ roi: 0, profit: 0, favourites: 0, priority: 0, price: 80 }, ctx);
    expect(result.score).toBe(BASE_SCORE);
    expect(result.breakdown).toHaveLength(0);
  });

  it('rewards a high ROI with a named, positive contribution', () => {
    const ctx = makeContext();
    const result = computeScore({ roi: 220, profit: 10, favourites: 0, priority: 0, price: 80 }, ctx);
    expect(result.score).toBeGreaterThan(BASE_SCORE);
    expect(result.breakdown.some((e) => e.label.includes('ROI exceptionnel'))).toBe(true);
  });

  it('never fabricates a demand bonus when the category median is unknown', () => {
    const ctx = makeContext({ categoryMedianFavourites: null });
    const result = computeScore({ roi: 0, profit: 0, favourites: 500, priority: 0, price: 80 }, ctx);
    expect(result.breakdown.some((e) => e.label.toLowerCase().includes('demande'))).toBe(false);
  });

  it('rewards demand relative to the category median, not an absolute favourites count', () => {
    const ctx = makeContext({ categoryMedianFavourites: 10 });
    const strong = computeScore({ roi: 0, profit: 0, favourites: 30, priority: 0, price: 80 }, ctx);
    expect(strong.breakdown.some((e) => e.label.includes('Demande'))).toBe(true);
  });

  it('uses watchlist.priority as a real scoring input', () => {
    const ctx = makeContext();
    const noPriority = computeScore({ roi: 0, profit: 0, favourites: 0, priority: 0, price: 80 }, ctx);
    const withPriority = computeScore({ roi: 0, profit: 0, favourites: 0, priority: 3, price: 80 }, ctx);
    expect(withPriority.score).toBeGreaterThan(noPriority.score);
  });

  it('clamps the score between 0 and 100', () => {
    const ctx = makeContext();
    const result = computeScore({ roi: 1000, profit: 1000, favourites: 1000, priority: 3, price: 10 }, ctx);
    expect(result.score).toBeLessThanOrEqual(100);

    const worst = computeScore({ roi: -100, profit: -100, favourites: 0, priority: 0, price: 500 }, ctx);
    expect(worst.score).toBeGreaterThanOrEqual(0);
  });
});
