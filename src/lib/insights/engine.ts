import type { Listing, ListingMetricSnapshot, VintedAccount } from '../types';
import type { InsightsReport, RecentActionSummary } from './types';
import { buildContext } from './context';
import { computeScores } from './scoring';
import { computeRecommendations, computeListingStates } from './recommendations';
import { computeAlerts } from './alerts';
import { computeTrendAlerts } from './trends';
import { computeNarratives } from './narrative';

// Point d'entree unique du moteur : fonction pure, aucun acces reseau/base
// (voir src/hooks/useInsights.ts pour le pont avec Supabase). Prend
// l'ensemble des donnees deja chargees, retourne un rapport structure -
// separation stricte entre donnees et recommandations, exigee explicitement.
// recentActions est optionnel (defaut []) : un appelant qui ne le fournit
// pas encore obtient simplement des garde-fous anti-boucle toujours
// "inactifs" (aucune action recente connue), jamais une erreur.
export function computeInsights(
  listings: Listing[],
  accounts: VintedAccount[],
  snapshots: ListingMetricSnapshot[],
  recentActions: RecentActionSummary[] = []
): InsightsReport {
  const ctx = buildContext(listings, accounts, snapshots, recentActions);

  const scores = computeScores(ctx);
  const recommendations = computeRecommendations(ctx);
  const listingRecommendations = computeListingStates(ctx);
  const alerts = [...computeAlerts(ctx), ...computeTrendAlerts(ctx)];
  const narratives = computeNarratives(ctx);

  return {
    scores,
    recommendations,
    listingRecommendations,
    alerts,
    narratives,
    generatedAt: ctx.now.toISOString(),
  };
}
