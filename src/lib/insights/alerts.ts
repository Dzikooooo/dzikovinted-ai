import type { Listing } from '../types';
import type { Alert, EngineContext } from './types';
import { AGING_STOCK_DAYS, LOW_MARGIN_THRESHOLD_EUR, REPUBLISH_AFTER_DAYS } from './constants';
import { daysSince, normalizeKey } from './math';

// Meme principe de registre que recommendations.ts : chaque regle est une
// fonction pure independante, ajouter une regle n'affecte jamais les autres.
type ListingAlertRule = (listing: Listing, ctx: EngineContext) => Alert | null;
type GlobalAlertRule = (ctx: EngineContext) => Alert[];

function ruleInactiveListing(listing: Listing, ctx: EngineContext): Alert | null {
  if (listing.vinted_status !== 'online') return null;
  const age = daysSince(listing.created_at, ctx.now);
  if (age < REPUBLISH_AFTER_DAYS * 2) return null;
  const noEngagement = (listing.views ?? 0) === 0 && (listing.favourites ?? 0) === 0;
  if (!noEngagement) return null;
  return {
    kind: 'inactive_listing',
    severity: 'warning',
    scope: 'listing',
    listingId: listing.id,
    vintedAccountId: listing.vinted_account_id,
    message: `"${listing.title}" est en ligne depuis ${Math.round(age)} jours sans aucune vue.`,
  };
}

function ruleLowVisibility(listing: Listing, ctx: EngineContext): Alert | null {
  if (listing.vinted_status !== 'online') return null;
  if (listing.views === null || ctx.activeMedianViews === null || ctx.activeMedianViews === 0) return null;
  const age = daysSince(listing.created_at, ctx.now);
  if (age < AGING_STOCK_DAYS) return null;
  if (listing.views > ctx.activeMedianViews * 0.4) return null;
  return {
    kind: 'low_visibility',
    severity: 'info',
    scope: 'listing',
    listingId: listing.id,
    vintedAccountId: listing.vinted_account_id,
    message: `"${listing.title}" reçoit nettement moins de vues que tes autres annonces actives.`,
  };
}

function ruleHighDemand(listing: Listing, ctx: EngineContext): Alert | null {
  if (listing.vinted_status !== 'online') return null;
  if (listing.views === null || listing.favourites === null) return null;
  if (ctx.activeMedianViews === null || ctx.activeMedianFavourites === null) return null;
  if (ctx.activeMedianViews === 0 || ctx.activeMedianFavourites === 0) return null;
  const strong = listing.views >= ctx.activeMedianViews * 2.5 && listing.favourites >= ctx.activeMedianFavourites * 2.5;
  if (!strong) return null;
  return {
    kind: 'high_demand',
    severity: 'info',
    scope: 'listing',
    listingId: listing.id,
    vintedAccountId: listing.vinted_account_id,
    message: `"${listing.title}" suscite une forte demande (${listing.views} vues, ${listing.favourites} favoris).`,
  };
}

function ruleIncoherentPrice(listing: Listing, ctx: EngineContext): Alert | null {
  if (listing.vinted_status !== 'online' || listing.price === null) return null;
  const categoryKey = normalizeKey(listing.category);
  const stats = categoryKey ? ctx.byCategory.get(categoryKey) : undefined;
  if (!stats?.avgSoldPrice) return null;
  const deviation = (listing.price - stats.avgSoldPrice) / stats.avgSoldPrice;
  if (Math.abs(deviation) < 0.6) return null;
  return {
    kind: 'incoherent_price',
    severity: 'warning',
    scope: 'listing',
    listingId: listing.id,
    vintedAccountId: listing.vinted_account_id,
    message:
      deviation > 0
        ? `"${listing.title}" est affiché bien au-dessus du prix de vente moyen constaté sur cette catégorie (${Math.round(stats.avgSoldPrice)} €).`
        : `"${listing.title}" est affiché bien en dessous du prix de vente moyen constaté sur cette catégorie (${Math.round(stats.avgSoldPrice)} €).`,
  };
}

function ruleExceptionalRoi(listing: Listing): Alert | null {
  if (listing.status !== 'vendu' || listing.purchase_price === null || listing.sold_price === null) return null;
  const profit = Number(listing.sold_price) - Number(listing.purchase_price) - Number(listing.fees || 0);
  const roi = Number(listing.purchase_price) > 0 ? (profit / Number(listing.purchase_price)) * 100 : 0;
  if (roi < 150) return null;
  return {
    kind: 'exceptional_roi',
    severity: 'info',
    scope: 'listing',
    listingId: listing.id,
    vintedAccountId: listing.vinted_account_id,
    message: `"${listing.title}" vendu avec un ROI de ${Math.round(roi)} %.`,
  };
}

function ruleInsufficientMargin(listing: Listing): Alert | null {
  if (listing.purchase_price === null) return null;
  const referencePrice = listing.status === 'vendu' ? listing.sold_price : listing.price;
  if (referencePrice === null) return null;
  const margin = Number(referencePrice) - Number(listing.purchase_price) - Number(listing.fees || 0);
  if (margin >= LOW_MARGIN_THRESHOLD_EUR) return null;
  return {
    kind: 'insufficient_margin',
    severity: 'warning',
    scope: 'listing',
    listingId: listing.id,
    vintedAccountId: listing.vinted_account_id,
    message: `"${listing.title}" a une marge ${listing.status === 'vendu' ? 'réalisée' : 'potentielle'} de seulement ${margin.toFixed(2)} €.`,
  };
}

const LISTING_ALERT_RULES: ListingAlertRule[] = [
  ruleInactiveListing,
  ruleLowVisibility,
  ruleHighDemand,
  ruleIncoherentPrice,
  ruleExceptionalRoi,
  ruleInsufficientMargin,
];

function ruleDormantStock(ctx: EngineContext): Alert[] {
  const dormant = ctx.listings.filter((l) => {
    if (l.vinted_status !== 'online') return false;
    const age = daysSince(l.created_at, ctx.now);
    return age >= REPUBLISH_AFTER_DAYS * 2 && (l.views ?? 0) === 0 && (l.favourites ?? 0) === 0;
  });
  if (dormant.length < 3) return [];
  return [
    {
      kind: 'dormant_stock',
      severity: 'warning',
      scope: 'global',
      message: `${dormant.length} annonces sont en ligne depuis plus de ${REPUBLISH_AFTER_DAYS * 2} jours sans aucune vue.`,
    },
  ];
}

function ruleLowStock(ctx: EngineContext): Alert[] {
  const online = ctx.listings.filter((l) => l.vinted_status === 'online').length;
  if (online === 0 || online >= 5) return [];
  return [
    {
      kind: 'low_stock',
      severity: 'info',
      scope: 'global',
      message: `Seulement ${online} annonce${online > 1 ? 's' : ''} en ligne actuellement.`,
    },
  ];
}

function ruleHighRotation(ctx: EngineContext): Alert[] {
  if (ctx.overall.avgDaysToSell === null || ctx.overall.avgDaysToSell >= 14) return [];
  return [
    {
      kind: 'high_rotation',
      severity: 'info',
      scope: 'global',
      message: `Forte rotation : tes articles se vendent en ${Math.round(ctx.overall.avgDaysToSell)} jours en moyenne.`,
    },
  ];
}

function ruleRepublishOpportunity(ctx: EngineContext): Alert[] {
  const candidates = ctx.listings.filter((l) => {
    if (l.vinted_status !== 'online') return false;
    return daysSince(l.created_at, ctx.now) >= REPUBLISH_AFTER_DAYS;
  });
  if (candidates.length === 0) return [];
  return [
    {
      kind: 'republish_opportunity',
      severity: 'info',
      scope: 'global',
      message: `${candidates.length} annonce${candidates.length > 1 ? 's sont candidates' : ' est candidate'} à la republication.`,
    },
  ];
}

const GLOBAL_ALERT_RULES: GlobalAlertRule[] = [ruleDormantStock, ruleLowStock, ruleHighRotation, ruleRepublishOpportunity];

export function computeAlerts(ctx: EngineContext): Alert[] {
  const listingAlerts: Alert[] = [];
  for (const listing of ctx.listings) {
    for (const rule of LISTING_ALERT_RULES) {
      const result = rule(listing, ctx);
      if (result) listingAlerts.push(result);
    }
  }
  const globalAlerts = GLOBAL_ALERT_RULES.flatMap((rule) => rule(ctx));
  return [...listingAlerts, ...globalAlerts];
}
