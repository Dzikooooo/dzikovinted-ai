import type { Listing, VintedAccount } from '../../../lib/types';
import type { PackageSize } from '../../../components/publish/PublishConfirmationModal';
import type { PublishListingPayload } from '../../../lib/actions/handlers/publishListing';
import type { RepublishListingPayload } from '../../../lib/actions/handlers/republishListing';
import type { EditableFieldName, EditListingPayload } from '../../../lib/actions/handlers/editListing';
import { formatTitleWithSku } from '../../../lib/sku';
import { parseMaterials } from '../../../lib/materials';

// Extrait de ListingsManagementSection.tsx (audit 2026-08-28, Phase 2 --
// "renforcer le coeur avant d'empiler dessus") : ces trois constructeurs de
// payload sont le point d'entree exact de toute ecriture Vinted
// (publier/republier/modifier) -- les isoler de la logique d'etat/rendu du
// composant les rend testables et relisables independamment, sans changer
// une seule ligne de comportement.

// category/condition peuvent reellement etre vides ici (aucun check ne
// bloque plus dessus depuis le 2026-08-11, republication assistee -- voir
// publishListing.ts) : "?? ''" satisfait uniquement le type
// (PublishListingPayload les declare `string`), Vinted les affiche comme
// champs manuels a completer quoi qu'il arrive (voir
// publishFieldSummary.ts::computeManualFields cote extension).
export function buildPublishPayload(listing: Listing, account: VintedAccount, packageSize: PackageSize): PublishListingPayload {
  return {
    title: formatTitleWithSku(listing.title, listing.sku),
    description: listing.description ?? '',
    price: listing.price,
    category: listing.category ?? '',
    brand: listing.brand || null,
    size: listing.size || null,
    condition: listing.condition ?? '',
    color: listing.color || null,
    material: listing.material || null,
    // Mission "MATIERE : MULTI-SELECT" (2026-08-16) : parseMaterials()
    // interprete le champ texte libre EXISTANT (aucun nouveau champ de
    // formulaire) -- une valeur simple ("Coton") produit un tableau a un
    // seul element, comportement identique a avant pour la grande majorite
    // des annonces.
    materials: parseMaterials(listing.material),
    imageUrls: listing.image_urls,
    packageSize,
    expectedVintedUsername: account.vinted_username,
  };
}

// Meme champs que buildPublishPayload : republish_listing cree une NOUVELLE
// fiche Vinted via la meme mecanique que publish_listing (voir
// republishListing.ts) -- previousVintedItemId n'est ajoute que pour la
// tracabilite (preview + historique du Centre des Actions), jamais lu par
// le content script.
export function buildRepublishPayload(listing: Listing, account: VintedAccount, packageSize: PackageSize): RepublishListingPayload {
  return {
    ...buildPublishPayload(listing, account, packageSize),
    previousVintedItemId: listing.vinted_item_id!,
  };
}

export function buildEditPayload(listing: Listing, account: VintedAccount, changedFields: EditableFieldName[]): EditListingPayload {
  return {
    vintedItemId: listing.vinted_item_id!,
    title: formatTitleWithSku(listing.title, listing.sku),
    description: listing.description ?? '',
    price: listing.price,
    category: listing.category ?? '',
    brand: listing.brand || null,
    size: listing.size || null,
    condition: listing.condition ?? '',
    color: listing.color || null,
    material: listing.material || null,
    expectedVintedUsername: account.vinted_username,
    changedFields,
  };
}
