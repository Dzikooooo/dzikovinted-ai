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

// Champs Vinted editables pouvant chacun etre modifie independamment --
// duplique dans extension/src/lib/messages.ts (meme convention).
export type EditableFieldName =
  | 'title'
  | 'description'
  | 'price'
  | 'category'
  | 'brand'
  | 'size'
  | 'condition'
  | 'color'
  | 'material';

// Duplique la forme de EditListingPayload (extension/src/lib/messages.ts) --
// meme convention de duplication assumee que pour PublishListingPayload
// (voir EXTENSION.md §9). Pas de photos ni de packageSize : limite V1
// validee avec l'utilisateur (modification = champs texte/attributs
// uniquement, le remplacement de photo sur le formulaire d'edition Vinted
// n'est pas verifie en direct).
//
// BUG REEL trouve en test reel le 2026-07-16 : le pipeline traitait
// TOUJOURS les 9 champs, meme quand un seul avait reellement change (ex.
// prix seul) -- le formulaire d'edition d'une annonce a deja une categorie
// definie, donc resolveCategory() ouvrait le panneau categorie et
// attendait son contenu meme pour un simple changement de prix, bloquant
// le pipeline sur un selecteur jamais necessaire pour ce test
// ("[data-testid=catalog-select-dropdown-content]" jamais peuple/ouvert
// correctement dans ce contexte). `changedFields` (calcule cote
// EditListingModal.tsx en comparant le formulaire a l'annonce d'origine,
// AVANT toute fusion) dit precisement quels champs ont reellement change
// -- vinted-edit.ts ne touche/n'attend plus QUE ceux-la, jamais les
// autres, meme si leur valeur "actuelle" est presente dans le payload
// (necessaire pour reconstruire les champs textuels comme le titre avec
// SKU).
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
  changedFields: EditableFieldName[];
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
