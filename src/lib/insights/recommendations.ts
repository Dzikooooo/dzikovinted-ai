import type { Listing } from '../types';
import type { EngineContext, Recommendation } from './types';
import { REPUBLISH_AFTER_DAYS } from './constants';
import { daysSince } from './math';

// Registre de regles : chaque regle est une fonction pure et independante.
// Ajouter une regle = ajouter une entree au tableau LISTING_RULES, sans
// toucher aux regles existantes - c'est ce qui rend le moteur extensible
// sans devenir une suite de if/else monolithique.
type ListingRule = (listing: Listing, ctx: EngineContext) => Recommendation | null;

function ruleRepublishAging(listing: Listing, ctx: EngineContext): Recommendation | null {
  if (listing.vinted_status !== 'online') return null;
  const age = Math.round(daysSince(listing.created_at, ctx.now));
  if (age < REPUBLISH_AFTER_DAYS) return null;
  return {
    listingId: listing.id,
    kind: 'republish',
    message: 'Republier conseillé',
    reason: `En ligne depuis ${age} jours sans vente.`,
  };
}

function ruleReviewPriceHighViewsLowFavourites(listing: Listing, ctx: EngineContext): Recommendation | null {
  if (listing.vinted_status !== 'online') return null;
  if (listing.views === null || listing.favourites === null) return null;
  if (ctx.activeMedianViews === null || ctx.activeMedianViews === 0) return null;
  const viewsAboveAverage = listing.views >= ctx.activeMedianViews * 1.5;
  const fewFavourites = listing.favourites <= 1;
  if (!viewsAboveAverage || !fewFavourites) return null;
  return {
    listingId: listing.id,
    kind: 'review_price',
    message: 'Revoir le prix',
    reason: `${listing.views} vues mais seulement ${listing.favourites} favori${listing.favourites > 1 ? 's' : ''} — le prix freine peut-être la conversion.`,
  };
}

function ruleLowerPriceStale(listing: Listing, ctx: EngineContext): Recommendation | null {
  if (listing.vinted_status !== 'online') return null;
  const age = daysSince(listing.created_at, ctx.now);
  if (age < REPUBLISH_AFTER_DAYS) return null;
  if (listing.views === null || listing.favourites === null) return null;
  if (ctx.activeMedianViews === null || ctx.activeMedianFavourites === null) return null;
  const lowEngagement =
    listing.views <= ctx.activeMedianViews * 0.5 && listing.favourites <= ctx.activeMedianFavourites * 0.5;
  if (!lowEngagement) return null;
  return {
    listingId: listing.id,
    kind: 'lower_price',
    message: 'Baisse de prix conseillée',
    reason: `Peu de vues et de favoris après ${Math.round(age)} jours en ligne — le prix semble au-dessus du marché.`,
  };
}

function ruleRaisePriceUndervalued(listing: Listing, ctx: EngineContext): Recommendation | null {
  if (listing.vinted_status !== 'online') return null;
  if (listing.views === null || listing.favourites === null) return null;
  if (ctx.activeMedianViews === null || ctx.activeMedianFavourites === null) return null;
  if (ctx.activeMedianViews === 0 || ctx.activeMedianFavourites === 0) return null;
  const strongDemand =
    listing.views >= ctx.activeMedianViews * 2 && listing.favourites >= ctx.activeMedianFavourites * 2;
  if (!strongDemand) return null;
  return {
    listingId: listing.id,
    kind: 'raise_price',
    message: 'Prix augmentable sans risque',
    reason: `${listing.views} vues et ${listing.favourites} favoris, nettement au-dessus de la moyenne — cette annonce est probablement sous-évaluée.`,
  };
}

const LISTING_RULES: ListingRule[] = [
  ruleRepublishAging,
  ruleReviewPriceHighViewsLowFavourites,
  ruleLowerPriceStale,
  ruleRaisePriceUndervalued,
];

// Une seule recommandation par annonce (la premiere regle qui matche) :
// eviter d'empiler des conseils contradictoires (ex. "baisser le prix" et
// "republier" en meme temps) sur la meme carte.
export function computeRecommendations(ctx: EngineContext): Recommendation[] {
  const recommendations: Recommendation[] = [];
  for (const listing of ctx.listings) {
    for (const rule of LISTING_RULES) {
      const result = rule(listing, ctx);
      if (result) {
        recommendations.push(result);
        break;
      }
    }
  }
  return recommendations;
}
