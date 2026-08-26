import { describe, expect, it } from 'vitest';
import { explainRepublishFailure } from '../republishOutcome';

// Mission "ROUND 5 -- RESULTAT D'UNE REPUBLICATION PROGRAMMEE" (2026-08-23).
// Regle explicite de l'utilisateur : le `error_message` brut ne doit pas
// forcement etre affiche tel quel -- message UX comprehensible + detail
// technique separe.
//
// Les entrees testees ci-dessous sont les VRAIS messages produits par la
// chaine d'execution (scheduledRepublishExecutor.ts,
// buildScheduledRepublishPayload, handlers/publishListing.ts), pas des
// messages inventes pour l'occasion.

describe('explainRepublishFailure', () => {
  it('ne renvoie jamais le message brut comme message principal', () => {
    const raw = "Annonce introuvable (supprimée depuis la programmation ?)";
    const result = explainRepublishFailure(raw);

    expect(result.message).not.toBe(raw);
    expect(result.message).toBe("L'annonce n'existe plus dans ResellOS.");
  });

  it('conserve TOUJOURS le brut en detail technique quand il existe', () => {
    const raw = 'HTTP 503';
    expect(explainRepublishFailure(raw).technicalDetail).toBe(raw);

    const unknown = 'ECONNRESET at socket layer';
    expect(explainRepublishFailure(unknown).technicalDetail).toBe(unknown);
  });

  describe('causes structurelles -> reprogrammer est inutile', () => {
    it.each([
      ["Annonce introuvable (supprimée depuis la programmation ?)", "L'annonce n'existe plus dans ResellOS."],
      ['Annonce sans identifiant Vinted -- republication impossible', "Cette annonce n'est pas liée à une annonce Vinted."],
      ['Compte Vinted introuvable (retiré depuis la programmation ?)', "Le compte Vinted associé n'est plus connecté."],
    ])('%s', (raw, expectedMessage) => {
      const result = explainRepublishFailure(raw);
      expect(result.message).toBe(expectedMessage);
      expect(result.canReschedule).toBe(false);
      expect(result.hint).toBeTruthy();
    });
  });

  describe("causes d'environnement -> reprogrammer a du sens", () => {
    it.each([
      'Onglet Vinted invalide',
      'Publication interrompue (onglet fermé)',
      "Délai dépassé : la modification n'a pas abouti",
      'HTTP 429',
      'HTTP 500',
    ])('%s', (raw) => {
      expect(explainRepublishFailure(raw).canReschedule).toBe(true);
    });
  });

  it("resultat inconnu (job orphelin recupere) : ne propose JAMAIS de reprogrammer", () => {
    // Message ecrit par republishScheduler.ts::recoverOrphanedRunningJobs.
    const raw =
      "Résultat inconnu : l'exécution s'est interrompue avant confirmation. Vérifie sur Vinted si l'annonce a été republiée avant d'en reprogrammer une.";
    const result = explainRepublishFailure(raw);

    expect(result.message).toBe('On ne sait pas si cette republication a abouti.');
    // Critique : l'annonce a PEUT-ETRE ete republiee. Reprogrammer creerait
    // un doublon reel -- une republication n'est pas idempotente.
    expect(result.canReschedule).toBe(false);
    expect(result.hint).toContain('Vérifie sur Vinted');
  });

  it('doublon potentiel : signale que la nouvelle annonce existe, mais ne propose PAS de reprogrammer', () => {
    const raw = "Nouvelle annonce créée mais suppression de l'ancienne non confirmée.";
    const result = explainRepublishFailure(raw);

    expect(result.message).toContain('nouvelle annonce a bien été créée');
    // Reprogrammer ici creerait un TROISIEME exemplaire de l'annonce.
    expect(result.canReschedule).toBe(false);
    expect(result.hint).toContain('doublon');
  });

  it('message inconnu -> message generique honnete, aucune cause inventee', () => {
    const result = explainRepublishFailure('kaboom 0x8007');

    expect(result.message).toBe("La republication n'a pas abouti.");
    expect(result.hint).toBeUndefined();
    expect(result.canReschedule).toBe(true);
    expect(result.technicalDetail).toBe('kaboom 0x8007');
  });

  it.each([null, undefined, '', '   '])('error_message vide (%s) -> generique, aucun detail technique', (raw) => {
    const result = explainRepublishFailure(raw);

    expect(result.message).toBe("La republication n'a pas abouti.");
    expect(result.technicalDetail).toBeUndefined();
    expect(result.canReschedule).toBe(true);
  });
});
