import { describe, expect, it } from 'vitest';
import { computeVerdict } from '../opportunityVerdict';

describe('computeVerdict', () => {
  it('returns "trop_risque" whenever risk is "eleve", regardless of score/confidence', () => {
    expect(computeVerdict(100, 100, 'eleve')).toBe('trop_risque');
    expect(computeVerdict(0, 0, 'eleve')).toBe('trop_risque');
  });

  it('returns "a_surveiller" when score is below the opportunity gate (65)', () => {
    expect(computeVerdict(64, 100, 'faible')).toBe('a_surveiller');
  });

  it('returns "a_surveiller" when confidence is below the opportunity gate (50)', () => {
    expect(computeVerdict(100, 49, 'faible')).toBe('a_surveiller');
  });

  it('returns "recommande" once the gate is cleared but the excellent bar is not met', () => {
    expect(computeVerdict(65, 50, 'faible')).toBe('recommande');
    expect(computeVerdict(84, 70, 'faible')).toBe('recommande');
    expect(computeVerdict(85, 69, 'faible')).toBe('recommande');
    expect(computeVerdict(85, 70, 'modere')).toBe('recommande');
  });

  it('returns "excellent" only when score>=85, confidence>=70 and risk is "faible"', () => {
    expect(computeVerdict(85, 70, 'faible')).toBe('excellent');
    expect(computeVerdict(100, 100, 'faible')).toBe('excellent');
  });

  it('treats null risk level as not "eleve" and not "faible" (never excellent, never trop_risque by itself)', () => {
    expect(computeVerdict(90, 90, null)).toBe('recommande');
    expect(computeVerdict(40, 40, null)).toBe('a_surveiller');
  });
});
