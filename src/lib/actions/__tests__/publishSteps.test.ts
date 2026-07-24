import { describe, expect, it } from 'vitest';
import { PUBLISH_STEP_LABELS, PUBLISH_STEP_ORDER, isPublishStep } from '../publishSteps';

// Finition UX (2026-07-21) : "verifying" a ete ajoute specifiquement pour
// edit_listing (voir editListing.ts cote extension) mais NE DOIT PAS
// apparaitre dans l'ecran de publish_listing, qui ne le rapporte jamais --
// sans ce garde-fou, un futur refactor pourrait par erreur re-fusionner
// PUBLISH_STEP_ORDER et la liste de validation, faisant reapparaitre une
// ligne "Vérification" vide et jamais activee sur l'ecran de publication.
describe('PUBLISH_STEP_ORDER', () => {
  it('ne contient jamais "verifying" (specifique a edit_listing)', () => {
    expect(PUBLISH_STEP_ORDER).not.toContain('verifying');
  });

  it('a un libelle non vide pour chaque etape', () => {
    for (const step of PUBLISH_STEP_ORDER) {
      expect(PUBLISH_STEP_LABELS[step]).toBeTruthy();
    }
  });
});

describe('isPublishStep', () => {
  it('reconnait "verifying" comme une valeur valide (canal de progression partage)', () => {
    // Distinct de PUBLISH_STEP_ORDER : si isPublishStep validait seulement
    // contre PUBLISH_STEP_ORDER, StockPage.tsx ignorerait silencieusement
    // la progression "verifying" rapportee par edit_listing.
    expect(isPublishStep('verifying')).toBe(true);
  });

  it('reconnait toutes les valeurs de PUBLISH_STEP_ORDER', () => {
    for (const step of PUBLISH_STEP_ORDER) {
      expect(isPublishStep(step)).toBe(true);
    }
  });

  it('rejette une valeur inconnue', () => {
    expect(isPublishStep('not_a_real_step')).toBe(false);
  });
});
