import { describe, expect, it } from 'vitest';
import { republishListingDefinition } from '../handlers/republishListing';
import { makeActionContext } from './fixtures';
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
      note: "Une nouvelle annonce Vinted sera créée -- l'ancienne (masquée, supprimée ou introuvable) n'est jamais modifiée.",
    });
  });
});
