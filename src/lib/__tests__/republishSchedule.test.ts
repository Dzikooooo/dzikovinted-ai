import { describe, expect, it } from 'vitest';
import {
  formatScheduleLabel,
  isDateInPast,
  isoToLocalDateTime,
  isScheduleValid,
  isTimeInPastToday,
  localDateTimeToISO,
} from '../republishSchedule';

const NOW = new Date('2026-08-20T15:00:00');

describe('isDateInPast', () => {
  it('refuse une date strictement anterieure a aujourd\'hui', () => {
    expect(isDateInPast('2026-08-19', NOW)).toBe(true);
  });

  it('accepte aujourd\'hui', () => {
    expect(isDateInPast('2026-08-20', NOW)).toBe(false);
  });

  it('accepte une date future', () => {
    expect(isDateInPast('2026-08-21', NOW)).toBe(false);
  });
});

describe('isTimeInPastToday', () => {
  it('refuse une heure deja passee quand la date choisie est aujourd\'hui', () => {
    expect(isTimeInPastToday('2026-08-20', '14:30', NOW)).toBe(true);
  });

  it('accepte une heure future quand la date choisie est aujourd\'hui', () => {
    expect(isTimeInPastToday('2026-08-20', '19:30', NOW)).toBe(false);
  });

  it('n\'est jamais applicable pour une date future -- aucune heure "passee" possible', () => {
    expect(isTimeInPastToday('2026-08-21', '00:00', NOW)).toBe(false);
  });
});

describe('isScheduleValid', () => {
  it('refuse une date/heure manquante', () => {
    expect(isScheduleValid(null, null, NOW)).toBe(false);
    expect(isScheduleValid('2026-08-21', null, NOW)).toBe(false);
    expect(isScheduleValid(null, '19:30', NOW)).toBe(false);
  });

  it('refuse une date passee', () => {
    expect(isScheduleValid('2026-08-19', '19:30', NOW)).toBe(false);
  });

  it('refuse une heure deja passee aujourd\'hui', () => {
    expect(isScheduleValid('2026-08-20', '10:00', NOW)).toBe(false);
  });

  it('accepte une date+heure future valide', () => {
    expect(isScheduleValid('2026-08-25', '19:30', NOW)).toBe(true);
  });

  it('accepte aujourd\'hui avec une heure future', () => {
    expect(isScheduleValid('2026-08-20', '19:30', NOW)).toBe(true);
  });
});

describe('formatScheduleLabel', () => {
  it('formate en francais, ex. "25 août 2026 à 19:30"', () => {
    expect(formatScheduleLabel('2026-08-25', '19:30')).toBe('25 août 2026 à 19:30');
  });

  it('gere un jour a un seul chiffre sans zero superflu', () => {
    expect(formatScheduleLabel('2026-01-05', '08:00')).toBe('5 janvier 2026 à 08:00');
  });
});

// Mission "ROUND 2 -- PERSISTANCE APP" (2026-08-20) : republish_schedules.scheduled_for
// est un timestamptz -- ces deux fonctions sont le SEUL point de conversion
// entre l'heure locale saisie dans l'UI et l'ISO stocke en base (voir leur
// en-tete). Teste la propriete de round-trip (independante du fuseau horaire
// reel de la machine qui execute les tests) plutot que de figer une valeur
// UTC attendue, qui varierait selon le fuseau du runner.
describe('localDateTimeToISO / isoToLocalDateTime', () => {
  it('round-trip : date/heure locale -> ISO -> date/heure locale redonne exactement les memes valeurs', () => {
    const iso = localDateTimeToISO('2026-08-25', '19:30');
    expect(isoToLocalDateTime(iso)).toEqual({ date: '2026-08-25', time: '19:30' });
  });

  it('produit une chaine ISO reelle (parsable, jamais une concatenation naive avec Z)', () => {
    const iso = localDateTimeToISO('2026-01-05', '08:00');
    expect(new Date(iso).toISOString()).toBe(iso); // forme canonique ISO valide
    // Une concatenation naive ("2026-01-05T08:00:00Z") supposerait a tort
    // que l'heure locale saisie EST deja de l'UTC -- des que le fuseau local
    // du runner n'est pas UTC+0, l'ISO reel doit differer de cette
    // concatenation. En UTC+0 (CI typique), l'egalite serait une
    // coincidence attendue, pas une preuve du bug -- le test ne s'applique
    // donc que hors UTC+0.
    const isRunnerUTC = new Date(2026, 0, 5, 8, 0).getTimezoneOffset() === 0;
    if (!isRunnerUTC) {
      expect(iso).not.toBe('2026-01-05T08:00:00.000Z');
    }
  });

  it('gere les bornes horaires (minuit, fin de journee, fin d\'annee)', () => {
    expect(isoToLocalDateTime(localDateTimeToISO('2026-12-31', '23:55'))).toEqual({ date: '2026-12-31', time: '23:55' });
    expect(isoToLocalDateTime(localDateTimeToISO('2026-01-01', '00:00'))).toEqual({ date: '2026-01-01', time: '00:00' });
  });
});
