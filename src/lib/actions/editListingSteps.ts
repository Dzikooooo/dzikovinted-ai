import type { PublishStep } from './publishSteps';
import type { EditableFieldName } from './handlers/editListing';

// Ecran de progression specifique a edit_listing (finition UX demandee le
// 2026-07-21, apres validation complete du pipeline prix). Reutilise le
// canal PublishStep deja partage avec l'extension, mais avec un affichage
// different de publish_listing sur deux points :
// 1. jamais "Import des photos" -- edit_listing ne touche jamais aux
//    photos (limite V1 documentee dans EditListingPayload), contrairement a
//    publish_listing qui les televerse toujours.
// 2. filling_form et publishing (deux etapes techniques distinctes cote
//    extension : remplissage du champ, puis clic+navigation) sont
//    fusionnees en UNE seule ligne visible ("Mise à jour...") -- du point
//    de vue de l'utilisateur c'est une seule action, pas deux.
export const EDIT_STEP_ORDER: PublishStep[] = ['preparing', 'connecting', 'publishing', 'verifying', 'syncing'];

// filling_form n'apparait jamais dans EDIT_STEP_ORDER (fusionne avec
// publishing, voir ci-dessus) -- sans cette normalisation, le calcul de
// ligne active dans PublishProgressModal.buildRows() ne le trouverait pas
// dans l'ordre et n'activerait aucune ligne pendant cette etape (~1-2s,
// bref mais visible).
export function normalizeEditStepForDisplay(step: PublishStep): PublishStep {
  return step === 'filling_form' ? 'publishing' : step;
}

// "Mise à jour du prix" est le libelle exact demande pour le cas
// price-only, seul champ dont le pipeline d'edition est valide de bout en
// bout a ce jour (voir plan). Les autres champs (titre, description...)
// n'ont pas encore ete testes en conditions reelles -- libelle generique en
// attendant, plutot que de promettre une precision non encore verifiee.
export function buildEditStepLabels(changedFields: EditableFieldName[]): Record<PublishStep, string> {
  const updatingLabel = changedFields.length === 1 && changedFields[0] === 'price' ? 'Mise à jour du prix…' : 'Mise à jour de l’annonce…';
  return {
    preparing: 'Préparation…',
    connecting: 'Connexion à Vinted…',
    uploading_photos: 'Import des photos…', // jamais affiche (absent de EDIT_STEP_ORDER)
    filling_form: updatingLabel, // jamais affiche directement (normalise vers "publishing")
    publishing: updatingLabel,
    verifying: 'Vérification…',
    syncing: 'Synchronisation…',
  };
}
