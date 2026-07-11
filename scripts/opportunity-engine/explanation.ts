import type { RiskLevel, ScoreBreakdownEntry } from './types';

// Vocabulaire imposé (contrainte produit) : jamais de langage de certitude
// absolue ("Revente garantie", "Bénéfice assuré", "Achetez les yeux
// fermés"), toujours une formulation probabiliste traçable au moteur. Ce
// fichier est la seule source de phrasé généré - explanation.test.ts vérifie
// qu'aucune formulation interdite n'y apparaît jamais.
const RISK_LABEL: Record<RiskLevel, string> = {
  faible: 'faible',
  modere: 'modéré',
  eleve: 'élevé',
};

// Transforme le breakdown déjà calculé par scoring/confidence/risk en lignes
// de langage clair - aucune nouvelle logique de décision ici, uniquement du
// formatage sur des données déjà produites ailleurs.
export function buildChecklist(
  breakdown: ScoreBreakdownEntry[],
  meta: { score: number; confidence: number; riskLevel: RiskLevel; opportunityValidated: boolean }
): string[] {
  const lines: string[] = [];

  for (const entry of breakdown) {
    if (entry.kind === 'risk') {
      lines.push(`⚠ ${entry.label}`);
    } else if (entry.delta >= 0) {
      lines.push(`✓ ${entry.label}`);
    } else {
      lines.push(`⚠ ${entry.label}`);
    }
  }

  lines.push(`Confiance du modèle : ${meta.confidence}%`);
  lines.push(`Risque estimé : ${RISK_LABEL[meta.riskLevel]}`);

  if (meta.opportunityValidated) {
    lines.push('Opportunité validée par le moteur d\'analyse');
    if (meta.score >= 85 && meta.confidence >= 70 && meta.riskLevel === 'faible') {
      lines.push('Très forte probabilité de revente rentable');
    }
  }

  return lines;
}
