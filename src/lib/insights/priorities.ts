import type { Alert, EngineContext, PriorityItem, Recommendation } from './types';
import { MAX_PRIORITIES } from './constants';

const SEVERITY_SCORE: Record<Alert['severity'], number> = {
  critical: 90,
  warning: 60,
  info: 30,
};

const RECOMMENDATION_SCORE: Record<Recommendation['kind'], number> = {
  lower_price: 55,
  republish: 50,
  review_price: 40,
  raise_price: 45,
};

// Fusionne alertes + recommandations en une seule liste classee - une
// alerte "warning"/"critical" passe generalement devant une simple
// recommandation, mais le score reste continu (pas de bucket rigide) pour
// que le tri ait du sens meme avec beaucoup d'items de meme categorie.
export function computePriorities(alerts: Alert[], recommendations: Recommendation[], ctx: EngineContext): PriorityItem[] {
  const items: PriorityItem[] = [];

  for (const alert of alerts) {
    // Les signaux positifs (forte demande, ROI exceptionnel, forte
    // rotation...) sont informatifs mais pas "a faire" - ils ne meritent
    // pas une place dans une liste de priorites d'action.
    if (alert.severity === 'info' && !['dormant_stock', 'low_stock'].includes(alert.kind)) continue;
    items.push({ score: SEVERITY_SCORE[alert.severity], message: alert.message, listingId: alert.listingId });
  }

  for (const rec of recommendations) {
    const listing = ctx.listings.find((l) => l.id === rec.listingId);
    const label = listing ? `"${listing.title}" — ${rec.message}` : rec.message;
    items.push({ score: RECOMMENDATION_SCORE[rec.kind], message: label, listingId: rec.listingId });
  }

  items.sort((a, b) => b.score - a.score);
  return items.slice(0, MAX_PRIORITIES);
}
