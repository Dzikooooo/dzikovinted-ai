export type Plan = 'free' | 'pro' | 'team';
export type DashboardPage =
  | 'home'
  | 'generator'
  | 'market'
  | 'opportunities'
  | 'stock'
  | 'expenses'
  | 'stats'
  | 'subscription'
  | 'settings'
  | 'new-item';
  export type AppPage = "landing" | "auth" | "dashboard";
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

  purchase_price: number;
purchase_date: string | null;
purchase_location: string | null;

status: 'draft' | 'en_stock' | 'vendu';

sold_price: number | null;
sold_date: string | null;

fees: number;

  is_favorite: boolean;
  created_at: string;
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
