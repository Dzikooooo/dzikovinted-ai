export type Plan = 'free' | 'pro' | 'team';
export type DashboardPage =
  | 'home'
  | 'generator'
  | 'opportunities'
  | 'watchlist'
  | 'stock'
  | 'expenses'
  | 'accounting'
  | 'vinted-account'
  | 'actions'
  | 'stats'
  | 'subscription'
  | 'settings';
  export type AppPage = "landing" | "auth" | "dashboard" | "reset-password";
export type SettingsTab = 'profile' | 'security' | 'accounts' | 'notifications' | 'api' | 'danger';
export type AuthMode = 'login' | 'register' | 'forgot';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  plan: Plan;
  credits: number;
  role: 'user' | 'admin';
  avatar_url: string | null;
  created_at: string;
}

export interface VintedFilter {
  label: string;
  value: string;
}

export interface Listing {
  id: string;
  user_id: string;

  title: string;
  // Nullable en base malgre l'absence de "| null" apparente ici avant le
  // 2026-07-23 : une annonce importee/synchronisee depuis Vinted
  // (extension/src/background/sync.ts::recordListings) n'ecrit jamais
  // description/category/color/material a la creation -- ces colonnes
  // valent reellement null a l'execution pour ces lignes. Corrige pour
  // que le type reflete la realite (voir EditListingModal.tsx pour la
  // normalisation cote formulaire, et checks.ts::checkListingHasRequiredVintedFields
  // pour la garde avant toute publication).
  description: string | null;

  brand: string | null;
  category: string | null;
  color: string | null;
  size: string | null;
  material: string | null;
  condition: string | null;

  price: number;
  quick_price: number;
  premium_price: number;

  keywords: string[];
  vinted_filters: VintedFilter[];
  image_urls: string[];

  // number | null (pas number) depuis la fusion avec vinted_listings
  // (2026-07-09) : un article decouvert par la synchro Vinted n'a pas de
  // prix d'achat connu, la colonne est reellement NULL en base pour ces
  // lignes - voir extension/src/background/sync.ts.
  purchase_price: number | null;
purchase_date: string | null;
purchase_location: string | null;

status: 'draft' | 'en_stock' | 'vendu';

sold_price: number | null;
sold_date: string | null;

fees: number;

  is_favorite: boolean;
  created_at: string;

  // Rattachement Vinted (2026-07-09) : null tant que l'article n'a jamais
  // ete lie a une annonce Vinted reelle (brouillon Generateur pur).
  // vinted_status est un axe distinct de `status` : etat reel observe sur
  // Vinted, gere par la synchro, jamais par l'utilisateur directement.
  vinted_account_id: string | null;
  vinted_item_id: string | null;
  vinted_url: string | null;
  vinted_status: string | null;
  favourites: number | null;
  views: number | null;
  synced_at: string | null;

  // Horodatage de la derniere edition manuelle depuis ResellOS (modale
  // "Modifier l'annonce", StockPage.tsx) -- null tant que l'annonce n'a
  // jamais ete editee apres sa creation.
  last_edited_at: string | null;

  // Numero unique par utilisateur (#1, #2, #43...), attribue automatiquement
  // a l'insertion (trigger DB, migration 20260713120000) -- jamais gere
  // manuellement. Toujours non-null pour une ligne creee apres ce trigger ;
  // peut etre null pour d'anciennes lignes creees avant sa mise en place.
  sku: number | null;

  // Etat du push sortant ResellOS -> Vinted (migration 20260715090000,
  // demande explicite : "ne pas considerer la valeur locale comme
  // synchronisee tant que Vinted n'a pas confirme"). null = pas de
  // brouillon local en attente (etat par defaut, y compris pour toute
  // ligne jamais editee depuis ResellOS). 'sync_pending' pose des que
  // EditListingModal enregistre une modification avec intention 'update',
  // avant toute tentative de push -- resolu en 'sync_success'/'sync_failed'
  // par le resultat reel de l'action edit_listing. Tant que pending/failed,
  // import/synchro Vinted->ResellOS ne doivent jamais ecraser silencieusement
  // les champs proprietaires du brouillon (voir extension/src/background/sync.ts).
  vinted_sync_status: 'sync_pending' | 'sync_success' | 'sync_failed' | null;
}
export interface GeneratedListing {
  title: string;
  description: string;
  brand: string;
  category: string;
  color: string;
  size: string;
  material: string;
  condition: string;
  price: number;
  quick_price: number;
  premium_price: number;
  keywords: string[];
  vinted_filters: VintedFilter[];
}

export interface UsageRecord {
  id: string;
  user_id: string;
  month: string;
  analyses_count: number;
}

export type OpportunityRiskLevel = 'faible' | 'modere' | 'eleve';

export interface OpportunityBreakdownEntry {
  label: string;
  delta: number;
  kind: 'score' | 'confidence' | 'risk';
}

export interface MarketOpportunity {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  image: string | null;
  price_found: number | null;
  market_price: number | null;
  profit: number | null;
  roi: number | null;
  score: number | null;
  confidence: number | null;
  price_source: string | null;
  favourites: number | null;
  vinted_url: string | null;
  status: string;
  created_at: string;
  // Moteur d'opportunités (phase 2) - toutes nullables, alimentées
  // progressivement à mesure que market_price_observations accumule de
  // l'historique (voir scripts/opportunity-engine).
  risk_level: OpportunityRiskLevel | null;
  breakdown: OpportunityBreakdownEntry[] | null;
  resale_days_min: number | null;
  resale_days_max: number | null;
  resale_confidence: number | null;
  first_observed_at: string | null;
  competing_listings_count: number | null;
}

// Verdict unifié de score+confiance+risque (voir src/lib/opportunityVerdict.ts
// pour la logique de calcul, dérivée sans nouveau seuil des constantes déjà
// documentées dans scripts/opportunity-engine/).
export type Verdict = 'excellent' | 'recommande' | 'a_surveiller' | 'trop_risque';

export interface OpportunityFilters {
  category: string;
  brands: string[];
  minScore: number | null;
  minConfidence: number | null;
  minRoi: number | null;
  minProfit: number | null;
  maxBudget: number | null;
  maxResaleDays: number | null;
  riskLevels: OpportunityRiskLevel[];
  verdicts: Verdict[];
}

export interface WatchlistEntry {
  id: string;
  user_id: string | null; // null = recherche plateforme (lecture seule)
  brand: string;
  model: string;
  category: string;
  priority: number; // 1-3
  active: boolean;
  min_profit: number;
  min_roi: number;
  created_at: string;
}

export interface VintedAccount {
  id: string;
  user_id: string;
  label: string;
  vinted_user_id: string;
  vinted_username: string;
  connected: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  is_default: boolean;
  created_at: string;
}

export interface ListingMetricSnapshot {
  id: string;
  listing_id: string;
  views: number | null;
  favourites: number | null;
  price: number | null;
  vinted_status: string | null;
  captured_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: Plan;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
}

export const PLAN_LIMITS: Record<Plan, number | null> = {
  free: 10,
  pro: null,
  team: null,
};

// Nombre max de photos par annonce -- deja promis en toutes lettres sur
// Pricing.tsx/SubscriptionPage.tsx ("1 photo par annonce" / "10 photos
// par annonce") mais jamais reellement applique nulle part avant ce
// correctif (le Generateur/la modale d'edition bridaient tout le monde a
// 4, quel que soit le plan).
export const PLAN_PHOTO_LIMITS: Record<Plan, number> = {
  free: 1,
  pro: 10,
  team: 10,
};
