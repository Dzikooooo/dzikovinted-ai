import {
  checkAccountSelected,
  checkAuthenticated,
  checkExtensionConnected,
  checkListingHasPhotos,
  checkListingHasRequiredVintedFields,
  checkListingLoaded,
  checkListingNeedsRepublish,
  checkListingOwnership,
  checkPublishTemporarilyDisabled,
} from '../checks';
import type { ActionDefinition } from '../types';
import { formatEUR } from '../../currency';
import type { PublishListingPayload } from './publishListing';

// Republier une annonce deja publiee sur Vinted mais qui n'y est plus
// reellement en ligne (masquee/supprimee/statut inconnu, voir
// checks.ts::checkListingNeedsRepublish) : cree une NOUVELLE fiche Vinted --
// meme mecanique DOM que publish_listing (reutilise handlePublishListing
// tel quel cote extension, voir runAction.ts), jamais une tentative de
// "reactiver" l'ancienne annonce, qui peut ne plus exister du tout. Decision
// actee avec l'utilisateur le 2026-08-01 (mini-audit technique en chat) :
// zero nouveau selecteur DOM, zero nouveau risque jamais teste en direct.
//
// previousVintedItemId : uniquement pour la tracabilite (preview + payload
// journalise dans action_log, donc consultable indefiniment dans le Centre
// des Actions) -- jamais lu par le content script, jamais utilise pour
// toucher l'ancienne annonce.
export interface RepublishListingPayload extends PublishListingPayload {
  previousVintedItemId: string;
}

// execute() volontairement absent, meme raison que publishListingDefinition :
// passe par deps.runViaExtension() (voir engine.ts), qui route vers le meme
// handler cote extension que publish_listing.
export const republishListingDefinition: ActionDefinition<RepublishListingPayload> = {
  kind: 'republish_listing',
  label: 'Republier sur Vinted',
  checks: [
    checkPublishTemporarilyDisabled,
    checkAuthenticated,
    checkExtensionConnected,
    checkAccountSelected,
    checkListingLoaded,
    checkListingOwnership,
    checkListingHasPhotos,
    checkListingHasRequiredVintedFields,
    checkListingNeedsRepublish,
  ],
  buildPreview: (request) => {
    const { title, price, category, brand, size, condition, imageUrls, packageSize, previousVintedItemId } = request.payload;
    return {
      summary: `Republier « ${title} » — ${formatEUR(price)}`,
      details: {
        title,
        price,
        category,
        brand,
        size,
        condition,
        photoCount: imageUrls.length,
        packageSize,
        previousVintedItemId,
        note: "Une nouvelle annonce Vinted sera créée -- l'ancienne (masquée, supprimée ou introuvable) n'est jamais modifiée.",
      },
    };
  },
};
