import { describe, expect, it } from 'vitest';
import {
  ANNUAL_DISCOUNT_RATE,
  annualMonthlyPrice,
  annualSaving,
  annualTotalPrice,
  formatPrice,
} from '../billingInterval';
import { PLANS, PURCHASABLE_PLANS } from '../plans';

// Ces chiffres sont affiches a un client avant qu'il n'engage douze mois.
// Une erreur ici ne casse rien visiblement -- elle facture juste le mauvais
// montant, ou annonce une economie qui n'existe pas.

describe('remise annuelle', () => {
  it('est de 20 %', () => {
    expect(ANNUAL_DISCOUNT_RATE).toBe(0.2);
  });

  it('donne les prix mensuels equivalents annonces sur la grille', () => {
    expect(annualMonthlyPrice(24.99)).toBe(19.99);
    expect(annualMonthlyPrice(39.99)).toBe(31.99);
  });

  it('arrondit au centime, jamais de 19.992000000000001 a l\'ecran', () => {
    // On verifie la CHAINE affichee, pas une propriete arithmetique du
    // nombre : 19.99 * 100 vaut 1998.9999... en virgule flottante, un test
    // sur le modulo mesurerait l'artefact IEEE754, pas le prix.
    expect(String(annualMonthlyPrice(24.99))).toBe('19.99');
    expect(formatPrice(annualMonthlyPrice(24.99))).toBe('19,99');
  });

  it('facture douze fois le mensuel equivalent, pas autre chose', () => {
    expect(annualTotalPrice(24.99)).toBe(239.88);
    expect(annualTotalPrice(39.99)).toBe(383.88);
    expect(annualTotalPrice(24.99)).toBe(annualMonthlyPrice(24.99) * 12);
  });

  it('calcule une economie exacte face a douze mensualites', () => {
    expect(annualSaving(24.99)).toBe(60);
    expect(annualSaving(39.99)).toBe(96);
  });

  it('rend zero partout sur un plan gratuit', () => {
    expect(annualMonthlyPrice(0)).toBe(0);
    expect(annualTotalPrice(0)).toBe(0);
    expect(annualSaving(0)).toBe(0);
  });

  it("l'economie reelle DEPASSE les \"2 mois offerts\" annoncés, jamais l'inverse", () => {
    // -20 % vaut 2,4 mois, pas 2. Le badge sous-estime donc la remise --
    // acceptable (on donne plus que promis), l'inverse ne le serait pas.
    // Ce test verrouille le sens de l'ecart.
    for (const monthly of [24.99, 39.99]) {
      expect(annualSaving(monthly)).toBeGreaterThanOrEqual(monthly * 2);
    }
  });
});

describe('formatPrice', () => {
  it('affiche deux decimales avec la virgule francaise', () => {
    expect(formatPrice(19.99)).toBe('19,99');
    expect(formatPrice(239.88)).toBe('239,88');
  });

  it("garde les decimales d'un montant rond -- un prix d'abonnement n'est pas arrondi a l'euro", () => {
    // Volontairement PAS formatEUR() de lib/currency.ts, qui rendrait "60 €".
    expect(formatPrice(60)).toBe('60,00');
  });
});

describe('grille d\'achat', () => {
  it('ne propose plus le plan Free a l\'achat', () => {
    expect(PURCHASABLE_PLANS.map((p) => p.id)).toEqual(['pro', 'team']);
  });

  it('expose des prix annuels derives du mensuel, jamais saisis en dur', () => {
    for (const plan of PURCHASABLE_PLANS) {
      expect(plan.priceAnnualMonthlyDisplay).toBe(formatPrice(annualMonthlyPrice(plan.priceMonthly)));
      expect(plan.priceAnnualTotalDisplay).toBe(formatPrice(annualTotalPrice(plan.priceMonthly)));
      expect(plan.annualSavingDisplay).toBe(formatPrice(annualSaving(plan.priceMonthly)));
    }
  });

  it('differencie reellement Team de Pro sur le volume de recherches', () => {
    // Avant le 2026-08-26, Pro et Team avaient des limites identiques : Team
    // facturait 15 € de plus pour strictement rien.
    expect(PLANS.pro.watchlistLimit).toBe(5);
    expect(PLANS.team.watchlistLimit).toBe(25);
    expect(PLANS.team.watchlistLimit!).toBeGreaterThan(PLANS.pro.watchlistLimit!);
  });

  it('annonce le nombre de recherches dans les features des deux plans payants', () => {
    expect(PLANS.pro.features.some((f) => f.includes('5 recherches'))).toBe(true);
    expect(PLANS.team.features.some((f) => f.includes('25 recherches'))).toBe(true);
  });

  it('garde Free decrit ailleurs -- il existe toujours comme plan courant', () => {
    expect(PLANS.free.id).toBe('free');
    expect(PLANS.free.priceMonthly).toBe(0);
  });
});
