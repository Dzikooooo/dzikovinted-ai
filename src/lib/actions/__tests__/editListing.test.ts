import { describe, expect, it } from 'vitest';
import { editListingDefinition } from '../handlers/editListing';
import { makeActionContext } from './fixtures';
import type { ActionRequest } from '../types';
import type { EditListingPayload } from '../handlers/editListing';

const payload: EditListingPayload = {
  vintedItemId: '123456',
  title: 'Pull Zara #12',
  description: 'Très bon état',
  price: 15,
  category: 'Pulls',
  brand: 'Zara',
  size: 'M',
  condition: 'Très bon état',
  color: 'Noir',
  material: null,
  expectedVintedUsername: 'testuser',
  changedFields: ['price'],
};

const request: ActionRequest<EditListingPayload> = {
  kind: 'edit_listing',
  vintedAccountId: 'account-1',
  listingId: 'listing-1',
  payload,
};

describe('editListingDefinition', () => {
  it('has the expected kind and checks', () => {
    expect(editListingDefinition.kind).toBe('edit_listing');
    expect(editListingDefinition.checks.length).toBeGreaterThan(0);
  });

  it('has no execute() - relies on the generic runViaExtension path', () => {
    expect(editListingDefinition.execute).toBeUndefined();
  });

  it('buildPreview summarizes title, price, and details from the payload', () => {
    const preview = editListingDefinition.buildPreview(request, makeActionContext());
    expect(preview.summary).toBe('Mettre à jour « Pull Zara #12 » — 15 €');
    expect(preview.details).toEqual({
      title: 'Pull Zara #12',
      price: 15,
      category: 'Pulls',
      brand: 'Zara',
      size: 'M',
      condition: 'Très bon état',
    });
  });
});
