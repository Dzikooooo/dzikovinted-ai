import { describe, expect, it } from 'vitest';
import { buildChecklist } from '../explanation';
import { FORBIDDEN_PHRASES } from '../constants';

describe('buildChecklist', () => {
  it('never contains any forbidden absolute-certainty phrase', () => {
    const breakdown = [
      { label: 'ROI exceptionnel (≥200%)', delta: 25, kind: 'score' as const },
      { label: 'Peu de données de marché disponibles', delta: -15, kind: 'risk' as const },
    ];
    const lines = buildChecklist(breakdown, { score: 95, confidence: 85, riskLevel: 'faible', opportunityValidated: true });
    const joined = lines.join(' \n ').toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(joined).not.toContain(phrase);
    }
  });

  it('marks positive breakdown entries with a checkmark and risk/negative entries with a warning', () => {
    const breakdown = [
      { label: 'Bon ROI', delta: 10, kind: 'score' as const },
      { label: 'Demande nettement inférieure à la catégorie', delta: -8, kind: 'score' as const },
      { label: 'Forte concurrence sur ce marché', delta: -6, kind: 'risk' as const },
    ];
    const lines = buildChecklist(breakdown, { score: 70, confidence: 60, riskLevel: 'modere', opportunityValidated: true });
    expect(lines).toContain('✓ Bon ROI');
    expect(lines).toContain('⚠ Demande nettement inférieure à la catégorie');
    expect(lines).toContain('⚠ Forte concurrence sur ce marché');
  });

  it('always states the confidence and risk level using the required vocabulary', () => {
    const lines = buildChecklist([], { score: 70, confidence: 60, riskLevel: 'eleve', opportunityValidated: true });
    expect(lines.some((l) => l.includes('Confiance du modèle : 60%'))).toBe(true);
    expect(lines.some((l) => l.includes('Risque estimé : élevé'))).toBe(true);
  });

  it('only claims "Opportunité validée" when the opportunity actually cleared the gate', () => {
    const lines = buildChecklist([], { score: 40, confidence: 30, riskLevel: 'eleve', opportunityValidated: false });
    expect(lines.some((l) => l.includes('validée'))).toBe(false);
  });

  it('only uses the strongest phrasing when score, confidence and risk all justify it', () => {
    const weak = buildChecklist([], { score: 70, confidence: 55, riskLevel: 'modere', opportunityValidated: true });
    expect(weak.some((l) => l.includes('Très forte probabilité'))).toBe(false);

    const strong = buildChecklist([], { score: 90, confidence: 80, riskLevel: 'faible', opportunityValidated: true });
    expect(strong.some((l) => l.includes('Très forte probabilité de revente rentable'))).toBe(true);
  });
});
