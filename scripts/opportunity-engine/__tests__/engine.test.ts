import { describe, expect, it } from 'vitest';
import { analyzeOpportunity, meetsOpportunityGate } from '../engine';
import { makeContext } from './fixtures';

describe('meetsOpportunityGate', () => {
  it('excludes an item flagged "risque élevé" even when score and confidence both clear the threshold (real scan regression)', () => {
    // Preuve reelle (scan du 2026-07-11) : "doudoune the north face nuptse
    // 700" a 1 euro pour un marche estime a 85 euros atterrit exactement au
    // plancher de confiance apres la penalite de sous-evaluation, mais
    // reste marque "risque eleve" - il ne doit jamais etre affiche comme
    // opportunite, quel que soit le score.
    const ctx = makeContext({ comparablePrices: [80, 82, 85, 88, 90], categoryMedianFavourites: 10 });
    const analysis = analyzeOpportunity({ price: 1, favourites: 15, priority: 5 }, ctx);
    expect(analysis.risk_level).toBe('eleve');
    expect(meetsOpportunityGate(analysis)).toBe(false);
  });

  it('accepts a genuinely strong, low-risk opportunity', () => {
    const ctx = makeContext({ comparablePrices: [80, 82, 85, 88, 90, 84, 86, 83, 81, 89], categoryMedianFavourites: 10 });
    const analysis = analyzeOpportunity({ price: 40, favourites: 30, priority: 5 }, ctx);
    expect(meetsOpportunityGate(analysis)).toBe(true);
    expect(analysis.risk_level).not.toBe('eleve');
  });
});
