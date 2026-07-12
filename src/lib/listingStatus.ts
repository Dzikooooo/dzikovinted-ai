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
