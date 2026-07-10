export type Plan = 'free' | 'pro' | 'team';
export type DashboardPage =
  | 'home'
  | 'generator'
  | 'opportunities'
  | 'stock'
  | 'expenses'
  | 'accounting'
  | 'vinted-account'
  | 'actions'
  | 'stats'
  | 'subscription'
  | 'settings';
  export type AppPage = "landing" | "auth" | "dashboard";
export type SettingsTab = 'profile' | 'security' | 'accounts' | 'notifications' | 'api' | 'danger';
export type AuthMode = 'login' | 'register' | 'forgot';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  plan: Plan;
  credits: number;
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
