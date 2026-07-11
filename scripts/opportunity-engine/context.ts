import type { DelistingSample, EngineContext, HistoricalPriceStats, SearchContext } from './types';
import { median, mean, normalizeKey, searchKey, daysBetween } from './math';
import { MIN_OBSERVATIONS_FOR_HISTORY, OBSERVATION_LOOKBACK_DAYS } from './constants';

export interface ScrapedItemLike {
  url: string;
  favourites: number;
}

export interface WatchlistLike {
  brand: string;
  category: string;
}

// Ligne brute de market_price_observations (colonnes utiles au contexte).
export interface PriceObservationRow {
  vinted_url: string;
  brand: string | null;
  category: string | null;
  price: number;
  favourites: number;
  scanned_at: string;
}

export interface ScanContext {
  categoryMedianFavouritesByCategory: Map<string, number | null>;
  firstSeenByUrl: Map<string, string>;
  historicalStatsByKey: Map<string, HistoricalPriceStats>;
  delistingSamplesByKey: Map<string, DelistingSample[]>;
}

// Construit les agrégats partagés par tout le scan (toutes recherches
// confondues) : médiane de favoris par catégorie (signal de demande relatif,
// remplace les paliers plats codés en dur de l'ancien moteur), première
// apparition connue par URL, statistiques de prix historiques et
// échantillons de disparition par recherche (brand+catégorie) - ces deux
// derniers restent vides tant que market_price_observations n'a pas
// accumulé assez d'historique (voir constants.ts), jamais calculés sur un
// échantillon insuffisant.
export function buildScanContext(
  perSearchResults: { watch: WatchlistLike; items: ScrapedItemLike[] }[],
  observations: PriceObservationRow[]
): ScanContext {
  const categoryMedianFavouritesByCategory = new Map<string, number | null>();
  const favouritesByCategory = new Map<string, number[]>();
  for (const { watch, items } of perSearchResults) {
    const key = normalizeKey(watch.category);
    const list = favouritesByCategory.get(key) ?? [];
    for (const item of items) list.push(item.favourites);
    favouritesByCategory.set(key, list);
  }
  for (const [key, values] of favouritesByCategory) {
    categoryMedianFavouritesByCategory.set(key, median(values));
  }

  const firstSeenByUrl = new Map<string, string>();
  const observationsByKey = new Map<string, PriceObservationRow[]>();
  const observationsByUrl = new Map<string, PriceObservationRow[]>();
  for (const obs of observations) {
    const key = searchKey(obs.brand, obs.category);
    const byKey = observationsByKey.get(key) ?? [];
    byKey.push(obs);
    observationsByKey.set(key, byKey);

    const byUrl = observationsByUrl.get(obs.vinted_url) ?? [];
    byUrl.push(obs);
    observationsByUrl.set(obs.vinted_url, byUrl);
  }
  for (const [url, rows] of observationsByUrl) {
    const earliest = rows.reduce((min, r) => (r.scanned_at < min ? r.scanned_at : min), rows[0].scanned_at);
    firstSeenByUrl.set(url, earliest);
  }

  const historicalStatsByKey = new Map<string, HistoricalPriceStats>();
  for (const [key, rows] of observationsByKey) {
    if (rows.length < MIN_OBSERVATIONS_FOR_HISTORY) continue;
    const prices = rows.map((r) => r.price);
    const med = median(prices);
    const avg = mean(prices);
    if (med === null || avg === null) continue;
    historicalStatsByKey.set(key, {
      median: med,
      mean: avg,
      min: Math.min(...prices),
      max: Math.max(...prices),
      sampleSize: rows.length,
    });
  }

  // Un échantillon de "disparition" = une URL vue dans l'historique mais
  // absente du batch scrapé de CE scan - proxy honnête de vente/retrait, pas
  // une confirmation. daysVisible = dernière - première apparition connue.
  const currentUrlsByKey = new Map<string, Set<string>>();
  for (const { watch, items } of perSearchResults) {
    const key = searchKey(watch.brand, watch.category);
    const set = currentUrlsByKey.get(key) ?? new Set<string>();
    for (const item of items) set.add(item.url);
    currentUrlsByKey.set(key, set);
  }
  const delistingSamplesByKey = new Map<string, DelistingSample[]>();
  for (const [key, rows] of observationsByKey) {
    const currentUrls = currentUrlsByKey.get(key) ?? new Set<string>();
    const byUrl = new Map<string, PriceObservationRow[]>();
    for (const row of rows) {
      const list = byUrl.get(row.vinted_url) ?? [];
      list.push(row);
      byUrl.set(row.vinted_url, list);
    }
    const samples: DelistingSample[] = [];
    for (const [url, urlRows] of byUrl) {
      if (currentUrls.has(url)) continue; // encore visible, pas une disparition
      if (urlRows.length < 2) continue; // une seule observation ne donne pas de durée
      const sorted = [...urlRows].sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
      const days = daysBetween(sorted[0].scanned_at, sorted[sorted.length - 1].scanned_at);
      if (days > 0) samples.push({ daysVisible: days });
    }
    if (samples.length > 0) delistingSamplesByKey.set(key, samples);
  }

  return { categoryMedianFavouritesByCategory, firstSeenByUrl, historicalStatsByKey, delistingSamplesByKey };
}

// Contexte propre à une recherche watchlist donnée (même brand+model) -
// comparablePrices reprend le comportement historique inchangé (prix du
// batch courant pour cette recherche uniquement).
export function buildSearchContext(watch: WatchlistLike, comparablePrices: number[], scanCtx: ScanContext): SearchContext {
  const key = searchKey(watch.brand, watch.category);
  return {
    comparablePrices,
    categoryMedianFavourites: scanCtx.categoryMedianFavouritesByCategory.get(normalizeKey(watch.category)) ?? null,
    historicalPriceStats: scanCtx.historicalStatsByKey.get(key) ?? null,
    delistingSamples: scanCtx.delistingSamplesByKey.get(key) ?? [],
  };
}

export function contextForItem(searchCtx: SearchContext, url: string, scanCtx: ScanContext): EngineContext {
  return { ...searchCtx, firstSeenAt: scanCtx.firstSeenByUrl.get(url) ?? null };
}

// Fenêtre glissante à passer à la requête Supabase qui charge l'historique
// avant la passe de scoring (voir scripts/vinted-scan.ts).
export function observationLookbackSince(now: Date): string {
  return new Date(now.getTime() - OBSERVATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
