import type { Listing, ListingMetricSnapshot, VintedAccount } from '../types';
import type { InsightsReport } from './types';
import { buildContext } from './context';
import { computeScores } from './scoring';
import { computeRecommendations } from './recommendations';
import { computeAlerts } from './alerts';
import { computeTrendAlerts } from './trends';
import { computeNarratives } from './narrative';

// Point d'entree unique du moteur : fonction pure, aucun acces reseau/base
// (voir src/hooks/useInsights.ts pour le pont avec Supabase). Prend
// l'ensemble des donnees deja chargees, retourne un rapport structure -
// separation stricte entre donnees et recommandations, exigee explicitement.
export function computeInsights(
  listings: Listing[],
  accounts: VintedAccount[],
  snapshots: ListingMetricSnapshot[]
): InsightsReport {
  const ctx = buildContext(listings, accounts, snapshots);

  const scores = computeScores(ctx);
  const recommendations = computeRecommendations(ctx);
  const alerts = [...computeAlerts(ctx), ...computeTrendAlerts(ctx)];
  const narratives = computeNarratives(ctx);

  return {
    scores,
    recommendations,
    alerts,
    narratives,
    generatedAt: ctx.now.toISOString(),
  };
}
