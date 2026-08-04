import { describe, expect, it } from 'vitest';
import {
  MANUAL_CLICK_TIMEOUT_MARKER,
  MANUAL_CLICK_TIMEOUT_MESSAGE,
  MANUAL_CLICK_HINT,
  isManualClickTimeout,
} from '../editListingManualClick';

// Robustesse du filtrage cote client (audit RC, 2026-08-05) : isole du
// composant pour verifier precisement quels messages sont reconnus comme
// "le clic manuel n'a pas ete detecte a temps", sans dependre du rendu.
describe('isManualClickTimeout', () => {
  it('reconnait le message reel produit par vinted-edit.ts::submitEdit', () => {
    const raw =
      'La page Vinted n\'a pas répondu à temps. Réessaie ; si le problème persiste, contacte le support. ' +
      '(waitForCondition: délai dépassé (60000ms) pour "navigation hors de /edit apres le clic utilisateur sur Valider ' +
      '(vers l\'article ou le profil vendeur -- PAS une preuve de sauvegarde reelle, juste que Vinted a redirige)")';
    expect(isManualClickTimeout(raw)).toBe(true);
  });

  it('ne reconnait pas un autre timeout edit_listing (ex. bouton jamais devenu cliquable)', () => {
    const raw =
      'waitForCondition: délai dépassé (8000ms) pour "bouton de sauvegarde devient cliquable (non disabled)"';
    expect(isManualClickTimeout(raw)).toBe(false);
  });

  it('ne reconnait pas les erreurs sans rapport (session expiree, marque verrouillee...)', () => {
    expect(isManualClickTimeout('Session Vinted expirée, reconnecte-toi sur vinted.fr')).toBe(false);
    expect(
      isManualClickTimeout(
        "Vinted ne permet pas de modifier la marque de cet article directement : il faut supprimer l'annonce puis la republier avec la nouvelle marque."
      )
    ).toBe(false);
  });

  it('gere null/undefined sans lever', () => {
    expect(isManualClickTimeout(null)).toBe(false);
    expect(isManualClickTimeout(undefined)).toBe(false);
    expect(isManualClickTimeout('')).toBe(false);
  });

  it('le marqueur reste un extrait litteral du message client', () => {
    expect(MANUAL_CLICK_TIMEOUT_MARKER.length).toBeGreaterThan(0);
  });
});

describe('constantes de copie', () => {
  it('MANUAL_CLICK_TIMEOUT_MESSAGE ne contient aucun detail technique', () => {
    expect(MANUAL_CLICK_TIMEOUT_MESSAGE).not.toMatch(/waitForCondition|ms\)|délai dépassé/i);
  });

  it('MANUAL_CLICK_HINT mentionne explicitement Valider', () => {
    expect(MANUAL_CLICK_HINT).toContain('Valider');
  });
});
