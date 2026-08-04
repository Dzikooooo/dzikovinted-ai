import { describe, expect, it } from 'vitest';
import { normalizeBrand } from '../brand';

describe('normalizeBrand', () => {
  it('accepts a plain single-word brand', () => {
    expect(normalizeBrand('Nike')).toBe('Nike');
  });

  it('accepts real multi-word brands (must never reject rare/multi-word brands)', () => {
    expect(normalizeBrand('The North Face')).toBe('The North Face');
    expect(normalizeBrand('C.P. Company')).toBe('C.P. Company');
    expect(normalizeBrand('New Balance')).toBe('New Balance');
    expect(normalizeBrand('Nike x Stussy')).toBe('Nike x Stussy');
    expect(normalizeBrand('Comme des Garcons')).toBe('Comme des Garcons');
  });

  it('collapses internal whitespace and trims', () => {
    expect(normalizeBrand('  Nike   Air  ')).toBe('Nike Air');
  });

  it('rejects the real polluted values found in production (P0-1)', () => {
    expect(normalizeBrand('Stussy zip hoodie, S')).toBeNull();
    expect(normalizeBrand('Softshell jacket, M')).toBeNull();
  });

  it('rejects a value ending in a comma + size token even without extra words', () => {
    expect(normalizeBrand('Levis 501, 42')).toBeNull();
  });

  it('rejects an overly long string (listing title, not a brand)', () => {
    expect(normalizeBrand('nike shox tl racer blue metallic silver black blue silver')).toBeNull();
  });

  it('rejects a string with too many words even without a size suffix', () => {
    expect(normalizeBrand('one two three four five six seven')).toBeNull();
  });

  it('returns null for empty, whitespace-only, or missing input', () => {
    expect(normalizeBrand('')).toBeNull();
    expect(normalizeBrand('   ')).toBeNull();
    expect(normalizeBrand(null)).toBeNull();
    expect(normalizeBrand(undefined)).toBeNull();
  });

  it('does not falsely flag a plausible short brand as a size suffix', () => {
    expect(normalizeBrand('LOOK')).toBe('LOOK');
  });
});
