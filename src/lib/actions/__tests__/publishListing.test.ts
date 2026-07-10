import { describe, expect, it } from 'vitest';
import { publishListingDefinition } from '../handlers/publishListing';
import { makeActionContext } from './fixtures';
import type { ActionRequest } from '../types';
import type { PublishListingPayload } from '../handlers/publishListing';

const payload: PublishListingPayload = {
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
};

const request: ActionRequest<PublishListingPayload> = {
  kind: 'publish_listing',
  vintedAccountId: 'account-1',
  listingId: 'listing-1',
  payload,
};

describe('publishListingDefinition', () => {
  it('has the expected kind and checks', () => {
    expect(publishListingDefinition.kind).toBe('publish_listing');
    expect(publishListingDefinition.checks.length).toBeGreaterThan(0);
  });

  it('has no execute() - relies on the generic runViaExtension path', () => {
    expect(publishListingDefinition.execute).toBeUndefined();
  });

  it('buildPreview summarizes title, price, and details from the payload', () => {
    const preview = publishListingDefinition.buildPreview(request, makeActionContext());
    expect(preview.summary).toBe('Publier « Pull Zara » — 15.00 €');
    expect(preview.details).toEqual({
      title: 'Pull Zara',
      price: 15,
      category: 'Pulls',
      brand: 'Zara',
      size: 'M',
      condition: 'Très bon état',
      photoCount: 2,
      packageSize: 'medium',
    });
  });
});
