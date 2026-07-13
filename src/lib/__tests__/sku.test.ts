import { describe, expect, it } from 'vitest';
import { extractSkuFromTitle, formatTitleWithSku } from '../sku';

describe('formatTitleWithSku', () => {
  it('appends the sku to the title', () => {
    expect(formatTitleWithSku('Sweat Nike', 12)).toBe('Sweat Nike #12');
  });

  it('returns the title unchanged when sku is null', () => {
    expect(formatTitleWithSku('Sweat Nike', null)).toBe('Sweat Nike');
  });
});

describe('extractSkuFromTitle', () => {
  it('extracts a trailing #N and strips it from the title', () => {
    expect(extractSkuFromTitle('Sweat Nike #12')).toEqual({ title: 'Sweat Nike', sku: 12 });
  });

  it('handles multi-digit skus', () => {
    expect(extractSkuFromTitle('Robe vintage #431')).toEqual({ title: 'Robe vintage', sku: 431 });
  });

  it('returns the title unchanged and sku null when no trailing pattern exists', () => {
    expect(extractSkuFromTitle('Sweat Nike')).toEqual({ title: 'Sweat Nike', sku: null });
  });

  it('does not match a hashtag in the middle of the title', () => {
    expect(extractSkuFromTitle('Sweat #vintage Nike')).toEqual({ title: 'Sweat #vintage Nike', sku: null });
  });

  it('trims trailing whitespace left after stripping the sku', () => {
    expect(extractSkuFromTitle('Sweat Nike   #12')).toEqual({ title: 'Sweat Nike', sku: 12 });
  });
});
