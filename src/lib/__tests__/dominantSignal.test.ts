import { describe, expect, it } from 'vitest';
import { computeDominantSignal } from '../dominantSignal';
import type { Alert, Recommendation } from '../insights/types';

const BASE = { alerts: [] as Alert[], recommendations: [] as Recommendation[], newOpportunitiesLast24h: 0, profitMonth: 0 };

const criticalAlert: Alert = { kind: 'inactive_listing', severity: 'critical', scope: 'listing', message: 'critique' };
const warningAlert: Alert = { kind: 'insufficient_margin', severity: 'warning', scope: 'listing', message: 'avertissement' };
const infoAlert: Alert = { kind: 'high_demand', severity: 'info', scope: 'listing', message: 'info' };
const recommendation: Recommendation = { listingId: 'l1', kind: 'lower_price', message: 'recommandation', reason: 'x' };

describe('computeDominantSignal', () => {
  it('tier 1 : une alerte critique domine tout, meme avec opportunites/avertissements/recommandations en attente', () => {
    const result = computeDominantSignal({
      alerts: [warningAlert, criticalAlert],
      recommendations: [recommendation],
      newOpportunitiesLast24h: 5,
      profitMonth: 100,
    });
    expect(result.tier).toBe('critical_alert');
    expect(result.message).toBe('critique');
  });

  it('tier 2 : une opportunite recente domine les avertissements et recommandations', () => {
    const result = computeDominantSignal({
      ...BASE,
      alerts: [warningAlert],
      recommendations: [recommendation],
      newOpportunitiesLast24h: 3,
    });
    expect(result.tier).toBe('opportunity');
    expect(result.actionPage).toBe('opportunities');
  });

  it('tier 3 : une alerte avertissement domine une recommandation, une alerte info est ignoree', () => {
    const result = computeDominantSignal({
      ...BASE,
      alerts: [infoAlert, warningAlert],
      recommendations: [recommendation],
    });
    expect(result.tier).toBe('warning_alert');
    expect(result.message).toBe('avertissement');
  });

  it('tier 4 : une recommandation quand rien de plus urgent n\'existe', () => {
    const result = computeDominantSignal({ ...BASE, recommendations: [recommendation] });
    expect(result.tier).toBe('recommendation');
    expect(result.message).toBe('recommandation');
  });

  it('tier 5 : le benefice du mois en repli quand rien d\'autre ne se qualifie', () => {
    const result = computeDominantSignal({ ...BASE, profitMonth: 42 });
    expect(result.tier).toBe('stat');
    expect(result.message).toContain('42');
    expect(result.actionPage).toBe('stats');
  });

  it('tier 5 : reste deterministe (pas de division par zero ni de NaN) avec un benefice negatif', () => {
    const result = computeDominantSignal({ ...BASE, profitMonth: -15 });
    expect(result.tier).toBe('stat');
    expect(result.message).toContain('-15');
  });

  it('la premiere alerte du meme palier dans l\'ordre du tableau l\'emporte, jamais un second tri', () => {
    const first: Alert = { kind: 'incoherent_price', severity: 'warning', scope: 'listing', message: 'premiere' };
    const second: Alert = { kind: 'insufficient_margin', severity: 'warning', scope: 'listing', message: 'seconde' };
    const result = computeDominantSignal({ ...BASE, alerts: [first, second] });
    expect(result.message).toBe('premiere');
  });
});
