import type { OpportunityRiskLevel, Verdict } from './types';

// Seuils repris tels quels de scripts/opportunity-engine/constants.ts
// (MIN_SCORE_FOR_OPPORTUNITY, MIN_CONFIDENCE_FOR_OPPORTUNITY) et
// scripts/opportunity-engine/explanation.ts:38 (seuil "excellent" déjà
// utilisé pour "Très forte probabilité de revente rentable") - dupliqués
// ici avec la même valeur car scripts/ et src/ sont deux projets TS
// séparés (voir OpportunityRiskLevel, déjà dupliqué de la même façon
// entre scripts/opportunity-engine/types.ts et ce fichier - même
// précédent). Aucun de ces 4 nombres n'est nouveau ni arbitraire.
const MIN_SCORE_FOR_OPPORTUNITY = 65;
const MIN_CONFIDENCE_FOR_OPPORTUNITY = 50;
const EXCELLENT_SCORE = 85;
const EXCELLENT_CONFIDENCE = 70;

export function computeVerdict(
  score: number,
  confidence: number,
  riskLevel: OpportunityRiskLevel | null
): Verdict {
  if (riskLevel === 'eleve') return 'trop_risque';
  const validated = score >= MIN_SCORE_FOR_OPPORTUNITY && confidence >= MIN_CONFIDENCE_FOR_OPPORTUNITY;
  if (!validated) return 'a_surveiller';
  if (score >= EXCELLENT_SCORE && confidence >= EXCELLENT_CONFIDENCE && riskLevel === 'faible') return 'excellent';
  return 'recommande';
}

export const VERDICT_BADGES: Record<Verdict, { label: string; className: string }> = {
  excellent: { label: 'Excellente affaire', className: 'bg-neon-500 text-black' },
  recommande: {
    label: 'Achat recommandé',
    className: 'bg-neon-500/15 text-neon-500 border border-neon-500/30',
  },
  a_surveiller: {
    label: 'À surveiller',
    className: 'bg-amber-400/15 text-amber-400 border border-amber-400/30',
  },
  trop_risque: {
    label: 'Trop risqué',
    className: 'bg-red-400/15 text-red-400 border border-red-400/30',
  },
};
