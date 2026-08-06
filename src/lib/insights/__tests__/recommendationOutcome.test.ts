import { describe, expect, it } from 'vitest';
import { measureRecommendationOutcome } from '../recommendationOutcome';
import type { ListingMetricSnapshot } from '../../types';

const ACTION_AT = '2026-08-01T00:00:00.000Z';

function snap(capturedAt: string, views: number | null, favourites: number | null): ListingMetricSnapshot {
  return { id: `s-${capturedAt}`, listing_id: 'l1', views, favourites, price: 20, vinted_status: 'online', captured_at: capturedAt };
}

function daysAfterAction(n: number): string {
  return new Date(new Date(ACTION_AT).getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

describe('measureRecommendationOutcome', () => {
  it("aucun snapshot avant l'action -> non mesurable sur les deux fenetres", () => {
    const outcome = measureRecommendationOutcome(ACTION_AT, [snap(daysAfterAction(2), 10, 2)], null);
    expect(outcome.windows.every((w) => !w.measurable)).toBe(true);
    expect(outcome.windows.every((w) => w.summary === null)).toBe(true);
  });

  it("aucun snapshot apres l'action dans la fenetre -> non mesurable pour cette fenetre", () => {
    const outcome = measureRecommendationOutcome(ACTION_AT, [snap(daysAfterAction(-1), 5, 1)], null);
    expect(outcome.windows.every((w) => !w.measurable)).toBe(true);
  });

  it('avant/apres presents dans la fenetre de 3 jours -> mesurable avec le wording attendu', () => {
    const snapshots = [snap(daysAfterAction(-1), 5, 1), snap(daysAfterAction(2), 12, 4)];
    const outcome = measureRecommendationOutcome(ACTION_AT, snapshots, null);
    const w3 = outcome.windows.find((w) => w.days === 3);
    expect(w3?.measurable).toBe(true);
    expect(w3?.before).toEqual({ views: 5, favourites: 1 });
    expect(w3?.after).toEqual({ views: 12, favourites: 4 });
    expect(w3?.summary).toBe('Dans les 3 jours suivant cette action, les vues sont passées de 5 à 12 et les favoris de 1 à 4.');
  });

  it("un point hors fenetre (trop tardif) n'est jamais utilise pour une fenetre plus courte", () => {
    // Seul point apres l'action : 10 jours plus tard -- hors fenetre de 3j et 7j.
    const snapshots = [snap(daysAfterAction(-1), 5, 1), snap(daysAfterAction(10), 50, 20)];
    const outcome = measureRecommendationOutcome(ACTION_AT, snapshots, null);
    expect(outcome.windows.every((w) => !w.measurable)).toBe(true);
  });

  it('choisit le point le plus proche de la fin de fenetre parmi plusieurs candidats', () => {
    const snapshots = [snap(daysAfterAction(-1), 5, 1), snap(daysAfterAction(1), 8, 2), snap(daysAfterAction(2.5), 15, 5)];
    const outcome = measureRecommendationOutcome(ACTION_AT, snapshots, null);
    const w3 = outcome.windows.find((w) => w.days === 3);
    expect(w3?.after).toEqual({ views: 15, favourites: 5 });
  });

  it('jamais de causalite affirmee : le wording ne contient que "sont passées de...à..."', () => {
    const snapshots = [snap(daysAfterAction(-1), 5, 1), snap(daysAfterAction(2), 12, 4)];
    const outcome = measureRecommendationOutcome(ACTION_AT, snapshots, null);
    for (const w of outcome.windows) {
      if (w.summary) {
        expect(w.summary).not.toMatch(/génér|caus|grâce à|permis/i);
      }
    }
  });

  it('vente posterieure a l\'action -> soldAfterDays calcule, jamais attribue', () => {
    const outcome = measureRecommendationOutcome(ACTION_AT, [], { soldAt: daysAfterAction(5) });
    expect(outcome.soldAfterDays).toBe(5);
  });

  it("vente anterieure a l'action (incoherente) -> soldAfterDays null, jamais negatif", () => {
    const outcome = measureRecommendationOutcome(ACTION_AT, [], { soldAt: daysAfterAction(-3) });
    expect(outcome.soldAfterDays).toBeNull();
  });

  it('sans vente -> soldAfterDays null', () => {
    const outcome = measureRecommendationOutcome(ACTION_AT, [], null);
    expect(outcome.soldAfterDays).toBeNull();
  });
});
