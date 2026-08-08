export type Plan = 'free' | 'pro' | 'team';
export type DashboardPage =
  | 'home'
  | 'generator'
  | 'watchlist'
  | 'communication'
  | 'accounting'
  | 'vinted-account'
  | 'actions'
  | 'subscription'
  | 'settings'
  | 'community'
  | 'admin';
  export type AppPage = "landing" | "auth" | "dashboard" | "reset-password" | "blog" | "newsletter" | "cgu" | "confidentialite";
export type SettingsTab = 'profile' | 'security' | 'accounts' | 'notifications' | 'api' | 'privacy' | 'danger';
// Meme mecanisme que SettingsTab (deep-link via initialTab porte par
// DashboardLayout) -- voir CommunityPage.tsx. 'discord' est une tuile
// statique (lien externe), pas une vue avec donnees.
export type CommunityTab =
  | 'news'
  | 'tutorials'
  | 'guides'
  | 'resources'
  | 'roadmap'
  | 'polls'
  | 'suggestions'
  | 'faq'
  | 'support'
  | 'discord'
  | 'reviews'
  | 'newsletter';
export type AuthMode = 'login' | 'register' | 'forgot';

// Type des lignes community_content (supabase/migrations/20260727100000_add_community_content.sql).
// Les 5 valeurs de CommunityContentType correspondent 1:1 aux onglets
// non-Discord/Roadmap/Polls/Suggestions/Support de CommunityTab.
export type CommunityContentType = 'changelog' | 'tutorial' | 'guide' | 'resource' | 'faq';
export type CommunityContentStatus = 'draft' | 'published';
export type CommunityResourceKind = 'pdf' | 'video' | 'link';

export interface CommunityContent {
  id: string;
  type: CommunityContentType;
  status: CommunityContentStatus;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  cover_image_url: string | null;
  resource_kind: CommunityResourceKind | null;
  resource_url: string | null;
  category: string | null;
  sort_order: number;
  author_id: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Tolerance de schema pour un futur gating par palier d'acces (Membre/
  // Client/Client Premium -- voir migration 20260727110000). Toujours
  // null tant qu'aucune UI ni logique d'application ne l'utilise.
  min_plan: Plan | null;
}

// Type des lignes roadmap_items (supabase/migrations/20260727120000_add_roadmap_items.sql).
// Pas de brouillon/publie ici : un item existe et est immediatement
// visible, seul son statut change (colonnes Now/Next/Later cote UI).
export type RoadmapStatus = 'planned' | 'in_progress' | 'shipped';

export interface RoadmapItem {
  id: string;
  status: RoadmapStatus;
  title: string;
  description: string;
  sort_order: number;
  author_id: string;
  min_plan: Plan | null;
  created_at: string;
  updated_at: string;
}

// Type des lignes polls/poll_options/poll_votes (supabase/migrations/20260727130000_add_polls.sql).
// poll_options.votes_count est denormalise (maintenu par trigger), jamais
// calcule cote client -- poll_votes n'est jamais lu en liste (RLS ne
// l'autorise que pour son propre vote), voir myVoteOptionId dans usePolls.
export type PollStatus = 'open' | 'closed';

export interface Poll {
  id: string;
  question: string;
  description: string | null;
  status: PollStatus;
  author_id: string;
  min_plan: Plan | null;
  created_at: string;
  updated_at: string;
}

export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
  votes_count: number;
  created_at: string;
}

export interface PollVote {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  created_at: string;
}

// Type des lignes suggestions/suggestion_votes (supabase/migrations/20260727140000_add_suggestions.sql).
// Seul endroit de l'espace Communaute ou la creation n'est pas reservee a
// l'admin -- voir le commentaire en tete de la migration.
export type SuggestionStatus = 'open' | 'planned' | 'in_progress' | 'done' | 'declined';

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  author_id: string;
  admin_reply: string | null;
  admin_reply_at: string | null;
  votes_count: number;
  min_plan: Plan | null;
  created_at: string;
  updated_at: string;
}

export interface SuggestionVote {
  id: string;
  suggestion_id: string;
  user_id: string;
  created_at: string;
}

// Type des lignes support_tickets/ticket_messages (supabase/migrations/20260727150000_add_support_tickets.sql).
// Lot le plus sensible cote confidentialite -- ticket_messages.is_admin_reply
// ne peut jamais etre force a true cote client sans etre reellement admin
// (voir la policy insert_own_ticket_messages).
export type TicketStatus = 'open' | 'in_progress' | 'closed';

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  status: TicketStatus;
  min_plan: Plan | null;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  is_admin_reply: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  plan: Plan;
  credits: number;
  role: 'user' | 'admin';
  avatar_url: string | null;
  banned: boolean;
  created_at: string;
}

export type NotificationType = 'sale' | 'community' | 'admin_broadcast';

export interface AppNotification {
  id: string;
  user_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  target_page: DashboardPage | null;
  created_by: string | null;
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
  // 'market' = mediane de vraies annonces comparables (market_price_observations,
  // voir supabase/functions/analyze-clothing/index.ts) ; 'ai_estimate' = pure
  // estimation Gemini, aucune donnee de marche trouvee pour cette marque+
  // categorie -- la majorite des generations restent honnetement 'ai_estimate'
  // (la table ne couvre que les recherches suivies en Watchlist).
  price_source: 'market' | 'ai_estimate';
  price_comparables_count: number;
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
  // Galerie photo complete de l'annonce (extraite depuis la page item Vinted
  // par scripts/vinted-scan.ts) -- null tant que la ligne n'a pas ete
  // scrapee via ce second passage, ou si la page etait inaccessible.
  images: string[] | null;
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

// Modele de message (chantier Communication, reprise 2026-08-08) --
// propriete pure de l'utilisateur, jamais envoye pour lui : ResellOS
// resout uniquement les variables {titre}/{prix}/... a l'affichage (voir
// src/lib/messageTemplate.ts), l'envoi reste 100% manuel sur Vinted.
export interface MessageTemplate {
  id: string;
  user_id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface VintedAccount {
  id: string;
  user_id: string;
  label: string;
  vinted_user_id: string;
  vinted_username: string;
  connected: boolean;
  last_synced_at: string | null;
  // Ecrite uniquement par recordListings (extension), jamais par
  // recordAccountDetected -- signal non ambigu de "les annonces
  // elles-memes ont ete synchronisees", distinct de last_synced_at qui
  // se declenche aussi sur une simple detection de compte. Voir
  // StockPage.tsx::handleSync et 20260727170000_add_listings_synced_at.sql.
  listings_synced_at: string | null;
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
