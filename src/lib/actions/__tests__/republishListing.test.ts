import { describe, expect, it } from 'vitest';
import { republishListingDefinition } from '../handlers/republishListing';
import { makeAccount, makeActionContext, makeCheckDeps, makeListing } from './fixtures';
import type { ActionRequest } from '../types';
import type { RepublishListingPayload } from '../handlers/republishListing';

const payload: RepublishListingPayload = {
  title: 'Pull Zara',
  description: 'Très bon état',
  price: 15,
  category: 'Pulls',
  brand: 'Zara',
  size: 'M',
  condition: 'Très bon état',
  color: 'Noir',
  material: null,
  imageUrls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
  packageSize: 'medium',
  expectedVintedUsername: 'testuser',
  previousVintedItemId: 'old-item-42',
};

const request: ActionRequest<RepublishListingPayload> = {
  kind: 'republish_listing',
  vintedAccountId: 'account-1',
  listingId: 'listing-1',
  payload,
};

describe('republishListingDefinition', () => {
  it('has the expected kind and checks', () => {
    expect(republishListingDefinition.kind).toBe('republish_listing');
    expect(republishListingDefinition.checks.length).toBeGreaterThan(0);
  });

  it('has no execute() -- relies on the generic runViaExtension path (reuses handlePublishListing, see extension/src/background/runAction.ts)', () => {
    expect(republishListingDefinition.execute).toBeUndefined();
  });

  it('buildPreview summarizes title, price, and traces the previous Vinted item id -- never confuses old and new listings', () => {
    const preview = republishListingDefinition.buildPreview(request, makeActionContext());
    expect(preview.summary).toBe('Republier « Pull Zara » — 15 €');
    expect(preview.details).toEqual({
      title: 'Pull Zara',
      price: 15,
      category: 'Pulls',
      brand: 'Zara',
      size: 'M',
      condition: 'Très bon état',
      photoCount: 2,
      packageSize: 'medium',
      previousVintedItemId: 'old-item-42',
      note: "Une nouvelle annonce Vinted sera créée. ResellOS ne modifie ni ne supprime jamais l'ancienne annonce automatiquement -- tu gères toi-même son sort sur Vinted si besoin.",
    });
  });

  // Meme bug/raison que publishListing.test.ts : republish_listing reutilise
  // exactement le meme content script de creation (jamais de selection
  // automatique de categorie/etat) -- categorie/etat manquants ne doivent
  // jamais bloquer la republication non plus.
  it('none of the checks block on a missing category/condition -- they are always manual fields on Vinted, never prefilled', () => {
    const deps = makeCheckDeps({
      extensionConnected: true,
      selectedAccount: makeAccount({ id: 'account-1' }),
      targetListing: makeListing({
        vinted_account_id: 'account-1',
        image_urls: ['https://example.com/1.jpg'],
        category: null,
        condition: null,
        status: 'en_stock',
        vinted_item_id: 'old-item-42',
        vinted_status: 'hidden',
      }),
    });
    const ctx = makeActionContext({ vintedAccountId: 'account-1' });

    for (const check of republishListingDefinition.checks) {
      expect(check(ctx, deps)).toEqual({ ok: true });
    }
  });
});
