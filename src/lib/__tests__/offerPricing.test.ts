import { describe, expect, it } from 'vitest';
import { computeOfferSuggestions, roundedOffer } from '../offerPricing';

describe('roundedOffer', () => {
  it("descend a l'euro inferieur", () => {
    expect(roundedOffer(25.9)).toBe(25);
    expect(roundedOffer(25.1)).toBe(25);
  });

  it("descend d'un euro quand le prix est deja rond -- sinon l'offre vaudrait le prix actuel", () => {
    expect(roundedOffer(25)).toBe(24);
  });

  it('ne descend jamais sous 1 €', () => {
    expect(roundedOffer(1)).toBe(1);
    expect(roundedOffer(0.5)).toBe(1);
  });
});

describe('computeOfferSuggestions', () => {
  it('calcule -5 %, -10 % et le prix rond, en euros ENTIERS comme formatEUR', () => {
    expect(computeOfferSuggestions(24.99)).toEqual([
      { kind: 'minus5', label: '-5 %', price: 24 },
      { kind: 'minus10', label: '-10 %', price: 22 },
      { kind: 'round', label: 'Prix rond', price: 24 },
    ]);
  });

  it('ne propose RIEN plutot que de calculer sur un prix absent ou nul', () => {
    expect(computeOfferSuggestions(null)).toEqual([]);
    expect(computeOfferSuggestions(0)).toEqual([]);
    expect(computeOfferSuggestions(-5)).toEqual([]);
  });

  it('ne descend jamais sous 1 € meme sur un tres petit prix', () => {
    const offers = computeOfferSuggestions(1);
    expect(offers.every((o) => o.price >= 1)).toBe(true);
  });
});
