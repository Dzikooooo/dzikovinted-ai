import { describe, expect, it } from 'vitest';
import {
  computeUrssafDeclaration,
  MICRO_BIC_ALLOWANCE,
  URSSAF_BIC_RATE,
} from '../urssafDeclaration';

// Ces chiffres finissent dans une declaration fiscale. Les tests verrouillent
// donc surtout les taux eux-memes : une derive silencieuse de 12,3 % ou de
// 71 % serait invisible a l'ecran et fausse pour de vrai.

describe('taux reglementaires', () => {
  it('cotisations sociales BIC achat/revente : 12,3 %', () => {
    expect(URSSAF_BIC_RATE).toBe(0.123);
  });

  it('abattement forfaitaire micro-BIC vente de marchandises : 71 %', () => {
    expect(MICRO_BIC_ALLOWANCE).toBe(0.71);
  });
});

describe('computeUrssafDeclaration', () => {
  it('declare le CA brut tel quel, sans rien en retrancher', () => {
    // Le montant a reporter dans la case URSSAF est le CA, pas le benefice :
    // deduire les depenses ici sous-declarerait.
    expect(computeUrssafDeclaration(1000).declarableRevenue).toBe(1000);
  });

  it('calcule les cotisations sur le CA', () => {
    expect(computeUrssafDeclaration(1000).socialContributions).toBeCloseTo(123, 10);
  });

  it("applique l'abattement de 71 % pour le revenu imposable", () => {
    expect(computeUrssafDeclaration(1000).taxableIncome).toBeCloseTo(290, 10);
  });

  it('ramene un CA negatif a zero plutot que de produire une declaration negative', () => {
    expect(computeUrssafDeclaration(-500)).toEqual({
      declarableRevenue: 0,
      socialContributions: 0,
      taxableIncome: 0,
    });
  });

  it('ne laisse jamais passer NaN ou Infinity jusqu\'a l\'ecran', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(computeUrssafDeclaration(bad)).toEqual({
        declarableRevenue: 0,
        socialContributions: 0,
        taxableIncome: 0,
      });
    }
  });

  it('rend zero partout sur une periode sans vente', () => {
    expect(computeUrssafDeclaration(0)).toEqual({
      declarableRevenue: 0,
      socialContributions: 0,
      taxableIncome: 0,
    });
  });

  it('reste proportionnel : doubler le CA double chaque montant', () => {
    const un = computeUrssafDeclaration(750);
    const deux = computeUrssafDeclaration(1500);
    expect(deux.socialContributions).toBeCloseTo(un.socialContributions * 2, 10);
    expect(deux.taxableIncome).toBeCloseTo(un.taxableIncome * 2, 10);
  });
});
