process.env.TZ = 'Europe/Paris';

import { describe, expect, it } from 'vitest';
import { startOfLocalDayISO, toLocalDateString } from '../date';

describe('toLocalDateString', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    const d = new Date(2026, 0, 5, 14, 0); // 5 janvier 2026, 14h locale
    expect(toLocalDateString(d)).toBe('2026-01-05');
  });

  it('pads single-digit month and day', () => {
    const d = new Date(2026, 8, 3, 10, 0); // 3 septembre 2026
    expect(toLocalDateString(d)).toBe('2026-09-03');
  });

  it('diverges from the naive UTC-slice for a late-night local instant', () => {
    // 15 janvier 2026, 00h30 heure de Paris (UTC+1 en janvier) = 14 janvier
    // 22h30 UTC -- exactement le cas que `.toISOString().slice(0,10)` traite
    // mal (renverrait '2026-01-14').
    const d = new Date(2026, 0, 15, 0, 30);
    expect(toLocalDateString(d)).toBe('2026-01-15');
    expect(d.toISOString().slice(0, 10)).toBe('2026-01-14');
  });
});

describe('startOfLocalDayISO', () => {
  it('returns an ISO instant at local midnight', () => {
    const d = new Date(2026, 0, 15, 18, 45);
    const iso = startOfLocalDayISO(d);
    const parsed = new Date(iso);
    expect(toLocalDateString(parsed)).toBe('2026-01-15');
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
  });
});
