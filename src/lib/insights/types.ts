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

// Decision Engine Lot 1 (2026-08-05) -- exactement les 4 recommandations
// "actives" validees (voir LOT1_SPEC.md). 'raise_price' retiree du perimetre
// MVP : la regle historique (ruleRaisePriceUndervalued) reste presente dans
// recommendations.ts pour ne rien casser silencieusement, mais n'est plus
// jamais appelee ni exposee -- marquee explicitement hors perimetre/candidate
// a suppression apres beta, jamais reintroduite sans decision explicite.
export type RecommendationKind =
  | 'verifier_annonce'
  | 'considerer_republication'
  | 'baisser_prix'
  | 'revoir_annonce';

// Confiance a 2 paliers maximum (decision explicite, pas de score continu) --
// jamais presentee comme une precision scientifique, toujours accompagnee
// d'une raison textuelle citant les vrais chiffres de l'annonce.
export type RecommendationConfidence = 'haute' | 'standard';

export interface Recommendation {
  listingId: string;
  kind: RecommendationKind;
  message: string;
  reason: string;
  confidence: RecommendationConfidence;
}

// CTA toujours limite a une action reellement disponible aujourd'hui dans
// ResellOS (voir DECISION_ENGINE.md §11) -- jamais une promesse d'execution
// automatique qui n'existe pas.
export type RecommendationCta =
  | { type: 'open_vinted' }
  | { type: 'edit_listing'; field: 'price' | null };

// Etat complet par annonce, toujours produit (jamais une absence silencieuse)
// pour toute annonce status='en_stock'. Les 4 variantes sont mutuellement
// exclusives et distinctes -- en particulier 'attendre' (on a verifie, rien
// a signaler), 'donnees_insuffisantes' (on ne peut pas savoir) et
// 'recommandation_differee' (on sait, mais une action similaire vient deja
// d'etre tentee) ne doivent jamais se confondre a l'affichage.
export type ListingRecommendationResult =
  | {
      status: 'action';
      kind: RecommendationKind;
      confidence: RecommendationConfidence;
      message: string;
      reason: string;
      cta: RecommendationCta;
      listingId: string;
    }
  | { status: 'attendre'; message: string; listingId: string }
  | { status: 'donnees_insuffisantes'; reason: string; listingId: string }
  | { status: 'recommandation_differee'; kind: RecommendationKind; reason: string; listingId: string };

// Projection minimale de action_log necessaire aux garde-fous anti-boucle
// (considerer_republication/baisser_prix) -- jamais la ligne complete, pour
// garder src/lib/insights/ sans dependance directe a la forme exacte de la
// table (voir useInsights.ts pour la requete reelle).
export interface RecentActionSummary {
  listingId: string;
  kind: 'publish_listing' | 'republish_listing' | 'edit_listing';
  completedAt: string;
  // Uniquement renseigne pour kind='edit_listing' -- issu de
  // EditListingPayload.changedFields (src/lib/actions/handlers/editListing.ts).
  changedFields?: string[];
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
  // Etat complet par annonce (les 4 statuts de ListingRecommendationResult),
  // pour l'affichage explicite de "attendre"/"donnees_insuffisantes"/
  // "recommandation_differee" -- `recommendations` ci-dessus reste un simple
  // sous-ensemble filtre (status='action') de cette map, pour compatibilite
  // descendante avec dominantSignal.ts et tout consommateur existant.
  listingRecommendations: Map<string, ListingRecommendationResult>;
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
  // Decision Engine Lot 1 -- actions recentes par annonce (publish/republish/
  // edit reussies), utilisees uniquement pour les garde-fous anti-boucle de
  // considerer_republication/baisser_prix (actionCooldown.ts). Vide par
  // defaut (buildContext() accepte un 4e parametre optionnel) : aucun appel
  // existant a buildContext() ne casse.
  actionsByListingId: Map<string, RecentActionSummary[]>;
}
