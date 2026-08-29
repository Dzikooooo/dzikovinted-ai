import type { Listing } from './types';

// Un article `reserved`/`sold_pending` cote Vinted n'est plus reellement
// disponible a la vente meme si son `status` ResellOS interne reste
// `en_stock` (deriveResellOsStatus ne bascule sur `vendu` qu'a
// `sold_completed`, voir extension/src/background/sync.ts) -- les KPI
// "stock actif" doivent l'exclure, contrairement a la liste/aux badges
// par article qui doivent continuer a l'afficher.
const NOT_ACTIVELY_IN_STOCK: ReadonlySet<string> = new Set(['reserved', 'sold_pending']);

// 'en_attente' (2026-08-30) : annonce encore en construction depuis le
// Generateur, jamais publiee -- ne represente aucun stock reel tant qu'elle
// n'a pas ete finalisee/publiee (voir GeneratorPage.tsx), exclue des memes
// KPI que 'vendu' (valeur du stock, articles en ligne...).
export function isActivelyInStock(item: Listing): boolean {
  return item.status !== 'vendu' && item.status !== 'en_attente' && !NOT_ACTIVELY_IN_STOCK.has(item.vinted_status ?? '');
}

// Annonces jamais publiees ou plus visibles sur Vinted, mais toujours en
// stock cote ResellOS -- alimente UNIQUEMENT l'onglet "Republication"
// (filtre de decouverte dans ListingsManagementSection.tsx), plus le check
// d'eligibilite reel du bouton "Republier" (checks.ts::
// checkListingRepublishEligible, plus large depuis Republication V2,
// 2026-08-10 : autorise aussi une annonce genuinement en ligne -- voir son
// commentaire). Les deux criteres ont volontairement divergé : "l'onglet
// Republication te montre les annonces qui ont un probleme structurel" reste
// un critere different de "peux-tu cliquer Republier sur cette annonce".
const NEEDS_REPUBLISH_VINTED_STATUSES: ReadonlySet<string> = new Set(['hidden', 'deleted', 'draft', 'unknown']);

export function needsRepublish(item: Listing): boolean {
  if (item.status !== 'en_stock') return false;
  if (!item.vinted_item_id) return true;
  return NEEDS_REPUBLISH_VINTED_STATUSES.has(item.vinted_status ?? '');
}
