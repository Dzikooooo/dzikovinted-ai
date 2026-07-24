import { describe, expect, it } from 'vitest';
import { EDIT_STEP_ORDER, buildEditStepLabels, normalizeEditStepForDisplay } from '../editListingSteps';

// Finition UX (2026-07-21, apres validation complete du pipeline prix) :
// tests de non-regression pour ne jamais reintroduire "Import des photos"
// dans l'ecran d'edition (edit_listing ne touche jamais aux photos), et
// pour garder la fusion filling_form/publishing coherente si de nouveaux
// PublishStep sont ajoutes plus tard.
describe('EDIT_STEP_ORDER', () => {
  it('never includes uploading_photos (edit_listing ne touche jamais aux photos)', () => {
    expect(EDIT_STEP_ORDER).not.toContain('uploading_photos');
  });

  it('never includes filling_form directement (fusionne avec publishing)', () => {
    expect(EDIT_STEP_ORDER).not.toContain('filling_form');
  });

  it('includes verifying, specifique a edit_listing', () => {
    expect(EDIT_STEP_ORDER).toContain('verifying');
  });

  it('conserve un ordre chronologique coherent', () => {
    expect(EDIT_STEP_ORDER).toEqual(['preparing', 'connecting', 'publishing', 'verifying', 'syncing']);
  });
});

describe('normalizeEditStepForDisplay', () => {
  it('fusionne filling_form vers publishing (une seule ligne visible)', () => {
    expect(normalizeEditStepForDisplay('filling_form')).toBe('publishing');
  });

  it('laisse les autres etapes inchangees', () => {
    expect(normalizeEditStepForDisplay('preparing')).toBe('preparing');
    expect(normalizeEditStepForDisplay('connecting')).toBe('connecting');
    expect(normalizeEditStepForDisplay('publishing')).toBe('publishing');
    expect(normalizeEditStepForDisplay('verifying')).toBe('verifying');
    expect(normalizeEditStepForDisplay('syncing')).toBe('syncing');
  });
});

describe('buildEditStepLabels', () => {
  it('libelle "Mise à jour du prix…" quand seul le prix a change', () => {
    const labels = buildEditStepLabels(['price']);
    expect(labels.publishing).toBe('Mise à jour du prix…');
    expect(labels.filling_form).toBe('Mise à jour du prix…');
  });

  it('libelle generique quand plusieurs champs (ou un champ different) ont change', () => {
    const labels = buildEditStepLabels(['title', 'price']);
    expect(labels.publishing).toBe('Mise à jour de l’annonce…');
    const labelsTitleOnly = buildEditStepLabels(['title']);
    expect(labelsTitleOnly.publishing).toBe('Mise à jour de l’annonce…');
  });

  it('a un libelle non vide pour chaque etape du parcours edit_listing', () => {
    const labels = buildEditStepLabels(['price']);
    for (const step of EDIT_STEP_ORDER) {
      expect(labels[step]).toBeTruthy();
    }
  });
});
