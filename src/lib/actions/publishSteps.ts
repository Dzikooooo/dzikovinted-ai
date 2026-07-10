// Duplique PublishStep depuis extension/src/lib/messages.ts (meme
// convention de duplication assumee que pour ActionKind - voir
// EXTENSION.md §9). Ordre et libellés exacts demandés par l'utilisateur
// pour l'écran de progression (étape 10 du workflow) : "Préparation...
// Connexion... Import des photos... Remplissage... Publication...
// Synchronisation... Terminé."
export type PublishStep =
  | 'preparing'
  | 'connecting'
  | 'uploading_photos'
  | 'filling_form'
  | 'publishing'
  | 'syncing';

export const PUBLISH_STEP_ORDER: PublishStep[] = [
  'preparing',
  'connecting',
  'uploading_photos',
  'filling_form',
  'publishing',
  'syncing',
];

export const PUBLISH_STEP_LABELS: Record<PublishStep, string> = {
  preparing: 'Préparation…',
  connecting: 'Connexion…',
  uploading_photos: 'Import des photos…',
  filling_form: 'Remplissage…',
  publishing: 'Publication…',
  syncing: 'Synchronisation…',
};

export function isPublishStep(value: string): value is PublishStep {
  return (PUBLISH_STEP_ORDER as string[]).includes(value);
}
