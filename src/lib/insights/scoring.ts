import type { EngineContext, ListingScore, ScoreBreakdownEntry } from './types';
import { AGING_STOCK_DAYS } from './constants';
import { daysSince, normalizeKey } from './math';

// Score additif et transparent (meme principe que scripts/opportunity-engine/,
// utilise pour les opportunites) : base neutre 50, chaque signal
// ajoute/retire des points nommes et justifies, jamais de penalite/bonus
// fabrique sur une donnee inconnue (ex. pas de malus "ROI faible" si le prix
// d'achat n'est pas saisi - l'absence de signal n'est pas un signal negatif).
export function computeScores(ctx: EngineContext): Map<string, ListingScore> {
  const scores = new Map<string, ListingScore>();

  for (const listing of ctx.listings) {
    const breakdown: ScoreBreakdownEntry[] = [];
    let score = 50;
    const add = (label: string, delta: number) => {
      if (delta === 0) return;
      score += delta;
      breakdown.push({ label, delta });
    };

    if (listing.views !== null && ctx.activeMedianViews !== null && ctx.activeMedianViews > 0) {
      const ratio = listing.views / ctx.activeMedianViews;
      if (ratio >= 2) add('Vues nettement au-dessus de la moyenne', 10);
      else if (ratio >= 1.2) add('Vues au-dessus de la moyenne', 5);
      else if (ratio <= 0.3) add('Vues nettement en dessous de la moyenne', -10);
    }

    if (listing.favourites !== null && ctx.activeMedianFavourites !== null && ctx.activeMedianFavourites > 0) {
      const ratio = listing.favourites / ctx.activeMedianFavourites;
      if (ratio >= 2) add('Favoris nettement au-dessus de la moyenne', 10);
      else if (ratio >= 1.2) add('Favoris au-dessus de la moyenne', 5);
      else if (ratio <= 0.3) add('Favoris nettement en dessous de la moyenne', -10);
    }

    if (listing.vinted_status === 'online') {
      const age = daysSince(listing.created_at, ctx.now);
      if (age > AGING_STOCK_DAYS * 2) add('En ligne depuis très longtemps', -15);
      else if (age > AGING_STOCK_DAYS) add('En ligne depuis longtemps', -8);
    }

    if (listing.purchase_price !== null) {
      const referencePrice = listing.status === 'vendu' ? listing.sold_price : listing.price;
      if (referencePrice !== null) {
        const profit = Number(referencePrice) - Number(listing.purchase_price) - Number(listing.fees || 0);
        const roi = Number(listing.purchase_price) > 0 ? (profit / Number(listing.purchase_price)) * 100 : 0;
        if (roi >= 150) add('ROI exceptionnel', 20);
        else if (roi >= 80) add('Bon ROI', 12);
        else if (roi >= 30) add('ROI correct', 5);
        else if (roi < 0) add('ROI négatif', -15);
      }
    }

    const brandKey = normalizeKey(listing.brand);
    const brandStats = brandKey ? ctx.byBrand.get(brandKey) : undefined;
    if (brandStats?.avgRoi !== null && brandStats?.avgRoi !== undefined && ctx.overall.avgRoi !== null) {
      if (brandStats.avgRoi > ctx.overall.avgRoi * 1.3) add('Marque performante sur ce compte', 8);
      else if (brandStats.avgRoi < ctx.overall.avgRoi * 0.7) add('Marque peu performante sur ce compte', -5);
    }

    const categoryKey = normalizeKey(listing.category);
    const categoryStats = categoryKey ? ctx.byCategory.get(categoryKey) : undefined;
    if (categoryStats?.avgRoi !== null && categoryStats?.avgRoi !== undefined && ctx.overall.avgRoi !== null) {
      if (categoryStats.avgRoi > ctx.overall.avgRoi * 1.3) add('Catégorie performante sur ce compte', 8);
      else if (categoryStats.avgRoi < ctx.overall.avgRoi * 0.7) add('Catégorie peu performante sur ce compte', -5);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    scores.set(listing.id, { listingId: listing.id, score, breakdown });
  }

  return scores;
}
