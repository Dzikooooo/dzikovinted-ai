import type { Listing } from './types';

// Un article `reserved`/`sold_pending` cote Vinted n'est plus reellement
// disponible a la vente meme si son `status` ResellOS interne reste
// `en_stock` (deriveResellOsStatus ne bascule sur `vendu` qu'a
// `sold_completed`, voir extension/src/background/sync.ts) -- les KPI
// "stock actif" doivent l'exclure, contrairement a la liste/aux badges
// par article qui doivent continuer a l'afficher.
const NOT_ACTIVELY_IN_STOCK: ReadonlySet<string> = new Set(['reserved', 'sold_pending']);

export function isActivelyInStock(item: Listing): boolean {
  return item.status !== 'vendu' && !NOT_ACTIVELY_IN_STOCK.has(item.vinted_status ?? '');
}

// Annonces jamais publiees ou plus visibles sur Vinted, mais toujours en
// stock cote ResellOS -- meme logique d'eligibilite que le bouton "Republier"
// (ListingsManagementSection.tsx) et que le check d'action correspondant
// (checks.ts::checkListingNeedsRepublish). Partagee ici (deplacee depuis
// ListingsManagementSection.tsx le 2026-08-01) pour que l'onglet
// Republication et le check business ne divergent jamais.
const NEEDS_REPUBLISH_VINTED_STATUSES: ReadonlySet<string> = new Set(['hidden', 'deleted', 'draft', 'unknown']);

export function needsRepublish(item: Listing): boolean {
  if (item.status !== 'en_stock') return false;
  if (!item.vinted_item_id) return true;
  return NEEDS_REPUBLISH_VINTED_STATUSES.has(item.vinted_status ?? '');
}
