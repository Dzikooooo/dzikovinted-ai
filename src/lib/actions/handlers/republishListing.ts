import {
  checkAccountSelected,
  checkAuthenticated,
  checkExtensionConnected,
  checkListingHasPhotos,
  checkListingLoaded,
  checkListingOwnership,
  checkListingRepublishEligible,
} from '../checks';
import type { ActionDefinition } from '../types';
import { formatEUR } from '../../currency';
import type { PublishListingPayload } from './publishListing';

// Republier une annonce -- deja publiee sur Vinted, qu'elle y soit encore
// visible (relance de visibilite, cas d'usage principal, voir
// checks.ts::checkListingRepublishEligible) ou plus (masquee/supprimee/
// statut inconnu) : cree une NOUVELLE fiche Vinted -- meme mecanique DOM que
// publish_listing (reutilise handlePublishListing tel quel cote extension,
// voir runAction.ts), jamais une tentative de "reactiver" l'ancienne
// annonce. Decision actee avec l'utilisateur le 2026-08-01 (mini-audit
// technique en chat) : zero nouveau selecteur DOM, zero nouveau risque
// jamais teste en direct. Le sort de l'ancienne annonce Vinted (conservee,
// masquee, supprimee) reste une decision produit non tranchee -- voir le
// rapport Republication V2 du 2026-08-10.
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
  // Categorie/etat/attributs volontairement NON verifies ici -- meme raison
  // que publishListingDefinition (voir son commentaire) : republish_listing
  // reutilise exactement le meme content script de creation, qui n'y touche
  // jamais.
  checks: [
    checkAuthenticated,
    checkExtensionConnected,
    checkAccountSelected,
    checkListingLoaded,
    checkListingOwnership,
    checkListingHasPhotos,
    checkListingRepublishEligible,
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
        // Honnete-mais-vague volontairement (audit Republication V2,
        // 2026-08-10) : ResellOS ne touche techniquement jamais l'ancienne
        // fiche Vinted aujourd'hui (aucune action delete/hide implementee,
        // voir le rapport) -- mais promettre qu'elle "reste en ligne" serait
        // tout aussi faux si elle etait deja masquee/supprimee avant ce clic.
        // Ne jamais affirmer un etat qui n'est pas garanti.
        note: "Une nouvelle annonce Vinted sera créée. ResellOS ne modifie ni ne supprime jamais l'ancienne annonce automatiquement — tu gères toi-même son sort sur Vinted si besoin.",
      },
    };
  },
};
