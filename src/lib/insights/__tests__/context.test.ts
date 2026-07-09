import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { MIN_SAMPLE_SIZE_FOR_COMPARISON } from '../constants';
import { makeListing } from './fixtures';

describe('buildContext', () => {
  it('returns null averages when the sample size is below the reliability threshold', () => {
    const listings = [
      makeListing({ status: 'vendu', brand: 'Nike', purchase_price: 10, sold_price: 30, fees: 0 }),
    ];
    const ctx = buildContext(listings, [], []);
    expect(ctx.byBrand.get('nike')?.avgRoi).toBeNull();
  });

  it('computes a real average ROI once the sample size is reliable', () => {
    const listings = Array.from({ length: MIN_SAMPLE_SIZE_FOR_COMPARISON }, () =>
      makeListing({ status: 'vendu', brand: 'Nike', purchase_price: 10, sold_price: 20, fees: 0 })
    );
    const ctx = buildContext(listings, [], []);
    // (20-10-0)/10 * 100 = 100% pour chaque ligne
    expect(ctx.byBrand.get('nike')?.avgRoi).toBe(100);
  });

  it('never treats an unknown purchase_price as zero when averaging', () => {
    const listings = [
      makeListing({ status: 'vendu', brand: 'Nike', purchase_price: null, sold_price: 30 }),
      makeListing({ status: 'vendu', brand: 'Nike', purchase_price: null, sold_price: 30 }),
      makeListing({ status: 'vendu', brand: 'Nike', purchase_price: null, sold_price: 30 }),
    ];
    const ctx = buildContext(listings, [], []);
    // Aucune ligne n'a de prix d'achat connu : avgRoi doit rester null, pas
    // un chiffre fabrique en traitant l'inconnu comme 0.
    expect(ctx.byBrand.get('nike')?.avgRoi).toBeNull();
  });

  it('computes the active-listing median only from online listings', () => {
    const listings = [
      makeListing({ vinted_status: 'online', views: 10 }),
      makeListing({ vinted_status: 'online', views: 20 }),
      makeListing({ vinted_status: 'sold_completed', views: 1000 }), // ne doit pas polluer la mediane des annonces actives
    ];
    const ctx = buildContext(listings, [], []);
    expect(ctx.activeMedianViews).toBe(15);
  });
});
