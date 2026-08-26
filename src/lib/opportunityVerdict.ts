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
  excellent: { label: 'Excellente affaire', className: 'bg-neon-600 text-white' },
  recommande: {
    label: 'Achat recommandé',
    className: 'bg-neon-500/15 text-neon-500 border border-neon-500/30',
  },
  a_surveiller: {
    label: 'À surveiller',
    // amber-700 et non amber-400 : sur son propre fond a 15 % (#fef7dc), le
    // amber-400 herite du theme sombre ne mesure que 1.43:1 -- illisible.
    // amber-700 y mesure 4.68:1. Le fond, purement decoratif, ne change pas.
    className: 'bg-amber-400/15 text-amber-700 border border-amber-400/30',
  },
  trop_risque: {
    label: 'Trop risqué',
    className: 'bg-red-400/15 text-red-700 border border-red-400/30',
  },
};
