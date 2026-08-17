import { describe, expect, it } from 'vitest';
import { parseMaterials } from '../materials';

describe('parseMaterials', () => {
  it('returns an empty array for null/undefined/empty/whitespace-only input', () => {
    expect(parseMaterials(null)).toEqual([]);
    expect(parseMaterials(undefined)).toEqual([]);
    expect(parseMaterials('')).toEqual([]);
    expect(parseMaterials('   ')).toEqual([]);
  });

  it('wraps a single material with no separator into a one-element array (existing scalar behavior, unchanged)', () => {
    expect(parseMaterials('Coton')).toEqual(['Coton']);
  });

  it('splits on a comma', () => {
    expect(parseMaterials('Coton, Polyester')).toEqual(['Coton', 'Polyester']);
  });

  it('splits on a semicolon', () => {
    expect(parseMaterials('Coton; Polyester')).toEqual(['Coton', 'Polyester']);
  });

  it('splits on a slash', () => {
    expect(parseMaterials('Coton/Polyester')).toEqual(['Coton', 'Polyester']);
  });

  it('splits on " et " (French conjunction, spaces required so it never mangles a real word)', () => {
    expect(parseMaterials('Coton et Polyester')).toEqual(['Coton', 'Polyester']);
  });

  it('splits on " & " and " + "', () => {
    expect(parseMaterials('Coton & Polyester')).toEqual(['Coton', 'Polyester']);
    expect(parseMaterials('Coton + Polyester')).toEqual(['Coton', 'Polyester']);
  });

  it('handles three or more materials', () => {
    expect(parseMaterials('Coton, Laine et Cachemire')).toEqual(['Coton', 'Laine', 'Cachemire']);
  });

  it('trims surrounding whitespace on each part', () => {
    expect(parseMaterials('  Coton ,  Polyester  ')).toEqual(['Coton', 'Polyester']);
  });

  it('drops empty parts produced by trailing/duplicate separators rather than inventing a blank material', () => {
    expect(parseMaterials('Coton, , Polyester')).toEqual(['Coton', 'Polyester']);
    expect(parseMaterials('Coton,')).toEqual(['Coton']);
  });

  it('deduplicates case-insensitively while preserving first-seen casing and order', () => {
    expect(parseMaterials('Coton, coton, COTON')).toEqual(['Coton']);
    expect(parseMaterials('Coton, Polyester, coton')).toEqual(['Coton', 'Polyester']);
  });

  it('never invents a second material from a mixed-fabric percentage description -- splits it into its real components, nothing more', () => {
    // Cas reel plausible sur une etiquette vetement -- pas une simple liste,
    // mais parseMaterials() ne fait qu'une segmentation textuelle : le
    // matching cote extension (matchMaterialOption, prefixe normalise) est
    // responsable de determiner si "70% coton" correspond fiablement a
    // "Coton" sur Vinted, pas cette fonction.
    expect(parseMaterials('70% coton, 30% polyester')).toEqual(['70% coton', '30% polyester']);
  });

  it('keeps accented material names intact', () => {
    expect(parseMaterials('Cachemire, Élasthanne')).toEqual(['Cachemire', 'Élasthanne']);
  });
});
