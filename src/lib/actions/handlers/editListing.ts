import {
  checkAccountSelected,
  checkAuthenticated,
  checkEditSandboxOnly,
  checkExtensionConnected,
  checkListingAlreadyPublished,
  checkListingLoaded,
  checkListingOwnership,
} from '../checks';
import type { ActionDefinition } from '../types';

// Duplique la forme de EditListingPayload (extension/src/lib/messages.ts) --
// meme convention de duplication assumee que pour PublishListingPayload
// (voir EXTENSION.md §9). Pas de photos ni de packageSize : limite V1
// validee avec l'utilisateur (modification = champs texte/attributs
// uniquement, le remplacement de photo sur le formulaire d'edition Vinted
// n'est pas verifie en direct).
export interface EditListingPayload {
  vintedItemId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  brand: string | null;
  size: string | null;
  condition: string;
  color: string | null;
  material: string | null;
  expectedVintedUsername: string;
}

// execute() volontairement absent, meme raison que publishListingDefinition :
// passe par deps.runViaExtension() (voir engine.ts).
export const editListingDefinition: ActionDefinition<EditListingPayload> = {
  kind: 'edit_listing',
  label: 'Mettre à jour sur Vinted',
  checks: [
    checkAuthenticated,
    checkExtensionConnected,
    checkAccountSelected,
    checkListingLoaded,
    checkListingOwnership,
    checkListingAlreadyPublished,
    // GARDE TEMPORAIRE (voir checks.ts::checkEditSandboxOnly) -- a retirer
    // proprement (cette ligne + l'import + la fonction dans checks.ts)
    // une fois le pipeline edit_listing valide de bout en bout.
    checkEditSandboxOnly,
  ],
  buildPreview: (request) => {
    const { title, price, category, brand, size, condition } = request.payload;
    return {
      summary: `Mettre à jour « ${title} » — ${price.toFixed(2)} €`,
      details: { title, price, category, brand, size, condition },
    };
  },
};
