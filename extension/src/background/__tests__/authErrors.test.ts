import { describe, expect, it } from 'vitest';
import { classifyRefreshFailure, SESSION_REVOKED_ERROR } from '../authErrors';

// Signale en beta : "AuthApiError: Invalid Refresh Token: Already Used".
//
// Ce classifieur decide entre "effacer l'appairage de l'utilisateur" et "ne
// rien faire et reessayer". Se tromper dans un sens force un re-appairage
// inutile ; se tromper dans l'autre laisse l'extension boucler sur un jeton
// mort. Les deux comptent, d'ou ces tests.

describe('erreurs DEFINITIVES -- le refresh token ne sera plus jamais accepte', () => {
  it("reconnait le message exact remonte en beta", () => {
    expect(classifyRefreshFailure({ message: 'Invalid Refresh Token: Already Used', status: 400 })).toBe('definitive');
  });

  it('reconnait le message meme sans statut HTTP', () => {
    expect(classifyRefreshFailure({ message: 'Invalid Refresh Token: Already Used' })).toBe('definitive');
  });

  it('reconnait le statut 400 meme sans message reconnaissable', () => {
    expect(classifyRefreshFailure({ message: 'quelque chose', status: 400 })).toBe('definitive');
  });

  it('reconnait les autres formulations de GoTrue', () => {
    for (const message of [
      'Refresh Token Not Found',
      'invalid_grant',
      'Token has expired or is invalid',
      'Session not found',
    ]) {
      expect(classifyRefreshFailure({ message })).toBe('definitive');
    }
  });

  it('est insensible a la casse', () => {
    expect(classifyRefreshFailure({ message: 'INVALID REFRESH TOKEN: ALREADY USED' })).toBe('definitive');
  });

  it('traite 401 et 403 comme definitifs', () => {
    expect(classifyRefreshFailure({ message: 'nope', status: 401 })).toBe('definitive');
    expect(classifyRefreshFailure({ message: 'nope', status: 403 })).toBe('definitive');
  });
});

describe('erreurs TRANSITOIRES -- la session doit etre CONSERVEE', () => {
  it('ne detruit pas la session sur une coupure reseau', () => {
    // Le cas vecu : une beta-testeuse hors reseau perdait son appairage pour
    // une cause qui aurait disparu d'elle-meme.
    expect(classifyRefreshFailure({ message: 'Failed to fetch' })).toBe('transient');
    expect(classifyRefreshFailure({ message: 'NetworkError when attempting to fetch resource' })).toBe('transient');
  });

  it('ne detruit pas la session sur une panne serveur', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyRefreshFailure({ message: 'Internal Server Error', status })).toBe('transient');
    }
  });

  it('ne detruit pas la session sur un 429', () => {
    // Trop de requetes ne dit RIEN sur la validite du jeton.
    expect(classifyRefreshFailure({ message: 'Too Many Requests', status: 429 })).toBe('transient');
  });

  it('classe en transitoire par defaut, y compris sans erreur du tout', () => {
    // Asymetrie assumee : garder une session peut-etre morte coute une
    // tentative de plus ; effacer une session vivante coute un re-appairage.
    expect(classifyRefreshFailure(null)).toBe('transient');
    expect(classifyRefreshFailure(undefined)).toBe('transient');
    expect(classifyRefreshFailure({})).toBe('transient');
    expect(classifyRefreshFailure({ message: null, status: null })).toBe('transient');
  });

  it('ne se laisse pas piéger par un message vaguement proche', () => {
    expect(classifyRefreshFailure({ message: 'refreshing listings failed' })).toBe('transient');
  });
});

describe('message remonte au popup', () => {
  it("porte un marqueur stable que popupErrorMessages sait traduire", () => {
    expect(SESSION_REVOKED_ERROR).toContain('session_revoked');
  });
});
