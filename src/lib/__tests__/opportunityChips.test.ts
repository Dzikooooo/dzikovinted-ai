import { describe, expect, it } from 'vitest';
import { buildOpportunityChips, MAX_CARD_CHIPS } from '../opportunityChips';
import type { MarketOpportunity } from '../types';

function makeOpportunity(over: Partial<MarketOpportunity> = {}): MarketOpportunity {
  return {
    id: 'o1',
    title: 'Veste Carhartt',
    brand: 'Carhartt',
    category: 'Jackets',
    image: null,
    images: null,
    price_found: 30,
    market_price: 60,
    profit: 22,
    roi: 73,
    score: 80,
    confidence: 65,
    price_source: 'ventes récentes',
    favourites: 3,
    vinted_url: 'https://www.vinted.fr/items/1',
    status: 'active',
    created_at: '2026-08-20T10:00:00Z',
    risk_level: 'faible',
    breakdown: null,
    resale_days_min: 10,
    resale_days_max: 20,
    resale_confidence: 60,
    first_observed_at: '2026-08-18T10:00:00Z',
    competing_listings_count: 12,
    ...over,
  };
}

describe('buildOpportunityChips', () => {
  it('derive les puces des champs deja produits par le moteur', () => {
    expect(buildOpportunityChips(makeOpportunity()).map((c) => c.label)).toEqual([
      '50 % sous le marché',
      '12 comparable' + 's',
      'Revente ~15 j',
      'Confiance 65 %',
    ]);
  });

  it('classe le signal le plus decisif en premier', () => {
    // L'ecart au marche decide d'acheter ; la confiance du modele est le plus
    // abstrait, donc le premier a sauter quand la carte tronque.
    const kinds = buildOpportunityChips(makeOpportunity()).map((c) => c.kind);
    expect(kinds[0]).toBe('under_market');
    expect(kinds[kinds.length - 1]).toBe('confidence');
  });

  it("ne produit AUCUNE puce pour un champ absent, jamais une puce a zero", () => {
    const chips = buildOpportunityChips(
      makeOpportunity({
        competing_listings_count: null,
        resale_days_min: null,
        resale_days_max: null,
        confidence: null,
      })
    );
    expect(chips.map((c) => c.kind)).toEqual(['under_market']);
  });

  it('se tait quand le prix est AU-DESSUS du marche plutot que de vanter une remise negative', () => {
    const chips = buildOpportunityChips(makeOpportunity({ price_found: 80, market_price: 60 }));
    expect(chips.some((c) => c.kind === 'under_market')).toBe(false);
  });

  it('ne divise pas par un prix marche a zero', () => {
    const chips = buildOpportunityChips(makeOpportunity({ market_price: 0 }));
    expect(chips.some((c) => c.kind === 'under_market')).toBe(false);
    expect(chips.every((c) => Number.isFinite(Number(c.label.replace(/\D/g, '') || 0)))).toBe(true);
  });

  it('accorde le pluriel de "comparable"', () => {
    const un = buildOpportunityChips(makeOpportunity({ competing_listings_count: 1 }));
    expect(un.find((c) => c.kind === 'comparables')?.label).toBe('1 comparable');
  });

  it("n'emet aucune puce quand le moteur n'a rien mesure", () => {
    expect(
      buildOpportunityChips(
        makeOpportunity({
          price_found: null,
          market_price: null,
          competing_listings_count: null,
          resale_days_min: null,
          resale_days_max: null,
          confidence: null,
        })
      )
    ).toEqual([]);
  });

  it('reste sous la limite de la carte une fois tronque', () => {
    expect(buildOpportunityChips(makeOpportunity()).slice(0, MAX_CARD_CHIPS)).toHaveLength(3);
  });
});
