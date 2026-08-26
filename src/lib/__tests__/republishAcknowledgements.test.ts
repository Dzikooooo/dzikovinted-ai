// @vitest-environment jsdom
// (convention du projet, voir vitest.config.ts : environnement 'node' par
// defaut, jsdom uniquement pour les rares fichiers qui ont besoin d'une API
// navigateur -- ici localStorage.)
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { acknowledgeSchedule, getAcknowledgedScheduleIds } from '../republishAcknowledgements';

// Mission "ROUND 5 -- RESULTAT D'UNE REPUBLICATION PROGRAMMEE" (2026-08-23).
// L'acquittement est LOCAL (localStorage, aucune migration ce round) -- ces
// tests verrouillent surtout la robustesse : localStorage peut lever
// (navigation privee, quota, storage desactive) et ceci ne doit JAMAIS
// casser l'affichage des annonces.

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('republishAcknowledgements', () => {
  it('aucun acquittement au depart', () => {
    expect(getAcknowledgedScheduleIds().size).toBe(0);
  });

  it('acquitte puis relit', () => {
    acknowledgeSchedule('s1');
    acknowledgeSchedule('s2');

    const ids = getAcknowledgedScheduleIds();
    expect(ids.has('s1')).toBe(true);
    expect(ids.has('s2')).toBe(true);
    expect(ids.has('s3')).toBe(false);
  });

  it('acquitter deux fois le meme id ne le duplique pas', () => {
    acknowledgeSchedule('s1');
    acknowledgeSchedule('s1');

    expect(getAcknowledgedScheduleIds().size).toBe(1);
  });

  it('borne la liste a 200 entrees en gardant les PLUS RECENTES', () => {
    for (let i = 0; i < 205; i++) acknowledgeSchedule(`s${i}`);

    const ids = getAcknowledgedScheduleIds();
    expect(ids.size).toBe(200);
    // Les plus anciennes sont tombees, la derniere est conservee.
    expect(ids.has('s0')).toBe(false);
    expect(ids.has('s204')).toBe(true);
  });

  it('contenu corrompu -> repart de zero plutot que de lever', () => {
    localStorage.setItem('resellos:republishAcknowledged', 'pas du json');
    expect(getAcknowledgedScheduleIds().size).toBe(0);

    localStorage.setItem('resellos:republishAcknowledged', '{"pas":"un tableau"}');
    expect(getAcknowledgedScheduleIds().size).toBe(0);
  });

  it('entrees non-string ignorees', () => {
    localStorage.setItem('resellos:republishAcknowledged', JSON.stringify(['s1', 42, null, 's2']));

    const ids = getAcknowledgedScheduleIds();
    expect(ids.size).toBe(2);
    expect(ids.has('s1')).toBe(true);
    expect(ids.has('s2')).toBe(true);
  });

  it('localStorage qui leve en ECRITURE -> aucune exception propagee', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => acknowledgeSchedule('s1')).not.toThrow();
  });

  it('localStorage qui leve en LECTURE -> ensemble vide, aucune exception', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => getAcknowledgedScheduleIds()).not.toThrow();
    expect(getAcknowledgedScheduleIds().size).toBe(0);
  });
});
