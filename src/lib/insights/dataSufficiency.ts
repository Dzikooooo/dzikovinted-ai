import type { Listing } from '../types';
import type { EngineContext } from './types';
import { FRESH_SYNC_THRESHOLD_HOURS, STALE_SYNC_THRESHOLD_HOURS, MIN_SAMPLE_SIZE_FOR_COMPARISON } from './constants';

export type SyncFreshnessTier = 'fraiche' | 'tendue' | 'perimee';

// Aucune donnee synced_at = jamais synchronisee -- traitee comme perimee,
// jamais comme "fraiche par defaut". Les seuils sont ceux deja utilises cote
// UI (DashboardHome.tsx/ListingsManagementSection.tsx), centralises ici.
export function getSyncFreshnessTier(listing: Pick<Listing, 'synced_at'>, now: Date): SyncFreshnessTier {
  if (!listing.synced_at) return 'perimee';
  const hours = (now.getTime() - new Date(listing.synced_at).getTime()) / 3_600_000;
  if (hours > STALE_SYNC_THRESHOLD_HOURS) return 'perimee';
  if (hours > FRESH_SYNC_THRESHOLD_HOURS) return 'tendue';
  return 'fraiche';
}

// Nombre minimum d'annonces actives (vinted_status='online') sur le compte
// pour qu'une comparaison a la mediane (baisser_prix/revoir_annonce) ait un
// sens -- meme seuil que MIN_SAMPLE_SIZE_FOR_COMPARISON, deja utilise pour
// les moyennes de vente par marque/categorie (context.ts).
export function hasSufficientSample(ctx: Pick<EngineContext, 'listings'>): boolean {
  const activeCount = ctx.listings.filter((l) => l.vinted_status === 'online').length;
  return activeCount >= MIN_SAMPLE_SIZE_FOR_COMPARISON;
}
