import { describe, expect, it } from 'vitest';
import { publishListingDefinition } from '../handlers/publishListing';
import { makeAccount, makeActionContext, makeCheckDeps, makeListing } from './fixtures';
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
    expect(preview.summary).toBe('Publier « Pull Zara » — 15 €');
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

  // BUG LIVE N°2, 3e volet (republication assistee, confirme 2026-08-11) :
  // le clic sur "Republier"/"Publier" echouait avec "L'annonce n'a pas de
  // categorie renseignee." pour une annonce sans categorie/etat en base,
  // alors que vinted-publish.ts (content script) ne tente plus JAMAIS de
  // selectionner categorie/etat automatiquement -- ce sont desormais
  // TOUJOURS des champs manuels sur Vinted (voir publishFieldSummary.ts),
  // que l'annonce ResellOS en porte une valeur ou non. Bloquer l'ouverture de
  // Vinted sur ce critere empechait a tort des annonces par ailleurs valides
  // d'atteindre le formulaire. Ce test verifie qu'AUCUN check de
  // publishListingDefinition ne bloque plus sur category/condition manquants.
  it('none of the checks block on a missing category/condition -- they are always manual fields on Vinted, never prefilled', () => {
    const deps = makeCheckDeps({
      extensionConnected: true,
      selectedAccount: makeAccount({ id: 'account-1' }),
      targetListing: makeListing({
        vinted_account_id: 'account-1',
        image_urls: ['https://example.com/1.jpg'],
        category: null,
        condition: null,
        vinted_item_id: null,
      }),
    });
    const ctx = makeActionContext({ vintedAccountId: 'account-1' });

    for (const check of publishListingDefinition.checks) {
      expect(check(ctx, deps)).toEqual({ ok: true });
    }
  });
});
