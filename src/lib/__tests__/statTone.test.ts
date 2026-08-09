import { describe, expect, it } from 'vitest';
import { toneForValue } from '../statTone';

// P1-5 (Freeze Audit correctif) : un benefice/marge/ROI negatif ne doit
// jamais s'afficher en vert ("positive").
describe('toneForValue', () => {
  it('returns "positive" for a strictly positive value', () => {
    expect(toneForValue(42)).toBe('positive');
    expect(toneForValue(0.01)).toBe('positive');
  });

  it('returns "negative" for a strictly negative value', () => {
    expect(toneForValue(-1)).toBe('negative');
    expect(toneForValue(-999.5)).toBe('negative');
  });

  it('returns undefined (neutral default) for exactly zero', () => {
    expect(toneForValue(0)).toBeUndefined();
  });
});
