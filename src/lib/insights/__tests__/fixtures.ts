import type { Listing, ListingMetricSnapshot, VintedAccount } from '../../types';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: nextId('listing'),
    user_id: 'user-1',
    title: 'Article de test',
    description: '',
    brand: 'MarqueTest',
    category: 'Vêtements',
    color: '',
    size: 'M',
    material: '',
    condition: '',
    price: 20,
    quick_price: 20,
    premium_price: 25,
    keywords: [],
    vinted_filters: [],
    image_urls: [],
    purchase_price: null,
    purchase_date: null,
    purchase_location: null,
    status: 'en_stock',
    sold_price: null,
    sold_date: null,
    fees: 0,
    is_favorite: false,
    created_at: new Date().toISOString(),
    vinted_account_id: null,
    vinted_item_id: null,
    vinted_url: null,
    vinted_status: null,
    favourites: null,
    views: null,
    synced_at: null,
    last_edited_at: null,
    sku: null,
    vinted_sync_status: null,
    ...overrides,
  };
}

export function makeAccount(overrides: Partial<VintedAccount> = {}): VintedAccount {
  return {
    id: nextId('account'),
    user_id: 'user-1',
    label: 'Compte test',
    vinted_user_id: '1234',
    vinted_username: 'testuser',
    connected: true,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    is_default: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeSnapshot(overrides: Partial<ListingMetricSnapshot> = {}): ListingMetricSnapshot {
  return {
    id: nextId('snapshot'),
    listing_id: 'listing-1',
    views: 0,
    favourites: 0,
    price: 20,
    vinted_status: 'online',
    captured_at: new Date().toISOString(),
    ...overrides,
  };
}

export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}
