import {
  checkAccountSelected,
  checkAuthenticated,
  checkExtensionConnected,
  checkListingHasPhotos,
  checkListingLoaded,
  checkListingNotAlreadyPublished,
} from '../checks';
import type { ActionDefinition } from '../types';
import { formatEUR } from '../../currency';

// Duplique la forme de PublishListingPayload (extension/src/lib/messages.ts)
// - meme convention de duplication assumee que pour ActionKind (extension/
// est un paquet independant, voir EXTENSION.md §9). Le payload complet (pas
// seulement packageSize) est necessaire ici : buildPreview() n'a acces qu'a
// `request.payload`/`ctx` (pas a ActionCheckDeps.targetListing), donc
// l'appelant (le bouton "Publier sur Vinted") doit fournir un instantane
// complet de l'annonce au moment de prepareAction() plutot que de compter
// sur un re-fetch implicite.
export interface PublishListingPayload {
  title: string;
  description: string;
  price: number;
  category: string;
  brand: string | null;
  size: string | null;
  condition: string;
  color: string | null;
  material: string | null;
  // Mission "MATIERE : MULTI-SELECT" (2026-08-16) : derive de `material` via
  // src/lib/materials.ts::parseMaterials() au moment de la construction du
  // payload (buildPublishPayload, ListingsManagementSection.tsx) -- voir
  // extension/src/lib/messages.ts::PublishListingPayload pour le contrat
  // complet cote content script.
  materials?: string[];
  imageUrls: string[];
  packageSize: 'small' | 'medium' | 'large';
  expectedVintedUsername: string;
}

// execute() volontairement absent : passe par deps.runViaExtension() comme
// toute action du registre (voir engine.ts) - c'est le hook
// (useActionEngine.ts) qui relaie la progression rapportee par l'extension,
// pas cette definition, qui reste une simple donnee (checks + preview).
export const publishListingDefinition: ActionDefinition<PublishListingPayload> = {
  kind: 'publish_listing',
  label: 'Publier sur Vinted',
  // Categorie/etat/attributs volontairement NON verifies ici (retire
  // 2026-08-11, republication assistee) : vinted-publish.ts (content script)
  // ne tente plus jamais de les selectionner automatiquement -- le trigger du
  // panneau categorie exige un evenement isTrusted, impossible a simuler (voir
  // son commentaire d'en-tete) -- ce sont desormais TOUJOURS des champs
  // manuels sur Vinted (voir publishFieldSummary.ts::computeManualFields),
  // que l'annonce ResellOS en porte une valeur ou non. Les bloquer ici
  // empechait a tort l'ouverture de Vinted pour des annonces valides.
  checks: [
    checkAuthenticated,
    checkExtensionConnected,
    checkAccountSelected,
    checkListingLoaded,
    checkListingHasPhotos,
    checkListingNotAlreadyPublished,
  ],
  buildPreview: (request) => {
    const { title, price, category, brand, size, condition, imageUrls, packageSize } = request.payload;
    return {
      summary: `Publier « ${title} » — ${formatEUR(price)}`,
      details: {
        title,
        price,
        category,
        brand,
        size,
        condition,
        photoCount: imageUrls.length,
        packageSize,
      },
    };
  },
};
