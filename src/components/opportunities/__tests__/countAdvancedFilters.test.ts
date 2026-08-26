import { describe, expect, it } from 'vitest';
import { countAdvancedFilters } from '../OpportunityFilterPanel';
import type { OpportunityFilters } from '../../../lib/types';

// Ce compteur est ce qui empeche le repliement du panneau de mentir : replie,
// il est le SEUL indice qu'un filtre restreint encore la grille. S'il se
// trompe, une grille vide devient inexplicable.

const EMPTY: OpportunityFilters = {
  category: 'all',
  brands: [],
  minScore: null,
  minConfidence: null,
  minRoi: null,
  minProfit: null,
  maxBudget: null,
  maxResaleDays: null,
  riskLevels: [],
  verdicts: [],
};

describe('countAdvancedFilters', () => {
  it('ne compte rien quand aucun filtre avance n\'est pose', () => {
    expect(countAdvancedFilters(EMPTY)).toBe(0);
  });

  it('ignore la categorie et compte 0 : elle a son propre controle, toujours visible', () => {
    expect(countAdvancedFilters({ ...EMPTY, category: 'Sneakers' })).toBe(0);
  });

  it('compte un seuil numerique pose', () => {
    expect(countAdvancedFilters({ ...EMPTY, minScore: 70 })).toBe(1);
  });

  it('compte un seuil a 0 -- c\'est un filtre pose, pas une absence', () => {
    expect(countAdvancedFilters({ ...EMPTY, minRoi: 0 })).toBe(1);
  });

  it('compte chaque marque, verdict et niveau de risque selectionne', () => {
    expect(
      countAdvancedFilters({
        ...EMPTY,
        brands: ['Nike', 'Carhartt'],
        verdicts: ['excellent'],
        riskLevels: ['faible', 'modere'],
      })
    ).toBe(5);
  });

  it('additionne seuils et selections', () => {
    expect(
      countAdvancedFilters({
        ...EMPTY,
        minScore: 70,
        minConfidence: 50,
        minRoi: 30,
        minProfit: 10,
        maxBudget: 100,
        maxResaleDays: 21,
        brands: ['Nike'],
        verdicts: ['excellent'],
        riskLevels: ['faible'],
      })
    ).toBe(9);
  });
});
