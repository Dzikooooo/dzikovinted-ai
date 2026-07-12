process.env.TZ = 'Europe/Paris';

import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { computeNarratives } from '../narrative';
import { makeAccount, makeListing } from './fixtures';
import { toLocalDateString } from '../../date';

function daysAgoLocalDateString(n: number): string {
  return toLocalDateString(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

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

  it('includes a sale exactly 7 days ago as "this week" (boundary inclusive)', () => {
    const account = makeAccount({ label: 'boundary7' });
    const listing = makeListing({
      vinted_account_id: account.id,
      status: 'vendu',
      sold_date: daysAgoLocalDateString(7),
      sold_price: 30,
      purchase_price: 10,
    });
    const ctx = buildContext([listing], [account], []);
    const narratives = computeNarratives(ctx).map((n) => n.message);
    expect(narratives.some((m) => m.includes('Cette semaine') && m.includes('boundary7'))).toBe(true);
  });

  it('excludes a sale 8 days ago from "this week"', () => {
    const account = makeAccount({ label: 'boundary8' });
    const listing = makeListing({
      vinted_account_id: account.id,
      status: 'vendu',
      sold_date: daysAgoLocalDateString(8),
      sold_price: 30,
      purchase_price: 10,
    });
    const ctx = buildContext([listing], [account], []);
    const narratives = computeNarratives(ctx).map((n) => n.message);
    expect(narratives.some((m) => m.includes('Cette semaine') && m.includes('boundary8'))).toBe(false);
  });

  it('includes a sale 25 days ago in the 30-day bucket', () => {
    const account = makeAccount({ label: 'month25' });
    const listing = makeListing({
      vinted_account_id: account.id,
      status: 'vendu',
      sold_date: daysAgoLocalDateString(25),
      sold_price: 30,
      purchase_price: 10,
    });
    const ctx = buildContext([listing], [account], []);
    const narratives = computeNarratives(ctx).map((n) => n.message);
    expect(narratives.some((m) => m.includes('Ces 30 derniers jours') && m.includes('month25'))).toBe(true);
  });

  it('excludes a sale 35 days ago from the 30-day bucket', () => {
    const account = makeAccount({ label: 'month35' });
    const listing = makeListing({
      vinted_account_id: account.id,
      status: 'vendu',
      sold_date: daysAgoLocalDateString(35),
      sold_price: 30,
      purchase_price: 10,
    });
    const ctx = buildContext([listing], [account], []);
    const narratives = computeNarratives(ctx).map((n) => n.message);
    expect(narratives.some((m) => m.includes('Ces 30 derniers jours') && m.includes('month35'))).toBe(false);
  });

  it('handles the local/UTC calendar-day crossing correctly (00h30 Paris = previous day UTC)', () => {
    // Le bug original : new Date(sold_date) parse une date-seule en UTC-minuit,
    // compare contre un instant precis dont l'heure locale varie -- ce test
    // fige "maintenant" a 00h30 heure de Paris (23h30 UTC la veille), le cas
    // exact ou l'ancien code pouvait exclure a tort une vente du jour meme.
    const now = new Date(2026, 0, 15, 0, 30); // 15 janvier 2026, 00h30 heure locale (Paris, UTC+1)
    const account = makeAccount({ label: 'tzcase' });
    const listing = makeListing({
      vinted_account_id: account.id,
      status: 'vendu',
      sold_date: '2026-01-15', // vendu "aujourd'hui" en heure locale
      sold_price: 30,
      purchase_price: 10,
    });
    const ctx = buildContext([listing], [account], [], now);
    const narratives = computeNarratives(ctx).map((n) => n.message);
    expect(narratives.some((m) => m.includes('Cette semaine') && m.includes('tzcase'))).toBe(true);
  });
});
