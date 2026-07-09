import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { computeNarratives } from '../narrative';
import { makeAccount, makeListing } from './fixtures';

describe('computeNarratives', () => {
  it('produces no narrative at all when there is no data', () => {
    const ctx = buildContext([], [], []);
    expect(computeNarratives(ctx)).toHaveLength(0);
  });

  it('reports weekly sales for an account with a real sale this week', () => {
    const account = makeAccount({ label: 'matleshop' });
    const listing = makeListing({
      vinted_account_id: account.id,
      status: 'vendu',
      sold_date: new Date().toISOString().slice(0, 10),
      sold_price: 30,
      purchase_price: 10,
      fees: 0,
    });
    const ctx = buildContext([listing], [account], []);
    const narratives = computeNarratives(ctx).map((n) => n.message);
    expect(narratives.some((m) => m.includes('matleshop') && m.includes('1 article'))).toBe(true);
  });

  it('does not report a sale from more than a week ago as "this week"', () => {
    const account = makeAccount({ label: 'matleshop' });
    const listing = makeListing({
      vinted_account_id: account.id,
      status: 'vendu',
      sold_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      sold_price: 30,
      purchase_price: 10,
    });
    const ctx = buildContext([listing], [account], []);
    const narratives = computeNarratives(ctx).map((n) => n.message);
    expect(narratives.some((m) => m.includes('Cette semaine'))).toBe(false);
  });
});
