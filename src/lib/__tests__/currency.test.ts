import { describe, expect, it } from 'vitest';
import { formatEUR } from '../currency';

describe('formatEUR', () => {
  it('rounds to the nearest integer', () => {
    expect(formatEUR(123.4)).toBe('123 €');
    expect(formatEUR(123.6)).toBe('124 €');
  });

  it('formats a whole number', () => {
    expect(formatEUR(123)).toBe('123 €');
  });

  it('formats zero', () => {
    expect(formatEUR(0)).toBe('0 €');
  });

  it('normalizes negative-zero rounding to "0 €"', () => {
    expect(formatEUR(-0.3)).toBe('0 €');
  });

  it('preserves the sign for a real negative amount', () => {
    expect(formatEUR(-42)).toBe('-42 €');
  });
});
