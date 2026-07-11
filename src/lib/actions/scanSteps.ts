// Vocabulaire d'etapes propre a scan_market, meme convention que
// publishSteps.ts (PublishStep) - une action avec un execute() dedie a ses
// propres etapes plutot que de forcer l'ActionStep generique de types.ts.
// La Edge Function supabase/functions/scan-market/index.ts ecrit ces
// valeurs telles quelles dans action_log_entries.step (colonne text libre).
export type ScanStep =
  | 'connecting'
  | 'searching'
  | 'analyzing'
  | 'ranking'
  | 'saving';

export const SCAN_STEP_ORDER: ScanStep[] = [
  'connecting',
  'searching',
  'analyzing',
  'ranking',
  'saving',
];

export const SCAN_STEP_LABELS: Record<ScanStep, string> = {
  connecting: 'Connexion…',
  searching: 'Recherche…',
  analyzing: 'Analyse…',
  ranking: 'Classement…',
  saving: 'Enregistrement…',
};

export function isScanStep(value: string): value is ScanStep {
  return (SCAN_STEP_ORDER as string[]).includes(value);
}
