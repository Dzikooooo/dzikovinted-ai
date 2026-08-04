export { analyzeOpportunity, meetsOpportunityGate } from './engine';
export { normalizeBrand } from './brand';
export { buildScanContext, buildSearchContext, contextForItem, observationLookbackSince } from './context';
export type { ScanContext, PriceObservationRow, WatchlistLike, ScrapedItemLike } from './context';
export * from './types';
export { MIN_SCORE_FOR_OPPORTUNITY, MIN_CONFIDENCE_FOR_OPPORTUNITY } from './constants';
