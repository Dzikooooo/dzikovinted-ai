import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { computeAlerts } from '../alerts';
import { REPUBLISH_AFTER_DAYS, LOW_MARGIN_THRESHOLD_EUR } from '../constants';
import { daysAgo, makeListing } from './fixtures';

describe('computeAlerts', () => {
  it('never raises an insufficient_margin alert when purchase_price is unknown', () => {
    const listing = makeListing({ price: 5, purchase_price: null });
    const ctx = buildContext([listing], [], []);
    const alerts = computeAlerts(ctx);
    expect(alerts.some((a) => a.kind === 'insufficient_margin')).toBe(false);
  });

  it('raises an insufficient_margin alert when the known margin is below the threshold', () => {
    const listing = makeListing({ vinted_status: 'online', price: 10, purchase_price: 10 - LOW_MARGIN_THRESHOLD_EUR / 2 });
    const ctx = buildContext([listing], [], []);
    const alerts = computeAlerts(ctx);
    expect(alerts.some((a) => a.kind === 'insufficient_margin' && a.listingId === listing.id)).toBe(true);
  });

  it('only raises dormant_stock once at least 3 listings qualify', () => {
    const dormant = (n: number) =>
      Array.from({ length: n }, () =>
        makeListing({ vinted_status: 'online', created_at: daysAgo(REPUBLISH_AFTER_DAYS * 3), views: 0, favourites: 0 })
      );

    const ctxTwo = buildContext(dormant(2), [], []);
    expect(computeAlerts(ctxTwo).some((a) => a.kind === 'dormant_stock')).toBe(false);

    const ctxThree = buildContext(dormant(3), [], []);
    expect(computeAlerts(ctxThree).some((a) => a.kind === 'dormant_stock')).toBe(true);
  });

  it('flags an exceptional ROI only on a completed sale with a known purchase price', () => {
    const sold = makeListing({ status: 'vendu', sold_price: 100, purchase_price: 10, fees: 0 });
    const ctx = buildContext([sold], [], []);
    const alerts = computeAlerts(ctx);
    expect(alerts.some((a) => a.kind === 'exceptional_roi' && a.listingId === sold.id)).toBe(true);
  });
});
