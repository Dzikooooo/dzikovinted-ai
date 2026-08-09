import { describe, expect, it } from 'vitest';
import { isDuplicateFeeRiskCategory } from '../feeDuplicateRisk';

describe('isDuplicateFeeRiskCategory', () => {
  it('flags the "Frais Vinted" expense category', () => {
    expect(isDuplicateFeeRiskCategory('Frais Vinted')).toBe(true);
  });

  it('does not flag other expense categories', () => {
    expect(isDuplicateFeeRiskCategory('Emballage')).toBe(false);
    expect(isDuplicateFeeRiskCategory('Frais de port')).toBe(false);
    expect(isDuplicateFeeRiskCategory('Autre')).toBe(false);
  });

  it('is case-sensitive (matches the exact EXPENSE_CATEGORIES label)', () => {
    expect(isDuplicateFeeRiskCategory('frais vinted')).toBe(false);
  });
});
