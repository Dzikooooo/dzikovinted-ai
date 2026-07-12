import { describe, expect, it } from 'vitest';
import { isActivelyInStock } from '../listingStatus';
import type { Listing } from '../types';

function makeListing(overrides: Partial<Listing>): Listing {
  return {
    id: 'listing-1',
    user_id: 'user-1',
    title: 'Article de test',
    description: '',
    brand: '',
    category: '',
    color: '',
    size: '',
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
    ...overrides,
  };
}

describe('isActivelyInStock', () => {
  it('is true for an online item', () => {
    expect(isActivelyInStock(makeListing({ status: 'en_stock', vinted_status: 'online' }))).toBe(true);
  });

  it('is true for a draft never synced to Vinted', () => {
    expect(isActivelyInStock(makeListing({ status: 'draft', vinted_status: null }))).toBe(true);
  });

  it('is false for a reserved item', () => {
    expect(isActivelyInStock(makeListing({ status: 'en_stock', vinted_status: 'reserved' }))).toBe(false);
  });

  it('is false for an item with a sale pending', () => {
    expect(isActivelyInStock(makeListing({ status: 'en_stock', vinted_status: 'sold_pending' }))).toBe(false);
  });

  it('is false for a completed sale', () => {
    expect(isActivelyInStock(makeListing({ status: 'vendu', vinted_status: 'sold_completed' }))).toBe(false);
  });
});
