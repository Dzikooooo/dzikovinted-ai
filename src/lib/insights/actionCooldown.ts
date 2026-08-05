import type { EngineContext } from './types';
import { daysBetween } from './math';
import { ACTION_RETRY_COOLDOWN_DAYS, PRICE_CHANGE_COOLDOWN_DAYS } from './constants';

// Garde-fous anti-boucle (Lot 1, point 6 de la validation utilisateur) : une
// regle dont la condition matche mais dont l'action correspondante vient
// deja d'etre tentee recemment ne doit jamais re-suggerer la meme chose --
// elle bascule sur l'etat 'recommandation_differee' (voir recommendations.ts)
// plutot que de rester silencieuse (attendre) ou de re-notifier en boucle.

export function hasRecentRepublishAttempt(listingId: string, ctx: Pick<EngineContext, 'actionsByListingId' | 'now'>): boolean {
  const actions = ctx.actionsByListingId.get(listingId) ?? [];
  return actions.some(
    (a) =>
      (a.kind === 'publish_listing' || a.kind === 'republish_listing') &&
      daysBetween(a.completedAt, ctx.now.toISOString()) < ACTION_RETRY_COOLDOWN_DAYS
  );
}

export function hasRecentPriceChange(listingId: string, ctx: Pick<EngineContext, 'actionsByListingId' | 'now'>): boolean {
  const actions = ctx.actionsByListingId.get(listingId) ?? [];
  return actions.some(
    (a) =>
      a.kind === 'edit_listing' &&
      !!a.changedFields?.includes('price') &&
      daysBetween(a.completedAt, ctx.now.toISOString()) < PRICE_CHANGE_COOLDOWN_DAYS
  );
}
