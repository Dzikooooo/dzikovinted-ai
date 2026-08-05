import { describe, expect, it } from 'vitest';
import { getSyncFreshnessTier, hasSufficientSample } from '../dataSufficiency';
import { makeListing } from './fixtures';

describe('getSyncFreshnessTier', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');

  it('synced_at null -> perimee (jamais "fraiche" par defaut)', () => {
    expect(getSyncFreshnessTier({ synced_at: null }, now)).toBe('perimee');
  });

  it('synced_at il y a 1h -> fraiche', () => {
    const synced_at = new Date(now.getTime() - 1 * 3_600_000).toISOString();
    expect(getSyncFreshnessTier({ synced_at }, now)).toBe('fraiche');
  });

  it('synced_at exactement a la limite de 24h -> encore fraiche (strictement superieur bascule)', () => {
    const synced_at = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    expect(getSyncFreshnessTier({ synced_at }, now)).toBe('fraiche');
  });

  it('synced_at il y a 30h -> tendue', () => {
    const synced_at = new Date(now.getTime() - 30 * 3_600_000).toISOString();
    expect(getSyncFreshnessTier({ synced_at }, now)).toBe('tendue');
  });

  it('synced_at exactement a la limite de 48h -> encore tendue (strictement superieur bascule)', () => {
    const synced_at = new Date(now.getTime() - 48 * 3_600_000).toISOString();
    expect(getSyncFreshnessTier({ synced_at }, now)).toBe('tendue');
  });

  it('synced_at il y a 49h -> perimee', () => {
    const synced_at = new Date(now.getTime() - 49 * 3_600_000).toISOString();
    expect(getSyncFreshnessTier({ synced_at }, now)).toBe('perimee');
  });
});

describe('hasSufficientSample', () => {
  it('moins de 3 annonces online -> insuffisant', () => {
    const listings = [
      makeListing({ vinted_status: 'online' }),
      makeListing({ vinted_status: 'online' }),
      makeListing({ vinted_status: 'hidden' }),
    ];
    expect(hasSufficientSample({ listings })).toBe(false);
  });

  it('exactement 3 annonces online -> suffisant', () => {
    const listings = [
      makeListing({ vinted_status: 'online' }),
      makeListing({ vinted_status: 'online' }),
      makeListing({ vinted_status: 'online' }),
    ];
    expect(hasSufficientSample({ listings })).toBe(true);
  });

  it('les annonces vendues/hors-ligne ne comptent pas dans l\'echantillon', () => {
    const listings = [
      makeListing({ vinted_status: 'online' }),
      makeListing({ vinted_status: 'online' }),
      makeListing({ vinted_status: null, status: 'vendu' }),
      makeListing({ vinted_status: 'deleted' }),
    ];
    expect(hasSufficientSample({ listings })).toBe(false);
  });
});
