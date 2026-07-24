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
  // "verifying" (2026-07-21) : specifique a edit_listing (phase de
  // relecture post-sauvegarde, voir extension/src/background/handlers/
  // editListing.ts) -- jamais rapportee par publish_listing, donc absente
  // de PUBLISH_STEP_ORDER (l'ecran de publication ne l'affiche pas), mais
  // doit rester une valeur reconnue par isPublishStep pour que le canal de
  // progression partage la laisse passer jusqu'a StockPage.tsx.
  | 'verifying'
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
  publishing: 'En attente de confirmation Vinted…',
  verifying: 'Vérification…',
  syncing: 'Synchronisation…',
};

// Distinct de PUBLISH_STEP_ORDER (qui ne sert qu'a decider l'ordre/etat des
// lignes de l'ecran de PUBLICATION) -- valide TOUTE valeur PublishStep
// reconnue, y compris "verifying" qu'edit_listing seul rapporte. Sans cette
// distinction, isPublishStep('verifying') aurait renvoye false et
// StockPage.tsx aurait silencieusement ignore cette etape de progression.
const ALL_PUBLISH_STEPS: PublishStep[] = [
  'preparing',
  'connecting',
  'uploading_photos',
  'filling_form',
  'publishing',
  'verifying',
  'syncing',
];

export function isPublishStep(value: string): value is PublishStep {
  return (ALL_PUBLISH_STEPS as string[]).includes(value);
}
