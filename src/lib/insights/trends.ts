import type { Listing } from '../types';
import type { Alert, EngineContext } from './types';
import { MIN_TREND_INTERVAL_DAYS } from './constants';
import { daysBetween } from './math';

// Signaux fondes sur listing_metric_snapshots (historique reel accumule par
// l'extension a chaque synchro, voir EXTENSION.md). Ne produit RIEN pour une
// annonce tant que l'historique est insuffisant - jamais de tendance
// fabriquee a partir d'un seul instantane. Ces alertes s'activeront
// automatiquement au fil des prochaines synchros, sans changement de code.
function ruleVisibilityDrop(listing: Listing, ctx: EngineContext): Alert | null {
  if (listing.vinted_status !== 'online') return null;
  const snapshots = ctx.snapshotsByListingId.get(listing.id);
  if (!snapshots || snapshots.length < 2) return null;

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  if (daysBetween(first.captured_at, last.captured_at) < MIN_TREND_INTERVAL_DAYS) return null;
  if (first.views === null || last.views === null || first.views === 0) return null;

  const change = (last.views - first.views) / first.views;
  // Une baisse de vues cumulees n'a de sens que si le compteur a
  // effectivement recule entre deux syncros (Vinted ne fait normalement que
  // cumuler les vues, donc un recul reel indique un probleme d'affichage/de
  // visibilite plutot qu'un simple ralentissement).
  if (change >= -0.15) return null;

  return {
    kind: 'visibility_drop',
    severity: 'info',
    scope: 'listing',
    listingId: listing.id,
    vintedAccountId: listing.vinted_account_id,
    message: `"${listing.title}" a perdu en visibilité depuis la dernière synchronisation.`,
  };
}

export function computeTrendAlerts(ctx: EngineContext): Alert[] {
  const alerts: Alert[] = [];
  for (const listing of ctx.listings) {
    const result = ruleVisibilityDrop(listing, ctx);
    if (result) alerts.push(result);
  }
  return alerts;
}
