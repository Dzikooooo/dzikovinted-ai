import type { Listing, ListingMetricSnapshot, VintedAccount } from '../types';
import type { EngineContext, GroupStats } from './types';
import { MIN_SAMPLE_SIZE_FOR_COMPARISON } from './constants';
import { daysBetween, median, normalizeKey } from './math';

// Ne calcule une moyenne que sur des ventes reelles et completement connues
// (vendu, prix d'achat saisi) : jamais de moyenne polluee par une inconnue
// traitee comme zero (voir StockPage.tsx pour la meme regle sur les
// agregats de marge/ROI). En dessous de MIN_SAMPLE_SIZE_FOR_COMPARISON,
// l'echantillon est juge trop faible pour etre une reference fiable :
// avgRoi/avgDaysToSell restent null plutot que de fabriquer une moyenne sur
// une ou deux ventes.
function computeGroupStats(soldItems: Listing[]): GroupStats {
  const withCost = soldItems.filter((l) => l.purchase_price !== null && l.sold_price !== null);
  const reliable = withCost.length >= MIN_SAMPLE_SIZE_FOR_COMPARISON;

  const avgRoi = reliable
    ? withCost.reduce((sum, l) => {
        const profit = Number(l.sold_price) - Number(l.purchase_price) - Number(l.fees || 0);
        const roi = Number(l.purchase_price) > 0 ? (profit / Number(l.purchase_price)) * 100 : 0;
        return sum + roi;
      }, 0) / withCost.length
    : null;

  const withDates = soldItems.filter((l) => l.sold_date && l.synced_at);
  const avgDaysToSell =
    withDates.length >= MIN_SAMPLE_SIZE_FOR_COMPARISON
      ? withDates.reduce((sum, l) => sum + daysBetween(l.created_at, l.sold_date as string), 0) / withDates.length
      : null;

  const withViews = soldItems.filter((l) => l.views !== null);
  const avgViews = withViews.length > 0 ? withViews.reduce((s, l) => s + Number(l.views), 0) / withViews.length : null;

  const withFav = soldItems.filter((l) => l.favourites !== null);
  const avgFavourites =
    withFav.length > 0 ? withFav.reduce((s, l) => s + Number(l.favourites), 0) / withFav.length : null;

  const withSoldPrice = soldItems.filter((l) => l.sold_price !== null);
  const avgSoldPrice =
    withSoldPrice.length >= MIN_SAMPLE_SIZE_FOR_COMPARISON
      ? withSoldPrice.reduce((s, l) => s + Number(l.sold_price), 0) / withSoldPrice.length
      : null;

  return { count: soldItems.length, avgRoi, avgDaysToSell, avgViews, avgFavourites, avgSoldPrice };
}

function groupBy<T>(items: Listing[], keyOf: (l: Listing) => T | null): Map<T, Listing[]> {
  const map = new Map<T, Listing[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function buildContext(
  listings: Listing[],
  accounts: VintedAccount[],
  snapshots: ListingMetricSnapshot[]
): EngineContext {
  const soldItems = listings.filter((l) => l.status === 'vendu');

  const byBrandGroups = groupBy(soldItems, (l) => normalizeKey(l.brand));
  const byCategoryGroups = groupBy(soldItems, (l) => normalizeKey(l.category));
  const byAccountGroups = groupBy(soldItems, (l) => l.vinted_account_id);

  const byBrand = new Map<string, GroupStats>();
  for (const [brand, items] of byBrandGroups) byBrand.set(brand, computeGroupStats(items));

  const byCategory = new Map<string, GroupStats>();
  for (const [category, items] of byCategoryGroups) byCategory.set(category, computeGroupStats(items));

  const byAccount = new Map<string, GroupStats>();
  for (const [accountId, items] of byAccountGroups) byAccount.set(accountId, computeGroupStats(items));

  const snapshotsByListingId = new Map<string, ListingMetricSnapshot[]>();
  for (const snap of snapshots) {
    const bucket = snapshotsByListingId.get(snap.listing_id);
    if (bucket) bucket.push(snap);
    else snapshotsByListingId.set(snap.listing_id, [snap]);
  }
  for (const bucket of snapshotsByListingId.values()) {
    bucket.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  }

  const activeListings = listings.filter((l) => l.vinted_status === 'online');
  const activeMedianViews = median(activeListings.map((l) => l.views).filter((v): v is number => v !== null));
  const activeMedianFavourites = median(
    activeListings.map((l) => l.favourites).filter((v): v is number => v !== null)
  );

  return {
    now: new Date(),
    listings,
    accounts,
    snapshotsByListingId,
    overall: computeGroupStats(soldItems),
    byBrand,
    byCategory,
    byAccount,
    activeMedianViews,
    activeMedianFavourites,
  };
}
