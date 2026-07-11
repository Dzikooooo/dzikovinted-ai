export interface ScoreBreakdownEntry {
  label: string;
  delta: number;
  kind: 'score' | 'confidence' | 'risk';
}

export type RiskLevel = 'faible' | 'modere' | 'eleve';

export interface HistoricalPriceStats {
  median: number;
  mean: number;
  min: number;
  max: number;
  sampleSize: number;
}

// Un item vu a une date et disparu (plus revu dans un scan suivant) est un
// proxy honnête de "vendu ou retiré" - PAS une confirmation de vente réelle
// (voir constants.ts). daysVisible = dernière apparition - première
// apparition dans market_price_observations.
export interface DelistingSample {
  daysVisible: number;
}

// Contexte partagé par toute une recherche watchlist (même brand+model) -
// construit une fois par recherche, réutilisé pour chaque item scoré.
export interface SearchContext {
  comparablePrices: number[];
  categoryMedianFavourites: number | null;
  historicalPriceStats: HistoricalPriceStats | null;
  delistingSamples: DelistingSample[];
}

// Contexte complet passé à analyzeOpportunity() pour un item précis -
// SearchContext + la seule donnée réellement propre à cet item (sa première
// apparition connue, "vinted_url" étant la clé naturelle).
export interface EngineContext extends SearchContext {
  firstSeenAt: string | null;
}

export interface PriceModelResult {
  marketPrice: number;
  source: string;
  dispersion: number | null;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdownEntry[];
}

export interface ConfidenceResult {
  confidence: number;
  breakdown: ScoreBreakdownEntry[];
}

export interface RiskResult {
  riskLevel: RiskLevel;
  breakdown: ScoreBreakdownEntry[];
}

export interface ResaleEstimate {
  minDays: number;
  maxDays: number;
  confidence: number;
}

export interface OpportunityAnalysis {
  market_price: number;
  price_source: string;
  profit: number;
  roi: number;
  score: number;
  confidence: number;
  risk_level: RiskLevel;
  breakdown: ScoreBreakdownEntry[];
  resale_days_min: number | null;
  resale_days_max: number | null;
  resale_confidence: number | null;
  first_observed_at: string | null;
  competing_listings_count: number;
  checklist: string[];
}
