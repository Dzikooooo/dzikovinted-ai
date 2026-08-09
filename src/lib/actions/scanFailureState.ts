// P1-6 (Freeze Audit correctif) : etat terminal applique quand confirmAction()
// rejette pendant un scan (ex. l'ecriture action_log echoue -- voir
// useActionEngine.ts::updateHistoryRow) -- extrait en fonction pure pour
// etre teste independamment du rendu de Opportunities.tsx. Jamais de message
// technique brut affiche (meme discipline que errorMessages.ts).
export const SCAN_UNEXPECTED_ERROR_MESSAGE = "Le scan a rencontré une erreur inattendue. Réessaie dans quelques instants.";

export function buildScanFailureState(historyId: string | null) {
  return {
    historyId,
    done: true as const,
    error: SCAN_UNEXPECTED_ERROR_MESSAGE,
    opportunitiesFound: null,
    failedSearches: null,
  };
}
