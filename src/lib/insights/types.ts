import type { Listing, ListingMetricSnapshot, VintedAccount } from '../types';

export interface ScoreBreakdownEntry {
  label: string;
  delta: number;
}

export interface ListingScore {
  listingId: string;
  score: number; // 0-100
  breakdown: ScoreBreakdownEntry[];
}

export type RecommendationKind =
  | 'republish'
  | 'lower_price'
  | 'raise_price'
  | 'review_price';

export interface Recommendation {
  listingId: string;
  kind: RecommendationKind;
  message: string;
  reason: string;
}

export type AlertKind =
  | 'inactive_listing'
  | 'low_visibility'
  | 'high_demand'
  | 'incoherent_price'
  | 'exceptional_roi'
  | 'dormant_stock'
  | 'low_stock'
  | 'insufficient_margin'
  | 'high_rotation'
  | 'republish_opportunity'
  | 'visibility_drop';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertScope = 'listing' | 'account' | 'global';

export interface Alert {
  kind: AlertKind;
  severity: AlertSeverity;
  scope: AlertScope;
  listingId?: string;
  vintedAccountId?: string | null;
  message: string;
}

export interface NarrativeInsight {
  message: string;
}

export interface InsightsReport {
  scores: Map<string, ListingScore>;
  recommendations: Recommendation[];
  alerts: Alert[];
  narratives: NarrativeInsight[];
  generatedAt: string;
}

// Agregats precalcules une seule fois par computeInsights() et partages par
// toutes les regles - evite de recalculer une moyenne de marque/categorie a
// chaque regle pour chaque annonce. Toutes les moyennes ne portent que sur
// des ventes reelles (status='vendu', purchase_price connu) : jamais de
// moyenne calculee sur une donnee inconnue traitee comme zero.
export interface GroupStats {
  count: number;
  avgRoi: number | null;
  avgDaysToSell: number | null;
  avgViews: number | null;
  avgFavourites: number | null;
  avgSoldPrice: number | null;
}

export interface EngineContext {
  now: Date;
  listings: Listing[];
  accounts: VintedAccount[];
  snapshotsByListingId: Map<string, ListingMetricSnapshot[]>;
  overall: GroupStats;
  byBrand: Map<string, GroupStats>;
  byCategory: Map<string, GroupStats>;
  byAccount: Map<string, GroupStats>;
  // Mediane parmi les annonces actuellement en ligne (vinted_status='online')
  // uniquement - une annonce vendue accumule des vues sur toute sa duree de
  // vie, ce n'est pas comparable aux vues d'une annonce encore active.
  activeMedianViews: number | null;
  activeMedianFavourites: number | null;
}
